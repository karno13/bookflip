// @ts-check
// „Łowca bez sieci”: everything Łowca would answer, for every ISBN at once, so the phone can keep
// it and check books where there is no signal (a cellar shop, a fair hall; Tailscale needs the
// internet). One pass over the catalogue and the offers, the same rules as hunterLookup: the
// edition's valuation, else the offers carrying the ISBN; the owner's target, copies in stock, a
// removed work. Keys are ISBN-13 (what a barcode gives). Read only, no network.
import { isbnKeys } from './isbn-normalization.mjs';
import { ISBN_OFFER_SQL, VERDICTS, isbnMarketFromRows } from './hunter.mjs';
import { editionLiquidity, liquidityModel } from './market-index.mjs';
import { marketValuations, valuationOptions } from './market-valuation.mjs';
import { activeTargets } from './price-targets.mjs';

/** Bumped when the entry layout changes: a phone with an older pack downloads a new one. */
export const PACK_VERSION = 3;
const CONFIDENCE = ['high', 'medium', 'low'];

/** The ISBN-13 form of any valid ISBN (978 + ISBN-10 stem), or null. @param {string} value */
export function isbn13(value) {
  return isbnKeys(value).find((key) => /^97[89]\d{10}$/.test(key)) ?? null;
}

/**
 * @typedef {[isbn: string, title: string, estimate: number|null, low: number|null, high: number|null,
 *   confidence: string|null, target: number|null, inStock: number, flags: number, chance: number|null,
 *   level: string|null, medianDays: number|null, listed: number, cheapest: number|null,
 *   offers: number|null, authors: string, publisher: string|null, year: number|null,
 *   work: string|null, tags: string]} PackEntry
 * chance/level: the edition's 30-day sale chance, only when it has listings of its own (as Łowca).
 * offers: how many offers with the ISBN gave the valuation (flags 1 and 4), else null.
 * authors, publisher, year, work (the work's title): what a title search in the field matches and
 * shows, so the owner can tell editions apart with the book in hand; tags: the edition's universe,
 * cycle and publisher line and the owner's labels of the work, one line, searched but not shown
 * („warhammer” finds „Szpon Ragnara”); empty / null outside the catalogue.
 * flags: 1 outside the catalogue (offers only), 2 removed work, 4 valued from offers with the ISBN.
 */
export const FLAG = { outside: 1, removed: 2, isbnOffers: 4 };

/** @param {any} valuation */
const valued = (valuation) =>
  valuation?.estimate != null && CONFIDENCE.includes(String(valuation.confidence));

/** The work's authors as one line („Terry Pratchett, Neil Gaiman”); '' when unknown. @param {unknown} json */
function authorsText(json) {
  try {
    const list = JSON.parse(String(json || '[]'));
    return Array.isArray(list) ? list.map(String).filter(Boolean).join(', ') : '';
  } catch {
    return '';
  }
}

/** Edition id → its series names, 'w:' + work id → the work's labels. @param {any} database */
function editionTags(database) {
  /** @type {Map<string, string[]>} */
  const tags = new Map();
  const add = (/** @type {string} */ key, /** @type {unknown} */ name) => {
    const list = tags.get(key) ?? tags.set(key, []).get(key) ?? [];
    if (name && !list.includes(String(name))) list.push(String(name));
  };
  for (const row of database
    .prepare('SELECT edition_id AS id, name FROM edition_series ORDER BY position')
    .all())
    add(String(row.id), row.name);
  for (const row of database
    .prepare('SELECT work_id AS id, label FROM work_labels ORDER BY position')
    .all())
    add('w:' + String(row.id), row.label);
  return tags;
}

/** ISBN-13 → isbnMarketFromRows result, for every ISBN in the offers, in one query. @param {any} database @param {number} at */
function offersByIsbn(database, at) {
  /** @type {Map<string, any[]>} */
  const groups = new Map();
  for (const row of database.prepare(ISBN_OFFER_SQL).all()) {
    const key = isbn13(String(row.isbn));
    if (key) (groups.get(key) ?? groups.set(key, []).get(key))?.push(row);
  }
  const options = valuationOptions(database);
  return new Map([...groups].map(([key, rows]) => [key, isbnMarketFromRows(rows, at, options)]));
}

/**
 * The whole pack: { version, generatedAt, verdicts, entries }: every catalogue ISBN, and every ISBN
 * seen only in offers that those offers can value.
 * @param {{ database: any }} repository
 * @param {{ at?: number }} [options]
 */
