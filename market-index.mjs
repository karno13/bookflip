// @ts-check
// Indeks rynku: for every edition, what a used copy resells for (market-valuation.mjs), how likely
// a listed copy is to sell within 30 days and how long that usually takes. Liquidity comes from
// Vinted, the resale channel: every Vinted listing of the edition is time on the market ("offer
// days", from first seen to sold / withdrawn / now) and a sale is an event. Sales per offer day is
// the edition's sale rate; editions with few listings borrow strength from editions with similar
// demand (the median favourite count of their listings), so one lucky sale is not "fast".
// Measured on saved data (2026-11-20, 2 364 listings, 151 sales, 23 388 offer days): 14-day sale
// chance 6.3% at demand 0–3, 12.9% at 8 or more; 2.1% for a listing with no favourite, 11.8% at 10+.
import { editionCovers } from './catalog-api.mjs';
import { marketValuations } from './market-valuation.mjs';
import { firstSurname, mainTitle } from './work-grouping.mjs';
import { fold } from './title-proposals.mjs';
import { isbnKeys } from './isbn-normalization.mjs';

const DAY = 86_400_000;
/** Strength of the demand prior, in offer days: about ten listings watched for ten days. */
export const PRIOR_OFFER_DAYS = 100;
/** The horizon of the sale chance, in days. */
export const HORIZON_DAYS = 30;
/** Sale chance in the horizon from which an edition counts as fast, below which as slow. */
export const LIQUIDITY_LEVELS = { fast: 0.25, slow: 0.13 };
const GONE = new Set(['sold', 'unavailable', 'reserved']);
/** Off the listings without a known reason: not live, and its time on the market ends when it was last seen. */
const VANISHED = 'not_seen';

/** @param {number[]} values */
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
/** Demand bucket from the median favourite count of an edition's listings (null: no data). */
export function demandBucket(favourites) {
  if (favourites.length < 2) return 'none';
  const value = Number(median(favourites));
  return value >= 8 ? 'high' : value >= 4 ? 'medium' : 'low';
}

/**
 * @typedef {{ sales: number, days: number, listings: number, live: number, favourites: number[] }} EditionMarket
 * @typedef {{ at: number, global: { sales: number, days: number }, buckets: Record<string, { sales: number, days: number }>, editions: Map<string, EditionMarket> }} LiquidityModel
 */

/**
 * The sale-rate model from every Vinted listing matched to an edition.
 * @param {import('node:sqlite').DatabaseSync} database
 * @returns {LiquidityModel}
 */
export function liquidityModel(database, at = Date.now()) {
  const rows = database
    .prepare(
      `SELECT m.edition_id AS editionId, o.availability, o.first_seen_at AS firstSeenAt,
         o.availability_changed_at AS changedAt, o.last_seen_at AS lastSeenAt, o.favourite_count AS favourites
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id
       WHERE m.status='active' AND o.source='Vinted' AND o.first_seen_at IS NOT NULL`,
    )
    .all();
  /** @type {Map<string, EditionMarket>} */
  const editions = new Map();
  for (const row of rows) {
    const id = String(row.editionId);
    const item = editions.get(id) ?? { sales: 0, days: 0, listings: 0, live: 0, favourites: [] };
    editions.set(id, item);
    const availability = String(row.availability);
    const closedAt = GONE.has(availability)
      ? row.changedAt
      : availability === VANISHED
        ? row.lastSeenAt
        : null;
    const parsedEnd = closedAt ? Date.parse(String(closedAt)) : NaN;
    const end = Number.isFinite(parsedEnd) ? parsedEnd : at;
    const start = Date.parse(String(row.firstSeenAt));
    // An unreadable first-seen time cannot say how long the listing was up: skip its days.
    if (Number.isFinite(start)) item.days += Math.max(0.5, (end - start) / DAY);
    item.listings += 1;
    if (availability === 'sold') item.sales += 1;
    if (!GONE.has(availability) && availability !== VANISHED) item.live += 1;
    if (row.favourites != null) item.favourites.push(Number(row.favourites));
  }
  const global = { sales: 0, days: 0 };
  /** @type {Record<string, { sales: number, days: number }>} */
  const buckets = {};
  for (const item of editions.values()) {
    global.sales += item.sales;
    global.days += item.days;
    const bucket = (buckets[demandBucket(item.favourites)] ??= { sales: 0, days: 0 });
    bucket.sales += item.sales;
    bucket.days += item.days;
  }
  return { at, global, buckets, editions };
}

