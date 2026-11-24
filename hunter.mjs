// @ts-check
// "Łowca": a book in your hand, in a shop or at a fair. Give its ISBN (and the price on the shelf,
// if you like) and get what the catalogue knows: the edition, its market value from Vinted offers,
// how fast it sells, what is listed now and a plain verdict on the price. Catalogue only: no network
// request, no costs and no profit (a price against the valuation, like "Okazje").
// A book whose ISBN has no edition in the catalogue is valued from the offers whose own listing
// carries that ISBN (ISBN evidence, nothing is assigned): on saved data 97% of the unassigned Vinted
// offers have one, mostly books outside the owner's collection.
import { editionCovers } from './catalog-api.mjs';
import { isbnKeys, normalizeISBN } from './isbn-normalization.mjs';
import { editionLiquidity, liquidityModel } from './market-index.mjs';
import { estimateValue, marketValuations, valuationOptions } from './market-valuation.mjs';
import { offerKindSql } from './offer-kinds.mjs';
import { activeTargets } from './price-targets.mjs';

/** Price against the valuation (share of the estimate), best first. */
export const VERDICTS = [
  { max: 0.5, verdict: 'warto', label: 'Warto: wyraźnie poniżej wyceny' },
  { max: 0.75, verdict: 'raczej_tak', label: 'Raczej tak: poniżej wyceny' },
  { max: 0.95, verdict: 'granica', label: 'Na granicy: blisko wyceny' },
  { max: Infinity, verdict: 'drogo', label: 'Drogo: wycena jest niższa' },
];

/** @param {number} ratio */
export function priceVerdict(ratio) {
  return VERDICTS.find((entry) => ratio <= entry.max) ?? VERDICTS[VERDICTS.length - 1];
}

/**
 * „Opłaca się do”: the highest shelf price (whole złoty, grosze) that is still at least „Raczej tak”
 * (≤ 75% of the valuation). null without a valuation or below 1 zł.
 * @param {number | null | undefined} estimate grosze
 */
export function worthUpTo(estimate) {
  if (!(Number(estimate) > 0)) return null;
  const limit = VERDICTS[1].max;
  const zloty = Math.floor((Number(estimate) * limit) / 100 + 1e-9);
  return zloty >= 1 ? zloty * 100 : null;
}

const BUYABLE = new Set(['available', 'unconfirmed']);
/** SQL: the offer's own ISBN in the same spelling as normalizeISBN (no dashes or spaces, upper case). */
const OBSERVED_ISBN_SQL = "replace(replace(upper(o.observed_isbn),'-',''),' ','')";

/** SQL: offers that may value an ISBN: priced, in złoty, not a set (its price is not one book's)
 * and not assigned to an edition (an offer the owner assigned elsewhere is left out: manual wins;
 * a removed work's offers are rejected, so they count). Columns as read by isbnMarketFromRows. */
export const ISBN_OFFER_SQL = `SELECT o.observed_isbn AS isbn, o.original_title AS title, o.current_price AS price,
    o.availability AS availability, coalesce(o.condition_class,'unknown') AS condition,
    ${offerKindSql('o')} AS kind, o.first_seen_at AS firstSeenAt, o.availability_changed_at AS changedAt
  FROM offers o
  WHERE o.observed_isbn IS NOT NULL AND o.currency='PLN' AND o.current_price>0 AND o.current_price<1000000
    AND NOT EXISTS (SELECT 1 FROM offer_sets s WHERE s.offer_id=o.id AND s.dismissed_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM offer_matches m WHERE m.offer_id=o.id AND m.status='active')`;

/**
 * Valuation, sellers' title and live listings from the offer rows of one ISBN (ISBN_OFFER_SQL);
 * shared by Łowca and its offline pack so both answer the same.
 * @param {any[]} rows @param {number} at @param {{ trackedSince?: number|null }} options
 */
