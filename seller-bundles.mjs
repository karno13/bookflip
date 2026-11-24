// @ts-check
// "Paczki sprzedawców": a seller who lists many books you could value. One card per seller with at
// least MIN_BOOKS available books of a reliably valued edition: how many, the total price, the total
// worth and the difference, with the offers. Read only (SELECT); the seller's identity is the
// marketplace's own seller id (an offer without one joins no bundle). Price against valuation only.
import { proxiedImage } from './offer-images.mjs';
import { watchedKeys, watchKey } from './watched-sellers.mjs';
import {
  CONDITION_FACTOR,
  estimateValue,
  marketObservations,
  valuationOptions,
} from './market-valuation.mjs';

/** A seller with fewer valued books than this is not a bundle. */
export const MIN_BOOKS = 3;
const PRICE_LIMIT = 1_000_000;

/**
 * @param {{ database: any }} repository
 * @param {{ at?: number, minBooks?: number, limit?: number }} [options]
 */
export function sellerBundles(
  repository,
  { at = Date.now(), minBooks = MIN_BOOKS, limit = 50 } = {},
) {
  const database = repository.database;
  const rows = database
    .prepare(
      `SELECT o.id AS offerId, o.seller_id AS sellerId, o.seller_name AS sellerName, o.source,
         o.original_title AS title, o.normalized_url AS url, o.image_url AS image,
         o.current_price AS price, coalesce(o.condition_class,'unknown') AS condition,
         m.edition_id AS editionId
       FROM offers o JOIN offer_matches m ON m.offer_id=o.id AND m.status='active'
         JOIN editions e ON e.id=m.edition_id
       WHERE o.source='Vinted' AND coalesce(o.seller_id,'')<>'' AND e.is_unknown=0
         AND o.availability IN ('available','unconfirmed') AND o.currency='PLN'
         AND o.current_price>0 AND o.current_price<${PRICE_LIMIT}
         AND NOT EXISTS (SELECT 1 FROM offer_sets s WHERE s.offer_id=o.id AND s.dismissed_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM deal_verdicts v WHERE v.offer_id=o.id AND v.verdict='wrong_match')`,
    )
    .all();
  const editionIds = [...new Set(rows.map((row) => String(row.editionId)))];
  const observations = marketObservations(database, 'edition', editionIds);
  const options = valuationOptions(database);
  /** @type {Map<string, any>} */
  const sellers = new Map();
  for (const row of rows) {
    // As in "Okazje": the offer is not part of the market that values it, and new-book shops alone
    // say nothing about a used copy.
    const others = (observations.get(String(row.editionId)) ?? []).filter(
      (item) => item.offerId !== row.offerId,
    );
    if (!others.some((item) => item.kind !== 'new_shop' && item.state !== 'gone')) continue;
    const valuation = estimateValue(others, at, options);
    if (
      valuation.estimate == null ||
      valuation.sold + valuation.live < 2 ||
      !['high', 'medium'].includes(valuation.confidence)
    )
      continue;
    const factors = /** @type {Record<string, number>} */ (CONDITION_FACTOR);
    const worth =
      Math.round(valuation.estimate / (factors[String(row.condition)] || 1) / 100) * 100;
    const price = Number(row.price);
    const key = String(row.sellerId);
    const seller = sellers.get(key) ?? {
      sellerId: key,
      sellerName: row.sellerName == null ? null : String(row.sellerName),
      source: String(row.source),
      count: 0,
      totalPrice: 0,
      totalWorth: 0,
      offers: [],
    };
    sellers.set(key, seller);
    seller.count += 1;
    seller.totalPrice += price;
    seller.totalWorth += worth;
    seller.offers.push({
      offerId: String(row.offerId),
      title: String(row.title),
      url: String(row.url),
      image: row.image ? proxiedImage(String(row.image)) : null,
      price,
      worth,
      saving: worth - price,
    });
  }
  const watched = watchedKeys(repository);
  const bundles = [...sellers.values()]
    .filter((seller) => seller.count >= minBooks)
    .map((seller) => ({
      ...seller,
      watched: watched.has(watchKey(seller.source, seller.sellerId)),
      totalSaving: seller.totalWorth - seller.totalPrice,
      offers: seller.offers.sort((a, b) => b.saving - a.saving),
    }))
    .sort(
      (a, b) =>
        b.totalSaving - a.totalSaving || b.count - a.count || a.sellerId.localeCompare(b.sellerId),
    );
  return { minBooks, total: bundles.length, items: bundles.slice(0, Math.max(1, limit)) };
}
