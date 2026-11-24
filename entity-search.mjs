// @ts-check
// „Szukaj”: one search box for sellers, authors and publisher series. Case and Polish letters do not
// matter. A seller card says what the seller lists now (price against the valuation of the edition,
// the median deviation), what left in the last 30 days; an author or series card says how much the
// market turns over there (market-index.mjs), how many offers are live and their median price.
// Read only (SELECT). A seller is the marketplace's own seller id: an offer without one is nobody.
// A seller without a name (Vinted stores none) is found only by its full id and shown as „sprzedawca #id”.
// No lists of missing volumes, no costs, no profit.
import { fold } from './title-proposals.mjs';
import { authorName } from './catalog-authors.mjs';
import { editionLiquidity, liquidityModel } from './market-index.mjs';
import {
  CONDITION_FACTOR,
  estimateValue,
  marketObservations,
  marketValuations,
  valuationOptions,
} from './market-valuation.mjs';

const DAY = 86_400_000;
const MIN_QUERY = 2;
const PRICE_LIMIT = 1_000_000;
const LIVE = "('available','unconfirmed')";
const LIVE_WORK =
  'NOT EXISTS (SELECT 1 FROM catalog_work_merges cm WHERE cm.source_id=w.id) AND NOT EXISTS (SELECT 1 FROM removed_works rw WHERE rw.work_id=w.id)';

/** Same result as fold() but a plain ASCII text (most names) skips the four replacements. */
const quickFold = (/** @type {unknown} */ value) => {
  const lower = String(value ?? '').toLowerCase();
  return /^[a-z0-9]+(?: [a-z0-9]+)*$/.test(lower) ? lower : fold(lower);
};

const hasName = (/** @type {unknown} */ name) => name != null && String(name).trim() !== '';

/** @param {number[]} values */
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};

/** Most frequent spelling of a name, the first seen on a tie. */
function popular(/** @type {Map<string, number>} */ spellings) {
  let best = '';
  let count = 0;
  for (const [name, n] of spellings) {
    if (n > count) {
      best = name;
      count = n;
    }
  }
  return best;
}

/**
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {string} query
 * @param {{ at?: number, limit?: number }} [options]
 */
export function searchEntities(repository, query, { at = Date.now(), limit = 5 } = {}) {
  const needle = fold(query);
  const empty = { query: String(query ?? ''), sellers: [], authors: [], series: [] };
  if (needle.length < MIN_QUERY) return empty;
  const database = repository.database;
  return {
    query: empty.query,
    sellers: sellerCards(database, needle, at, limit),
    ...catalogCards(database, needle, at, limit),
  };
}

/**
 * Every seller with the folded text to search in. Kept per database while no offer was added
 * (highest rowid and number of offers unchanged): a new seller needs a new offer, and the counts only order the hits.
 * @type {WeakMap<object, { last: string, rows: { source: string, sellerId: string, sellerName: string|null, offers: number, text: string|null, idKey: string }[] }>}
 */
const directories = new WeakMap();

/** @param {import('node:sqlite').DatabaseSync} database */
function sellerDirectory(database) {
  const stamp = database.prepare('SELECT max(rowid) AS n, count(*) AS c FROM offers').get();
  // Highest rowid and the count: an added offer moves the first, a deleted one the second.
  const last = `${Number(stamp?.n ?? 0)}:${Number(stamp?.c ?? 0)}`;
  const cached = directories.get(database);
  if (cached?.last === last) return cached.rows;
  const rows = database
    .prepare(
      `SELECT source, seller_id AS sellerId, max(seller_name) AS sellerName, count(*) AS offers
       FROM offers WHERE seller_id IS NOT NULL GROUP BY source, seller_id`,
    )
    .all()
    .filter((row) => String(row.sellerId).trim() !== '')
    .map((row) => ({
      source: String(row.source),
      sellerId: String(row.sellerId),
      sellerName: hasName(row.sellerName) ? String(row.sellerName) : null,
      offers: Number(row.offers),
      // A seller with a name is found by the name or the id; one without (Vinted stores none) only
      // by its id typed in full, shown as „sprzedawca #id” — a part of a number would match strangers.
      text: hasName(row.sellerName)
        ? `${quickFold(row.sellerName)}
${quickFold(row.sellerId)}`
        : null,
      idKey: quickFold(String(row.sellerId).trim()),
    }));
  directories.set(database, { last, rows });
  return rows;
}

