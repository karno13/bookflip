// @ts-check
// „Co przyniosło towar”: copies of the stock register grouped by the phrase that found the offer
// and by the seller, from the snapshot taken at purchase (migration 146). Counts and days only,
// no amounts; a group with fewer than MIN_COPIES copies says "too little data" instead of a rate.
import { median } from './stock.mjs';

export const MIN_COPIES = 5;
const DAY = 86_400_000;

/** @param {string | null} from @param {string | null} to */
function days(from, to) {
  if (!from || !to) return null;
  const span = Date.parse(to) - Date.parse(from);
  return Number.isFinite(span) && span >= 0 ? Math.round(span / DAY) : null;
}

/**
 * @param {any} repository
 * @returns {{ phrases: any[], sellers: any[], unknown: number, noPhrase: number, total: number }}
 */
export function stockAttribution(repository) {
  const rows = repository.database
    .prepare(
      `SELECT s.id, s.status, s.listed_at, s.sold_at, s.source, s.source_seller_id, s.source_phrase
       FROM stock_items s
       WHERE NOT EXISTS (SELECT 1 FROM stock_events h WHERE h.item_id=s.id AND h.from_status IS NULL AND h.undone_at IS NOT NULL)
         AND EXISTS (SELECT 1 FROM stock_events b WHERE b.item_id=s.id AND b.to_status='bought')`,
    )
    .all();
  /** @type {Map<string, any[]>} */ const byPhrase = new Map();
  /** @type {Map<string, any[]>} */ const bySeller = new Map();
  let unknown = 0;
  let noPhrase = 0;
  /** @param {Map<string, any[]>} map @param {string} key @param {any} row */
  const push = (map, key, row) => map.set(key, [...(map.get(key) ?? []), row]);
  for (const row of rows) {
    if (!row.source_phrase && !row.source_seller_id) unknown += 1;
    if (!row.source_phrase) noPhrase += 1;
    if (row.source_phrase) push(byPhrase, String(row.source_phrase), row);
    if (row.source_seller_id)
      push(bySeller, `${row.source ?? ''}\u0000${row.source_seller_id}`, row);
  }
  /** @param {any[]} group */
  const summarize = (group) => {
    const enough = group.length >= MIN_COPIES;
    const sold = group.filter((row) => row.status === 'sold');
    const spans = sold.map((row) => days(row.listed_at, row.sold_at)).filter((v) => v != null);
    return {
      bought: group.length,
      enough,
      sold: enough ? sold.length : null,
      medianDaysToSold: enough ? median(/** @type {number[]} */ (spans)) : null,
    };
  };
  const order = (/** @type {any} */ a, /** @type {any} */ b) =>
    b.bought - a.bought || String(a.label).localeCompare(String(b.label), 'pl');
  const phrases = [...byPhrase]
    .map(([label, group]) => ({ label, ...summarize(group) }))
    .sort(order);
  const sellers = [...bySeller]
    .map(([key, group]) => {
      const [source, sellerId] = key.split('\u0000');
      return { label: `Sprzedawca #${sellerId}`, source, sellerId, ...summarize(group) };
    })
    .sort(order);
  return {
    phrases: phrases.slice(0, 50),
    sellers: sellers.slice(0, 50),
    unknown,
    noPhrase,
    total: rows.length,
  };
}
