// @ts-check
// Sniper "yield" phrases: the Vinted phrases that brought the most deals per request lately.
// Requests come from the saved scan summaries (scan_runs: pages read per source and phrase), deals
// from today's deal list joined to offer_queries (offers first seen in the window through the phrase).
// A phrase's first-ever run (requests and the offers first seen in it) is ignored: it shows the stock.
// Both are already in the database, so the ranking costs one pass and no new table. Nothing is requested.
import { listDeals } from './deals.mjs';
import { normalizeSearch } from './search-policy.mjs';

const DAY = 86_400_000;
const SOURCE = 'Vinted';
/** Smoothing prior: a phrase with no evidence scores PRIOR_DEALS / PRIOR_REQUESTS (about 2 per 100). */
export const PRIOR_DEALS = 1;
export const PRIOR_REQUESTS = 50;
/** How many best phrases the yield slots rotate through. */
export const YIELD_POOL = 6;

/**
 * Phrases ranked by smoothed deals per request, (deals + PRIOR_DEALS) / (requests + PRIOR_REQUESTS).
 * Only phrases with at least one deal qualify: without evidence a slot is no better than a regular one.
 * @param {{ database: any }} repository
 * @param {{ at?: number, days?: number, pool?: number }} [options]
 * @returns {{ phrase: string, deals: number, requests: number, score: number }[]}
 */
export function yieldTargets(repository, { at = Date.now(), days = 14, pool = YIELD_POOL } = {}) {
  const database = repository.database;
  const from = new Date(at - days * DAY).toISOString();
  /** @type {Map<string, { phrase: string, deals: number, requests: number }>} */
  const stats = new Map();
  const entry = (/** @type {string} */ phrase) => {
    const key = normalizeSearch(phrase);
    let item = stats.get(key);
    if (!item) stats.set(key, (item = { phrase, deals: 0, requests: 0 }));
    return item;
  };
  /** First-ever run per phrase: its offers are the stock already on the market, not the flow. */
  /** @type {Map<string, string>} */
  const firstRun = new Map();
  for (const row of database
    .prepare('SELECT scanned_at, summary_json FROM scan_runs ORDER BY scanned_at')
    .all()) {
    const scannedAt = String(row.scanned_at);
    let results = [];
    try {
      results = JSON.parse(String(row.summary_json))?.context?.results ?? [];
    } catch {}
    for (const result of results) {
      if (result?.source !== SOURCE || typeof result.query !== 'string') continue;
      const key = normalizeSearch(result.query);
      if (!firstRun.has(key)) firstRun.set(key, scannedAt);
      if (scannedAt < from || scannedAt === firstRun.get(key)) continue;
      entry(result.query).requests += Array.isArray(result.pages) ? result.pages.length || 1 : 1;
    }
  }
  const dealIds = new Set(
    listDeals(repository, { at })
      .items.filter((deal) => deal.source === SOURCE && !deal.hidden)
      .map((deal) => deal.offerId),
  );
  if (!dealIds.size) return [];
  const byOffer = new Map();
  for (const row of database
    .prepare(
      `SELECT q.offer_id AS id, q.query AS query, o.first_seen_at AS first_seen_at FROM offer_queries q JOIN offers o ON o.id=q.offer_id
       WHERE o.source=? AND o.first_seen_at>=?`,
    )
    .all(SOURCE, from)) {
    if (!dealIds.has(String(row.id))) continue;
    // An offer first seen in the phrase's first-ever run was already listed before the phrase was asked.
    const first = firstRun.get(normalizeSearch(String(row.query)));
    if (first && String(row.first_seen_at) <= first) continue;
    const list = byOffer.get(String(row.id)) ?? [];
    list.push(String(row.query));
    byOffer.set(String(row.id), list);
  }
  // An offer found through several phrases is shared between them.
  for (const queries of byOffer.values())
    for (const query of queries)
      if (stats.has(normalizeSearch(query))) entry(query).deals += 1 / queries.length;
  return [...stats.values()]
    .filter((item) => item.deals > 0 && item.requests > 0)
    .map((item) => ({
      ...item,
      deals: Math.round(item.deals * 100) / 100,
      score: (item.deals + PRIOR_DEALS) / (item.requests + PRIOR_REQUESTS),
    }))
    .sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase))
    .slice(0, pool);
}