/**
 * Liquidity of one edition: sale rate per listing day, the chance to sell within 30 days and the
 * median days to a sale. An edition with no Vinted listing gets its demand bucket's (or the
 * market's) figures with basis 'market'.
 * @param {LiquidityModel} model
 * @param {string} editionId
 */
export function editionLiquidity(model, editionId) {
  const own = model.editions.get(editionId) ?? {
    sales: 0,
    days: 0,
    listings: 0,
    live: 0,
    favourites: [],
  };
  const demand = demandBucket(own.favourites);
  // Without favourites the market as a whole is the prior: the "none" bucket is biased fast (a
  // listing sold before its page was read has no favourite count).
  const bucket = demand === 'none' ? null : model.buckets[demand];
  const prior = bucket && bucket.days >= PRIOR_OFFER_DAYS ? bucket : model.global;
  const priorRate = prior.days ? prior.sales / prior.days : 0;
  const rate = (own.sales + priorRate * PRIOR_OFFER_DAYS) / (own.days + PRIOR_OFFER_DAYS);
  const chance = 1 - Math.exp(-HORIZON_DAYS * rate);
  return {
    chance: Math.round(chance * 1000) / 1000,
    medianDays: rate > 0 ? Math.min(365, Math.round(Math.LN2 / rate)) : null,
    level:
      chance >= LIQUIDITY_LEVELS.fast ? 'fast' : chance < LIQUIDITY_LEVELS.slow ? 'slow' : 'normal',
    sales: own.sales,
    listings: own.listings,
    live: own.live,
    demand,
    demandMedian: own.favourites.length >= 2 ? median(own.favourites) : null,
    basis: own.sales >= 2 ? 'own' : own.listings ? 'mixed' : 'market',
  };
}

const SORTS = {
  // What a listed copy is expected to bring in within 30 days: value × chance to sell.
  turnover: (a, b) => b.turnover - a.turnover || b.value - a.value,
  liquidity: (a, b) => b.liquidity.chance - a.liquidity.chance || b.turnover - a.turnover,
  value: (a, b) => b.value - a.value,
  supply: (a, b) => b.liquidity.live - a.liquidity.live || b.turnover - a.turnover,
};

/**
 * The index: editions with a valuation, their liquidity and turnover, in the chosen order.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {{ sort?: string, limit?: number|string, offset?: number|string, query?: string, confidence?: string, at?: number }} [options]
 */
export function marketIndex(repository, options = {}) {
  const database = repository.database;
  const at = options.at ?? Date.now();
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  const offset = Math.max(0, Number(options.offset) || 0);
  const needle = fold(options.query ?? '');
  const rows = database
    .prepare(
      `SELECT e.id AS editionId, e.title AS editionTitle, e.publisher, e.publication_year AS year,
         w.id AS workId, w.title AS workTitle, w.authors_json AS authors
       FROM editions e JOIN works w ON w.id=e.work_id
       WHERE e.is_unknown=0
         AND NOT EXISTS (SELECT 1 FROM catalog_work_merges cm WHERE cm.source_id=w.id)
         AND NOT EXISTS (SELECT 1 FROM removed_works rw WHERE rw.work_id=w.id)
         AND EXISTS (SELECT 1 FROM offer_matches m WHERE m.edition_id=e.id AND m.status='active')`,
    )
    .all()
    .filter(
      (row) =>
        !needle || fold(`${row.workTitle} ${row.editionTitle} ${row.authors}`).includes(needle),
    );
  const valuations = marketValuations(
    database,
    'edition',
    rows.map((row) => String(row.editionId)),
    at,
  );
  const model = liquidityModel(database, at);
  const wanted = options.confidence === 'medium' ? ['medium', 'high'] : null;
  const items = [];
  for (const row of rows) {
    const valuation = valuations.get(String(row.editionId));
    if (!valuation || valuation.estimate == null) continue;
    if (wanted && !wanted.includes(valuation.confidence)) continue;
    const liquidity = editionLiquidity(model, String(row.editionId));
    let authors = [];
    try {
      authors = JSON.parse(String(row.authors || '[]'));
    } catch {}
    items.push({
      editionId: String(row.editionId),
      workId: String(row.workId),
      title: String(row.workTitle),
      editionTitle: String(row.editionTitle),
      authors,
      publisher: row.publisher ?? null,
      year: row.year ?? null,
      value: valuation.estimate,
      low: valuation.low,
      high: valuation.high,
      confidence: valuation.confidence,
      confidenceLabel: valuation.confidenceLabel,
      sold: valuation.sold,
      liquidity,
      turnover: Math.round((valuation.estimate * liquidity.chance) / 100) * 100,
    });
  }
  items.sort(SORTS[String(options.sort)] ?? SORTS.turnover);
  const page = items.slice(offset, offset + limit);
  const covers = editionCovers(
    database,
    page.map((item) => item.editionId),
  );
  return {
    total: items.length,
    limit,
    offset,
    market: {
      listings: [...model.editions.values()].reduce((sum, item) => sum + item.listings, 0),
      sales: model.global.sales,
      chance: model.global.days
        ? Math.round(
            (1 - Math.exp((-HORIZON_DAYS * model.global.sales) / model.global.days)) * 1000,
          ) / 1000
        : null,
    },
    items: page.map((item) => ({ ...item, cover: covers.get(item.editionId) ?? null })),
  };
}