/** @param {import('node:sqlite').DatabaseSync} database */
function sellerCards(database, needle, at, limit) {
  const found = sellerDirectory(database)
    .filter((row) => (row.text == null ? row.idKey === needle : row.text.includes(needle)))
    .sort((a, b) => b.offers - a.offers || a.sellerId.localeCompare(b.sellerId))
    .slice(0, limit);
  if (!found.length) return [];
  const options = valuationOptions(database);
  const factors = /** @type {Record<string, number>} */ (CONDITION_FACTOR);
  return found.map((seller) => {
    const rows = database
      .prepare(
        `SELECT o.id AS offerId, o.original_title AS title, o.normalized_url AS url,
           o.current_price AS price, o.availability, coalesce(o.condition_class,'unknown') AS condition,
           o.availability_changed_at AS changedAt, o.last_seen_at AS lastSeenAt,
           (SELECT m.edition_id FROM offer_matches m JOIN editions e ON e.id=m.edition_id
             WHERE m.offer_id=o.id AND m.status='active' AND e.is_unknown=0) AS editionId
         FROM offers o WHERE o.source=? AND o.seller_id=?`,
      )
      .all(seller.source, seller.sellerId);
    const live = rows.filter((row) =>
      ['available', 'unconfirmed'].includes(String(row.availability)),
    );
    const editionIds = [
      ...new Set(
        live
          .map((row) => row.editionId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const observations = marketObservations(database, 'edition', editionIds);
    const deviations = [];
    const offers = live.map((row) => {
      const price = Number(row.price);
      let worth = null;
      if (row.editionId && price > 0 && price < PRICE_LIMIT) {
        // As in "Okazje": the offer is not part of the market that values it.
        const others = (observations.get(String(row.editionId)) ?? []).filter(
          (item) => item.offerId !== row.offerId,
        );
        const valuation = estimateValue(others, at, options);
        if (
          others.some((item) => item.kind !== 'new_shop' && item.state !== 'gone') &&
          valuation.estimate != null &&
          valuation.sold + valuation.live >= 2 &&
          ['high', 'medium'].includes(valuation.confidence)
        )
          worth =
            Math.round(valuation.estimate / (factors[String(row.condition)] || 1) / 100) * 100;
      }
      const deviation = worth ? Math.round(((price - worth) / worth) * 1000) / 1000 : null;
      if (deviation != null) deviations.push(deviation);
      return {
        offerId: String(row.offerId),
        title: String(row.title),
        url: String(row.url),
        price,
        worth,
        deviation,
      };
    });
    const since = at - 30 * DAY;
    const left = rows.filter((row) => {
      const availability = String(row.availability);
      const when = Date.parse(String(availability === 'not_seen' ? row.lastSeenAt : row.changedAt));
      return (
        ['sold', 'unavailable', 'reserved', 'not_seen'].includes(availability) &&
        Number.isFinite(when) &&
        when >= since
      );
    });
    offers.sort((a, b) => (a.deviation ?? 9) - (b.deviation ?? 9) || a.price - b.price);
    return {
      sellerId: String(seller.sellerId),
      sellerName: seller.sellerName == null ? null : String(seller.sellerName),
      source: String(seller.source),
      activeCount: live.length,
      valuedCount: deviations.length,
      // Offers without a reliable valuation are listed but stay out of the median.
      unvaluedCount: live.length - deviations.length,
      medianDeviation: median(deviations),
      goneIn30Days: left.length,
      soldIn30Days: left.filter((row) => row.availability === 'sold').length,
      offers: offers.slice(0, 20),
    };
  });
}

/** Authors and publisher series: works and editions behind each name, then the market figures. */
function catalogCards(database, needle, at, limit) {
  /** @type {Map<string, { names: Map<string, number>, works: Set<string> }>} */
  const authors = new Map();
  for (const row of database
    .prepare(
      `SELECT w.id AS workId, j.value AS name
       FROM works w, json_each(CASE WHEN json_valid(w.authors_json) THEN w.authors_json ELSE '[]' END) j
       WHERE ${LIVE_WORK} AND j.type='text'`,
    )
    .all()) {
    const name = authorName(row.name);
    const key = fold(name);
    if (!key || !key.includes(needle)) continue;
    const entry = authors.get(key) ?? { names: new Map(), works: new Set() };
    authors.set(key, entry);
    entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
    entry.works.add(String(row.workId));
  }
  /** @type {Map<string, { names: Map<string, number>, works: Set<string>, editions: Set<string> }>} */
  const series = new Map();
  for (const row of database
    .prepare(
      `SELECT s.name, s.normalized_name AS key, e.id AS editionId, e.work_id AS workId
       FROM edition_series s JOIN editions e ON e.id=s.edition_id JOIN works w ON w.id=e.work_id
       WHERE ${LIVE_WORK} AND e.is_unknown=0 AND s.normalized_name LIKE ? ESCAPE '\\'`,
    )
    .all(`%${needle.replace(/[\\%_]/g, '\\$&')}%`)) {
    const key = fold(row.name);
    if (!key.includes(needle)) continue;
    const entry = series.get(key) ?? { names: new Map(), works: new Set(), editions: new Set() };
    series.set(key, entry);
    entry.names.set(String(row.name), (entry.names.get(String(row.name)) ?? 0) + 1);
    entry.works.add(String(row.workId));
    entry.editions.add(String(row.editionId));
  }
  const pick = (/** @type {Map<string, any>} */ map) =>
    [...map.entries()]
      .sort((a, b) => b[1].works.size - a[1].works.size || a[0].localeCompare(b[0]))
      .slice(0, limit);
  const topAuthors = pick(authors);
  const topSeries = pick(series);
  if (!topAuthors.length && !topSeries.length) return { authors: [], series: [] };

  // One round of queries for every card of this search (not one set per card or per edition).
  const workEditions = editionsByWork(
    database,
    new Set(topAuthors.flatMap(([, entry]) => [...entry.works])),
  );
  const editionIds = new Set(topSeries.flatMap(([, entry]) => [...entry.editions]));
  for (const ids of workEditions.values()) for (const id of ids) editionIds.add(id);
  const ids = [...editionIds];
  const valuations = marketValuations(database, 'edition', ids, at);
  const market = liveMarket(database, ids);
  const model = cachedLiquidityModel(database, at);
  const card = (
    /** @type {string} */ name,
    /** @type {Set<string>} */ works,
    /** @type {Set<string>} */ editions,
  ) => {
    let turnover = 0;
    let liveOffers = 0;
    /** @type {number[]} */
    const prices = [];
    for (const id of editions) {
      const valuation = valuations.get(id);
      if (valuation?.estimate != null)
        turnover += valuation.estimate * editionLiquidity(model, id).chance;
      const own = market.get(id);
      if (!own) continue;
      liveOffers += own.live;
      for (const price of own.prices) prices.push(price);
    }
    return {
      name,
      workCount: works.size,
      editionCount: editions.size,
      turnover: Math.round(turnover / 100) * 100,
      liveOffers,
      medianPrice: median(prices),
    };
  };
  const authorEditions = (/** @type {Set<string>} */ works) =>
    new Set([...works].flatMap((work) => workEditions.get(work) ?? []));
  return {
    authors: topAuthors.map(([, entry]) =>
      card(popular(entry.names), entry.works, authorEditions(entry.works)),
    ),
    series: topSeries.map(([, entry]) => card(popular(entry.names), entry.works, entry.editions)),
  };
}

/** Editions (not unknown) of each work: Map workId → edition ids. */
function editionsByWork(database, /** @type {Set<string>} */ works) {
  /** @type {Map<string, string[]>} */
  const byWork = new Map();
  if (!works.size) return byWork;
  for (const row of database
    .prepare(
      `SELECT id, work_id AS workId FROM editions
       WHERE is_unknown=0 AND work_id IN (SELECT value FROM json_each(?))`,
    )
    .all(JSON.stringify([...works]))) {
    const list = byWork.get(String(row.workId)) ?? [];
    byWork.set(String(row.workId), list);
    list.push(String(row.id));
  }
  return byWork;
}

/** Live offers per edition: Map editionId → { live: all live offers, prices: PLN prices of the sane ones }. */
function liveMarket(database, /** @type {string[]} */ ids) {
  /** @type {Map<string, { live: number, prices: number[] }>} */
  const byEdition = new Map();
  if (!ids.length) return byEdition;
  for (const row of database
    .prepare(
      `SELECT m.edition_id AS editionId, o.current_price AS price, o.currency AS currency
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id
       WHERE m.status='active' AND o.availability IN ${LIVE}
         AND m.edition_id IN (SELECT value FROM json_each(?))`,
    )
    .all(JSON.stringify(ids))) {
    const key = String(row.editionId);
    const entry = byEdition.get(key) ?? { live: 0, prices: [] };
    byEdition.set(key, entry);
    entry.live += 1;
    const price = Number(row.price);
    if (row.currency === 'PLN' && price > 0 && price < PRICE_LIMIT) entry.prices.push(price);
  }
  return byEdition;
}

/**
 * The turnover model reads every Vinted offer. It is kept per database while nothing was written
 * (this connection's total_changes and other connections' data_version) and for at most a minute
 * of the clock the card is asked for: typing a name asks again and again.
 * @type {WeakMap<object, { stamp: string, at: number, model: ReturnType<typeof liquidityModel> }>}
 */
const models = new WeakMap();

/** @param {import('node:sqlite').DatabaseSync} database */
function cachedLiquidityModel(database, at) {
  const changes = database.prepare('SELECT total_changes() AS n').get();
  const version = database.prepare('PRAGMA data_version').get();
  const stamp = `${changes?.n}:${version?.data_version}`;
  const cached = models.get(database);
  if (cached && cached.stamp === stamp && Math.abs(at - cached.at) < 60_000) return cached.model;
  const model = liquidityModel(database, at);
  models.set(database, { stamp, at, model });
  return model;
}
