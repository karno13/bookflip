// @ts-check
// "Decyzje, które odblokowują najwięcej": the review queue counted in offers per decision, so the
// operator can see how few decisions clear how much of the queue. One decision is what
// reviewQueueSummary counts as one (offers sharing an ISBN follow one decision). Read only; the
// size is the number of offers and the sum of their listed prices, not a valuation (a valuation
// needs the edition, which is what the decision creates).
import { FOLLOWS_SAME_ISBN, GAME_REASONS, REASON_SQL, reviewSkippedIds } from './review-queue.mjs';

/** A price of 10 000 zł or more is treated as unknown (CLAUDE.md); prices are grosze. */
const PRICE_LIMIT = 1_000_000;

/**
 * @param {{ database: any }} repository
 * @param {{ top?: number }} [options]
 */
export function reviewUnlockPlan(repository, { top = 20 } = {}) {
  const rows = repository.database
    .prepare(
      `SELECT j.id AS jobId, o.observed_isbn AS isbn, o.current_price AS price,
         coalesce(${REASON_SQL},'') AS reason
       FROM identification_jobs j JOIN offers o ON o.id=j.offer_id
       WHERE j.status='review_required' AND o.source<>'Empik'`,
    )
    .all();
  const skipped = new Set(reviewSkippedIds(repository));
  /** @type {Map<string, { key: string, offers: number, price: number, reason: string, skipped: boolean }>} */
  const decisions = new Map();
  for (const row of rows) {
    const isbn = String(row.isbn ?? '')
      // The same rule as the SQL key of reviewQueueSummary (only hyphens and spaces).
      .replace(/[- ]/g, '')
      .toUpperCase();
    const key =
      isbn && FOLLOWS_SAME_ISBN.includes(String(row.reason)) ? `isbn:${isbn}` : `job:${row.jobId}`;
    const entry = decisions.get(key) ?? {
      key,
      offers: 0,
      price: 0,
      reason: String(row.reason),
      // A decision counts as skipped only when every offer under it was skipped.
      skipped: true,
    };
    decisions.set(key, entry);
    entry.offers += 1;
    const price = Number(row.price);
    if (row.price != null && Number.isFinite(price) && price > 0 && price < PRICE_LIMIT)
      entry.price += price;
    if (!skipped.has(String(row.jobId))) entry.skipped = false;
  }
  const all = [...decisions.values()];
  const totalOffers = all.reduce((sum, item) => sum + item.offers, 0);
  // Rejecting a game or a foreign edition leaves nothing to identify: it clears the queue, but
  // unlocks no offers for the market. Skipped decisions wait for the operator and are not offered.
  const candidates = all
    .filter((item) => !item.skipped && !GAME_REASONS.includes(item.reason))
    .sort((a, b) => b.offers - a.offers || b.price - a.price || a.key.localeCompare(b.key));
  const chosen = candidates.slice(0, Math.max(0, Math.floor(top)));
  const topOffers = chosen.reduce((sum, item) => sum + item.offers, 0);
  return {
    decisions: all.length,
    totalOffers,
    top: chosen.length,
    topOffers,
    share: totalOffers ? Math.round((topOffers / totalOffers) * 1000) / 1000 : 0,
    items: chosen.map(({ key, offers, price, reason }) => ({ key, offers, price, reason })),
  };
}
