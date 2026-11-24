// @ts-check
// „Okno przewagi”: how fast an announced deal is found after the offer was listed, and how long it
// lives. Read only, from the announcements (deal_alerts) and their offers. An offer still on sale is
// censored (its life is "at least"), never counted as a short one; an offer without a listing time is
// counted apart. Fewer than MIN_DEALS in a group: no numbers.
import { median } from './stock.mjs';

export const MIN_DEALS = 30;
const MINUTE = 60_000;
/** Still buyable: its life is not over (censored). Any other state means it is gone. */
const ALIVE = new Set(['available', 'unconfirmed']);

/** @param {number[]} sorted ascending, non-empty @param {number} q 0..1 */
function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * @param {{ database: any }} repository
 * @param {{ at?: number, days?: number }} [options]
 */
export function dealLifetime(repository, { at = Date.now(), days = 60 } = {}) {
  const rows = repository.database
    .prepare(
      `SELECT a.alerted_at AS alertedAt, o.listed_at AS listedAt, o.availability,
         coalesce(o.availability_changed_at, o.last_seen_at) AS endedAt
       FROM deal_alerts a JOIN offers o ON o.id=a.offer_id WHERE a.alerted_at >= ?`,
    )
    .all(new Date(at - days * 86_400_000).toISOString());
  let noListingTime = 0;
  let alive = 0;
  /** @type {number[]} */ const delays = [];
  /** @type {number[]} */ const lives = [];
  for (const row of rows) {
    const listed = Date.parse(String(row.listedAt ?? ''));
    if (!Number.isFinite(listed)) {
      noListingTime += 1;
      continue;
    }
    const alerted = Date.parse(String(row.alertedAt));
    if (alerted >= listed) delays.push(Math.round((alerted - listed) / MINUTE));
    if (ALIVE.has(String(row.availability))) {
      alive += 1;
      continue;
    }
    const ended = Date.parse(String(row.endedAt ?? ''));
    if (Number.isFinite(ended) && ended >= listed)
      lives.push(Math.round((ended - listed) / MINUTE));
  }
  delays.sort((a, b) => a - b);
  lives.sort((a, b) => a - b);
  const enough = rows.length - noListingTime >= MIN_DEALS;
  return {
    days,
    minDeals: MIN_DEALS,
    deals: rows.length,
    noListingTime,
    alive,
    enough,
    medianDelayMinutes: enough ? median(delays) : null,
    gone: lives.length,
    lifeMinutes:
      enough && lives.length ? { p50: quantile(lives, 0.5), p75: quantile(lives, 0.75) } : null,
  };
}