/** A search phrase for a work: its main title, with the author's surname when the title is one word. */
export function sniperPhrase(title, authors) {
  // The words a seller writes: the main title up to a subtitle, a cycle or a volume, at most four.
  const main = mainTitle(title)
    .split(/\s+(?:cykl|seria|tom|t\.|część|cz\.)\s+|\.\s|:|\s[-–—]\s|\(|,/i)[0]
    .replace(/["„”«»]/g, '')
    .replace(/[.\s]+$/, '')
    .split(/\s+/)
    .slice(0, 4)
    .join(' ')
    .trim();
  const words = fold(main).split(' ').filter(Boolean);
  if (!words.length) return '';
  const surname = firstSurname(authors);
  return words.length === 1 && surname && !words.includes(surname)
    ? `${main} ${surname[0].toUpperCase()}${surname.slice(1)}`
    : main;
}

/**
 * Phrases learned from the work's own listings: a one-word title gets the author's surname
 * („Mort Pratchett”), but Warcraft sellers write the universe instead („Warcraft Durotan”). When the
 * work has a universe (edition_series) and at least MIN_LEARN_TITLES Vinted listings assigned by
 * ISBN, „word + universe word” replaces „word + surname” if it covers clearly more of them (at least
 * 2 and 10% more). On the catalogue copy (2026-11-23): Durotan 15 → 49 of 54 listings, Illidan
 * 21 → 35 of 44; all phrases 82% → 84% of 2 100 listings. Work id → phrase, only the changed ones.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function learnedPhrases(repository) {
  const database = repository.database;
  const universes = new Map(
    database
      .prepare(
        `SELECT e.work_id AS workId, json_group_array(DISTINCT s.name) AS names FROM edition_series s JOIN editions e ON e.id=s.edition_id
         WHERE s.kind='universe' GROUP BY 1`,
      )
      .all()
      .map((/** @type {any} */ row) => [
        String(row.workId),
        /** @type {string[]} */ (JSON.parse(String(row.names))),
      ]),
  );
  /** @type {Map<string, { title: string, authors: string, listings: string[] }>} */
  const works = new Map();
  for (const row of /** @type {any[]} */ (
    database
      .prepare(
        `SELECT w.id AS workId, w.title, w.authors_json AS authors, o.original_title AS listing
         FROM offer_matches m JOIN offers o ON o.id=m.offer_id JOIN editions e ON e.id=m.edition_id JOIN works w ON w.id=e.work_id
         WHERE m.status='active' AND o.source='Vinted'`,
      )
      .all()
  )) {
    const id = String(row.workId);
    if (!universes.has(id)) continue;
    const work = works.get(id) ?? {
      title: String(row.title),
      authors: String(row.authors || '[]'),
      listings: [],
    };
    work.listings.push(String(row.listing ?? ''));
    works.set(id, work);
  }
  const covers = (/** @type {string} */ phrase, /** @type {string[]} */ listings) => {
    const words = fold(phrase)
      .split(' ')
      .filter((word) => word.length > 1);
    return listings.filter((listing) => {
      const have = new Set(fold(listing).split(' '));
      return words.every((word) => have.has(word));
    }).length;
  };
  /** @type {Map<string, string>} */
  const learned = new Map();
  for (const [id, work] of works) {
    if (work.listings.length < MIN_LEARN_TITLES) continue;
    let authors = [];
    try {
      authors = JSON.parse(work.authors);
    } catch {}
    const base = sniperPhrase(work.title, authors);
    const parts = base.split(' ');
    // Only the one-word-title-plus-surname phrases have a surname to swap.
    if (parts.length !== 2 || fold(mainTitle(work.title)).split(' ').filter(Boolean).length !== 1)
      continue;
    // Every universe of the work is tried (a work can carry „Warcraft” and „World of Warcraft”).
    const baseCovers = covers(base, work.listings);
    let best = null;
    let bestCovers = baseCovers;
    for (const name of universes.get(id) ?? []) {
      const universeWord = String(name).split(/\s+/).pop() ?? '';
      if (!universeWord || fold(universeWord) === fold(parts[0])) continue;
      const candidate = `${parts[0]} ${universeWord}`;
      const count = covers(candidate, work.listings);
      if (count > bestCovers) {
        best = candidate;
        bestCovers = count;
      }
    }
    if (best && bestCovers - baseCovers >= Math.max(2, work.listings.length * 0.1))
      learned.set(id, best);
  }
  return learned;
}
export const MIN_LEARN_TITLES = 5;

