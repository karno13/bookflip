// @ts-check
// Price cuts of offers, from their price history: how often sellers lower a price and by how much,
// and a hint of what a lower offer could be. Read only. A rise is not a cut; two successive observed
// prices are one event however far apart the scans were (cuts are not merged); a price of 10 000 zł or
// more is unknown and skipped. The hint is the median cut of ALL observed cuts (needs MIN_EVENTS of
// them), kept between MIN_FACTOR of the price and the price itself; it is a hint, never a target.
import { median } from './stock.mjs';

export const MIN_EVENTS = 30;
/** The hint never goes below this share of the current price. */
export const MIN_FACTOR = 0.6;

/**
 * @param {{ database: any }} repository
 * @returns {{ perOffer: Map<string, { count: number, lastPercent: number }>, events: number, medianCut: number | null }}
 */
export function priceDrops(repository) {
  const rows = repository.database
    .prepare(
      'SELECT offer_id AS offerId, price FROM offer_price_history ORDER BY offer_id, observed_at, id',
    )
    .all();
  /** @type {Map<string, { count: number, lastPercent: number }>} */
  const perOffer = new Map();
  /** @type {number[]} */ const cuts = [];
  let previous = null;
  let previousOffer = '';
  for (const row of rows) {
    const price = Number(row.price);
    if (price >= 1_000_000) continue;
    if (previous != null && row.offerId === previousOffer && price < previous) {
      const cut = (previous - price) / previous;
      cuts.push(cut);
      const entry = perOffer.get(String(row.offerId)) ?? { count: 0, lastPercent: 0 };
      entry.count += 1;
      entry.lastPercent = Math.round(cut * 100);
      perOffer.set(String(row.offerId), entry);
    }
    previous = price;
    previousOffer = String(row.offerId);
  }
  return {
    perOffer,
    events: cuts.length,
    medianCut: cuts.length >= MIN_EVENTS ? median(cuts) : null,
  };
}

/**
 * A hint for a lower price, in grosze, or null. @param {number} price @param {number | null} medianCut
 */
export function suggestedPrice(price, medianCut) {
  if (medianCut == null || !(price > 0)) return null;
  const lowest = Math.round((price * MIN_FACTOR) / 100) * 100;
  const hint = Math.max(lowest, Math.round((price * (1 - medianCut)) / 100) * 100);
  return hint < price ? hint : null;
}