export function isbnMarketFromRows(rows, at, options) {
  /** @type {import('./market-valuation.mjs').Observation[]} */
  const observations = rows.map((row) => {
    const availability = String(row.availability);
    return {
      price: Number(row.price),
      state:
        availability === 'sold'
          ? 'sold'
          : ['unavailable', 'reserved'].includes(availability)
            ? 'gone'
            : 'live',
      kind: String(row.kind),
      condition: String(row.condition),
      firstSeenAt: row.firstSeenAt ?? null,
      soldAt: availability === 'sold' ? (row.changedAt ?? null) : null,
      firstPrice: null,
    };
  });
  const live = rows.filter((row) => BUYABLE.has(String(row.availability)));
  // The title sellers use most often, as a hint of what the book is (not a bibliographic record).
  const titles = new Map();
  for (const row of rows) {
    const title = String(row.title ?? '').trim();
    if (title) titles.set(title, (titles.get(title) ?? 0) + 1);
  }
  const title = [...titles].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0];
  return {
    title: title ? title.slice(0, 200) : null,
    offers: rows.length,
    valuation: estimateValue(observations, at, options),
    listed: {
      count: live.length,
      cheapest: live.length ? Math.min(...live.map((row) => Number(row.price))) : null,
    },
  };
}

/**
 * Valuation of one ISBN from the offers whose own listing carries it (ISBN_OFFER_SQL). Nothing is
 * written. null when no such offer has the ISBN.
 * @param {any} database @param {string} isbn normalized @param {number} at
 */
export function isbnOfferMarket(database, isbn, at) {
  const rows = database
    .prepare(`${ISBN_OFFER_SQL} AND ${OBSERVED_ISBN_SQL} IN (SELECT value FROM json_each(?))`)
    .all(JSON.stringify(isbnKeys(isbn)));
  return rows.length ? isbnMarketFromRows(rows, at, valuationOptions(database)) : null;
}

/** @param {any} valuation */
function knownValue(valuation) {
  return valuation?.estimate != null && valuation.confidence !== 'none';
}

/** @param {any} valuation @param {number | null} price */
function verdictFor(valuation, price) {
  if (price == null || !Number.isFinite(price) || price <= 0 || !knownValue(valuation)) return null;
  return {
    ...priceVerdict(price / valuation.estimate),
    ratio: Math.round((price / valuation.estimate) * 100) / 100,
  };
}

/** @param {any} valuation */
function valueSummary(valuation) {
  return knownValue(valuation)
    ? {
        estimate: valuation.estimate,
        low: valuation.low,
        high: valuation.high,
        confidence: valuation.confidence,
        confidenceLabel: valuation.confidenceLabel,
        sold: valuation.sold,
      }
    : null;
}

/** @param {any} valuation */
function cautionFor(valuation) {
  return !knownValue(valuation)
    ? 'no_valuation'
    : valuation.confidence === 'low'
      ? 'low_confidence'
      : null;
}

/** The edition (with its work) an ISBN points to, or undefined; the one ISBN -> edition lookup (manual identifiers first). @param {any} database @param {string} isbn normalized */
export function editionRowByIsbn(database, isbn) {
  return database
    .prepare(
      `SELECT e.id AS editionId, e.title AS editionTitle, e.publisher, e.publication_year AS year,
         w.id AS workId, w.title AS workTitle, w.authors_json AS authors
       FROM edition_identifiers i JOIN editions e ON e.id=i.edition_id JOIN works w ON w.id=e.work_id
       WHERE i.normalized_value IN (SELECT value FROM json_each(?)) AND e.is_unknown=0
       ORDER BY i.verification_status='manual' DESC, e.rowid LIMIT 1`,
    )
    .get(JSON.stringify(isbnKeys(isbn)));
}

/**
 * @param {{ database: any }} repository
 * @param {string} isbnInput what was typed or scanned (any ISBN-10/13 spelling)
 * @param {{ price?: number | null, at?: number }} [options] price in grosze
 */