/**
 * The most valuable editions as ISBN search phrases (ISBN-13): Vinted's search also matches the
 * ISBN a seller put in the description or the ISBN field, so a listing with a typo or a bare
 * title is found too (live check 2026-11-23: 1 extra listing in 3 of the 6 most valuable editions).
 * Medium or high valuations of at least `minValue` grosze, highest first, one ISBN per edition.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function isbnTargets(repository, { limit = 24, minValue = 4000, at = Date.now() } = {}) {
  const { items } = marketIndex(repository, {
    sort: 'value',
    limit: 200,
    confidence: 'medium',
    at,
  });
  const identifier = repository.database.prepare(
    `SELECT normalized_value AS isbn FROM edition_identifiers WHERE edition_id=?
     ORDER BY verification_status='manual' DESC, length(normalized_value) DESC LIMIT 1`,
  );
  const targets = [];
  const seen = new Set();
  for (const item of items) {
    if (item.value < minValue) break;
    const row = /** @type {any} */ (identifier.get(item.editionId));
    const isbn = row ? isbnKeys(String(row.isbn)).find((key) => /^97[89]\d{10}$/.test(key)) : null;
    if (!isbn || seen.has(isbn)) continue;
    seen.add(isbn);
    targets.push({ editionId: item.editionId, title: item.title, phrase: isbn, value: item.value });
    if (targets.length >= limit) break;
  }
  return targets;
}

/**
 * What the sniper watches: works whose best edition has a medium or high valuation of at least
 * `minValue` grosze, by expected turnover. One phrase per work.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function sniperTargets(repository, { limit = 40, minValue = 2500, at = Date.now() } = {}) {
  const learned = learnedPhrases(repository);
  const { items } = marketIndex(repository, {
    sort: 'turnover',
    limit: 200,
    confidence: 'medium',
    at,
  });
  const seen = new Set();
  const targets = [];
  for (const item of items) {
    if (item.value < minValue || seen.has(item.workId)) continue;
    seen.add(item.workId);
    const phrase = learned.get(String(item.workId)) ?? sniperPhrase(item.title, item.authors);
    if (!phrase || targets.some((target) => fold(target.phrase) === fold(phrase))) continue;
    targets.push({
      workId: item.workId,
      title: item.title,
      phrase,
      value: item.value,
      chance: item.liquidity.chance,
    });
    if (targets.length >= limit) break;
  }
  return targets;
}