export function hunterPack(repository, { at = Date.now() } = {}) {
  const database = repository.database;
  const editions = database
    .prepare(
      `SELECT i.normalized_value AS isbn, e.id AS editionId, e.work_id AS workId, e.title AS title,
         e.publisher, e.publication_year AS year, w.title AS workTitle, w.authors_json AS authors,
         EXISTS (SELECT 1 FROM removed_works r WHERE r.work_id=e.work_id) AS removed
       FROM edition_identifiers i JOIN editions e ON e.id=i.edition_id JOIN works w ON w.id=e.work_id
       WHERE e.is_unknown=0
       ORDER BY i.verification_status='manual' DESC, e.rowid`,
    )
    .all();
  const editionIds = [...new Set(editions.map((row) => String(row.editionId)))];
  const valuations = marketValuations(database, 'edition', editionIds, at);
  const model = liquidityModel(database, at);
  const target = activeTargets(repository);
  const stock = new Map(
    database
      .prepare(
        `SELECT s.edition_id AS editionId, count(*) AS n FROM stock_items s
         WHERE s.status IN ('bought','listed')
           AND NOT EXISTS (SELECT 1 FROM stock_events h WHERE h.item_id=s.id AND h.from_status IS NULL AND h.undone_at IS NOT NULL)
         GROUP BY 1`,
      )
      .all()
      .map((/** @type {any} */ row) => [String(row.editionId), Number(row.n)]),
  );
  const live = new Map(
    database
      .prepare(
        `SELECT m.edition_id AS editionId, count(*) AS n, min(o.current_price) AS cheapest
         FROM offer_matches m JOIN offers o ON o.id=m.offer_id
         WHERE m.status='active' AND o.availability IN ('available','unconfirmed')
           AND o.current_price>0 AND o.current_price<1000000 GROUP BY 1`,
      )
      .all()
      .map((/** @type {any} */ row) => [String(row.editionId), row]),
  );
  const tags = editionTags(database);
  const byIsbn = offersByIsbn(database, at);
  /** @type {Map<string, PackEntry>} */
  const entries = new Map();
  for (const row of editions) {
    const key = isbn13(String(row.isbn));
    // The first edition of an ISBN wins (manual identifiers first), as in editionRowByIsbn.
    if (!key || entries.has(key)) continue;
    const editionId = String(row.editionId);
    let valuation = valuations.get(editionId);
    let flags = row.removed ? FLAG.removed : 0;
    const own = live.get(editionId);
    let listed = {
      count: Number(own?.n ?? 0),
      cheapest: own?.cheapest == null ? null : Number(own.cheapest),
    };
    let offers = null;
    const market = byIsbn.get(key);
    if (!valued(valuation) && market && valued(market.valuation)) {
      valuation = market.valuation;
      flags |= FLAG.isbnOffers;
      listed = market.listed;
      offers = market.offers;
    }
    const liquidity = editionLiquidity(model, editionId);
    const ownSales = liquidity.basis !== 'market';
    const goal = target(editionId, String(row.workId), 1)?.maxPrice ?? null;
    const copies = stock.get(editionId) ?? 0;
    const known = valued(valuation);
    // Every catalogue ISBN is kept, also with nothing to say: offline Łowca must answer „brak
    // wyceny” for a book in the catalogue (not „nie ma w katalogu”), and a later edition with the
    // same ISBN must not take its place.
    entries.set(key, [
      key,
      String(row.title ?? ''),
      known ? valuation.estimate : null,
      known ? valuation.low : null,
      known ? valuation.high : null,
      known ? String(valuation.confidence) : null,
      goal,
      copies,
      flags,
      ownSales ? liquidity.chance : null,
      ownSales ? liquidity.level : null,
      ownSales ? liquidity.medianDays : null,
      listed.count,
      listed.cheapest,
      offers,
      authorsText(row.authors),
      row.publisher == null || row.publisher === '' ? null : String(row.publisher),
      Number.isInteger(Number(row.year)) && row.year != null ? Number(row.year) : null,
      row.workTitle == null ? null : String(row.workTitle),
      [...(tags.get(editionId) ?? []), ...(tags.get('w:' + String(row.workId)) ?? [])].join(' · '),
    ]);
  }
  // A catalogue ISBN is never "outside": with a valued market it took that valuation above.
  for (const [key, market] of byIsbn) {
    if (entries.has(key) || !valued(market.valuation)) continue;
    const valuation = market.valuation;
    entries.set(key, [
      key,
      String(market.title ?? ''),
      valuation.estimate,
      valuation.low,
      valuation.high,
      String(valuation.confidence),
      null,
      0,
      FLAG.outside,
      null,
      null,
      null,
      market.listed.count,
      market.listed.cheapest,
      market.offers,
      '',
      null,
      null,
      null,
      '',
    ]);
  }
  return {
    version: PACK_VERSION,
    generatedAt: new Date(at).toISOString(),
    // The verdict thresholds of hunterLookup, so the phone judges a shelf price the same way.
    verdicts: VERDICTS.map((entry) => [
      Number.isFinite(entry.max) ? entry.max : null,
      entry.verdict,
      entry.label,
    ]),
    worthUpToShare: VERDICTS[1].max,
    entries: [...entries.values()],
  };
}