export function hunterLookup(repository, isbnInput, { price = null, at = Date.now() } = {}) {
  const isbn = normalizeISBN(String(isbnInput ?? ''));
  if (!isbn) return { found: false, reason: 'invalid_isbn', isbn: null };
  const database = repository.database;
  const row = editionRowByIsbn(database, isbn);
  if (!row) {
    const market = isbnOfferMarket(database, isbn, at);
    if (!market) return { found: false, reason: 'not_in_catalogue', isbn };
    const estimate = knownValue(market.valuation) ? market.valuation.estimate : null;
    return {
      found: false,
      reason: 'not_in_catalogue',
      isbn,
      // Seen in offers with this very ISBN: a valuation without a catalogue edition.
      market: {
        title: market.title,
        offers: market.offers,
        value: valueSummary(market.valuation),
        listed: market.listed,
      },
      price,
      verdict: verdictFor(market.valuation, price),
      worthUpTo: worthUpTo(estimate),
      caution: cautionFor(market.valuation),
    };
  }
  const editionId = String(row.editionId);
  let authors = [];
  try {
    authors = JSON.parse(String(row.authors || '[]'));
  } catch {}
  let valuation = marketValuations(database, 'edition', [editionId], at).get(editionId);
  // No valuation from the edition's assigned offers (a removed work's offers are rejected): the
  // offers that carry the ISBN themselves still say what it costs.
  let valueBasis = 'edition';
  let market = null;
  if (!knownValue(valuation)) {
    market = isbnOfferMarket(database, isbn, at);
    if (market && knownValue(market.valuation)) {
      valuation = market.valuation;
      valueBasis = 'isbn_offers';
    }
  }
  const liquidity = editionLiquidity(liquidityModel(database, at), editionId);
  const live = database
    .prepare(
      `SELECT count(*) AS n, min(o.current_price) AS cheapest
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id
       WHERE m.edition_id=? AND m.status='active' AND o.availability IN ('available','unconfirmed')
         AND o.current_price>0 AND o.current_price<1000000`,
    )
    .get(editionId);
  const known = knownValue(valuation);
  // The owner's own „Kupuję do” for this edition (or its work, Polish editions): any price at or
  // under it is a buy, whatever the valuation says (as in „Okazje”).
  const target = activeTargets(repository)(editionId, String(row.workId), 1)?.maxPrice ?? null;
  const copies = database
    .prepare(
      `SELECT count(*) AS n FROM stock_items s WHERE s.edition_id=? AND s.status IN ('bought','listed')
         AND NOT EXISTS (SELECT 1 FROM stock_events h WHERE h.item_id=s.id AND h.from_status IS NULL AND h.undone_at IS NOT NULL)`,
    )
    .get(editionId);
  const removed = database
    .prepare('SELECT 1 FROM removed_works WHERE work_id=?')
    .get(String(row.workId));
  return {
    found: true,
    isbn,
    edition: {
      id: editionId,
      title: String(row.editionTitle),
      workId: String(row.workId),
      workTitle: String(row.workTitle),
      authors,
      publisher: row.publisher ?? null,
      year: row.year ?? null,
      cover: editionCovers(database, [editionId]).get(editionId) ?? null,
    },
    value: valueSummary(valuation),
    liquidity: {
      chance: liquidity.chance,
      medianDays: liquidity.medianDays,
      level: liquidity.level,
      sales: liquidity.sales,
      live: liquidity.live,
      // 'market': the edition has no sales of its own, the figures are the market's (or nothing).
      basis: liquidity.basis,
    },
    valueBasis,
    listed:
      valueBasis === 'isbn_offers' && market
        ? market.listed
        : {
            count: Number(live.n),
            cheapest: live.cheapest == null ? null : Number(live.cheapest),
          },
    price,
    verdict: verdictFor(valuation, price),
    worthUpTo: worthUpTo(known ? valuation?.estimate : null),
    target,
    targetMet: target != null && price != null && price > 0 && price <= target,
    // Copies already bought or listed (Zapas): a second one competes with the first.
    inStock: Number(copies?.n ?? 0),
    // The owner removed the work from the catalogue („Usuń z katalogu”): said, not hidden.
    removed: Boolean(removed),
    // An unsure valuation or few observations: say so next to the verdict.
    caution: cautionFor(valuation),
  };
}
