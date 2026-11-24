// @ts-check
// An offer that a complete scan of its search phrase no longer returns has most likely been sold or
// withdrawn. It is marked "not_seen" (re-seen offers return to "unconfirmed" on the next upsert), so
// that nobody spends review time on listings that are gone. Only a scan that reached the end of
// the results (status ok + pagination end) is allowed to conclude that an offer disappeared.
import { isCategorySource } from './antiquarian-sources.mjs';

export function completeResults(results = []) {
  return results.filter(
    (result) =>
      result?.status === 'ok' &&
      result.pagination?.state === 'end' &&
      // Offers whose language could not be read were dropped from the list: they may still be
      // listed, so the scan cannot prove that anything is gone.
      !(result.rejected?.language_unknown > 0) &&
      // Same for listings dropped because their price could not be read.
      !(result.rejected?.price_unknown > 0) &&
      result.source &&
      result.query,
  );
}

export function markUnseenOffers(database, results, scannedAt) {
  let marked = 0;
  const statement = database.prepare(
    `UPDATE offers SET availability='not_seen'
     WHERE source=? AND availability='unconfirmed' AND last_seen_at < ?
       AND id IN (SELECT offer_id FROM offer_queries WHERE query=?)
     RETURNING id`,
  );
  const history = database.prepare(
    "INSERT OR IGNORE INTO offer_status_history(offer_id,status,via,observed_at) VALUES(?,'not_seen','scan',?)",
  );
  for (const result of completeResults(results))
    for (const row of statement.all(result.source, scannedAt, result.query)) {
      history.run(row.id, scannedAt);
      marked++;
    }
  return marked;
}

// Vinted answers at most 10 pages of one query. Until 22.11.2026 a read that stopped at page 10 was
// taken for "end", so offers beyond the cap were marked "not_seen" although still listed. The summary of
// the scan that set the mark says which phrases were read (pages per result); an offer that only
// capped phrases could have vouched for goes back to "unconfirmed". It relies on the scan summary
// (`scan_runs`) at the time of the mark and on `offer_queries` as they are now; an offer with any later
// history row (a check, a manual status, a new sighting) or without a readable summary is left alone.
const CAP_PAGES = 10;
/** @param {{ database: import('node:sqlite').DatabaseSync, transaction: (fn: () => unknown) => unknown }} repository */
export function repairCappedNotSeen(repository, { now = new Date().toISOString() } = {}) {
  const db = repository.database;
  const offers = db
    .prepare("SELECT id FROM offers WHERE source='Vinted' AND availability='not_seen'")
    .all();
  const latestMark = db.prepare(
    "SELECT MAX(observed_at) AS at FROM offer_status_history WHERE offer_id=? AND status='not_seen' AND via='scan'",
  );
  const later = db.prepare('SELECT 1 FROM offer_status_history WHERE offer_id=? AND observed_at>?');
  const summary = db.prepare('SELECT summary_json FROM scan_runs WHERE scanned_at=?');
  const queries = db.prepare('SELECT query FROM offer_queries WHERE offer_id=?');
  /** @type {Map<string, any[]|null>} */
  const results = new Map();
  const resultsAt = (/** @type {string} */ at) => {
    if (!results.has(at)) {
      const row = /** @type {any} */ (summary.get(at));
      let list = null;
      try {
        if (row) list = JSON.parse(row.summary_json)?.context?.results ?? null;
      } catch {
        list = null;
      }
      results.set(at, Array.isArray(list) ? list : null);
    }
    return results.get(at);
  };
  const capped = (/** @type {any} */ result) =>
    Math.max(0, ...(result.pages ?? []).map((/** @type {any} */ p) => Number(p.page) || 0)) >=
    CAP_PAGES;
  let restored = 0;
  for (const { id } of /** @type {any[]} */ (offers)) {
    const at = /** @type {any} */ (latestMark.get(id))?.at;
    if (!at || later.get(id, at)) continue;
    const list = resultsAt(at);
    if (!list) continue;
    const mine = new Set(/** @type {any[]} */ (queries.all(id)).map((r) => r.query));
    const vouching = list.filter(
      (r) =>
        r?.source === 'Vinted' &&
        r.status === 'ok' &&
        r.pagination?.state === 'end' &&
        mine.has(r.query),
    );
    if (!vouching.length || !vouching.every(capped)) continue;
    db.prepare(
      "UPDATE offers SET availability='unconfirmed' WHERE id=? AND availability='not_seen'",
    ).run(id);
    // The history keeps the old mark; a later 'unknown' row (via backfill) records the repair.
    db.prepare(
      "INSERT OR IGNORE INTO offer_status_history(offer_id,status,via,observed_at) VALUES(?,'unknown','backfill',?)",
    ).run(id, now);
    restored++;
  }
  return { restored, checked: offers.length };
}

// A category read whose pages held no offer at all (every page counted 0) proves nothing: a shop that
// changed its layout reads exactly like that (Antykwariat NWS from 19.11.2026: pages and "end" were
// right, every card was dropped by the parser), and its offers were marked "not_seen". Same rules as
// above: an offer goes back to "unconfirmed" when every result that vouched for the mark was such an
// empty read of a bookshop category; offers with later history or without a readable summary stay.
/** @param {{ database: import('node:sqlite').DatabaseSync }} repository */
export function repairEmptyCategoryNotSeen(repository, { now = new Date().toISOString() } = {}) {
  const db = repository.database;
  const offers = /** @type {any[]} */ (
    db.prepare("SELECT id, source FROM offers WHERE availability='not_seen'").all()
  ).filter((offer) => isCategorySource(offer.source));
  const latestMark = db.prepare(
    "SELECT MAX(observed_at) AS at FROM offer_status_history WHERE offer_id=? AND status='not_seen' AND via='scan'",
  );
  const later = db.prepare('SELECT 1 FROM offer_status_history WHERE offer_id=? AND observed_at>?');
  const summary = db.prepare('SELECT summary_json FROM scan_runs WHERE scanned_at=?');
  const queries = db.prepare('SELECT query FROM offer_queries WHERE offer_id=?');
  const empty = (/** @type {any} */ result) =>
    Array.isArray(result.pages) &&
    result.pages.length > 0 &&
    result.pages.every((/** @type {any} */ page) => !(Number(page.count) > 0));
  let restored = 0;
  for (const { id, source } of offers) {
    const at = /** @type {any} */ (latestMark.get(id))?.at;
    if (!at || later.get(id, at)) continue;
    let list = null;
    try {
      const row = /** @type {any} */ (summary.get(at));
      if (row) list = JSON.parse(row.summary_json)?.context?.results ?? null;
    } catch {
      list = null;
    }
    if (!Array.isArray(list)) continue;
    const mine = new Set(/** @type {any[]} */ (queries.all(id)).map((r) => r.query));
    const vouching = list.filter(
      (r) =>
        r?.source === source &&
        r.status === 'ok' &&
        r.pagination?.state === 'end' &&
        mine.has(r.query),
    );
    if (!vouching.length || !vouching.every(empty)) continue;
    db.prepare(
      "UPDATE offers SET availability='unconfirmed' WHERE id=? AND availability='not_seen'",
    ).run(id);
    db.prepare(
      "INSERT OR IGNORE INTO offer_status_history(offer_id,status,via,observed_at) VALUES(?,'unknown','backfill',?)",
    ).run(id, now);
    restored++;
  }
  return { restored, checked: offers.length };
}

// Parser-independent safety net. A read that is "complete" (status ok, end of results) can still be
// wrong: a shop that changed its layout reads as 0 cards on every page with a proper "end" (Antykwariat
// NWS, 19.11.2026: 406 cards before, 0 after). Before disappearances are concluded for a source+phrase,
// the number of cards the read returned is compared with the previous complete read of the same pair
// (from the saved scan summaries, no extra storage). Replay on the 49 scans of the working copy:
// 2214 comparisons with a baseline of 10 or more cards, lowest legitimate ratio 0.62, all 190 reads
// below 0.2 were the NWS layout break.
export const DROP_MIN_BEFORE = 10;
export const DROP_RATIO = 0.2;
export const SUSPICIOUS_DROP_CODE = 'SOURCE_SUSPICIOUS_DROP';
const DROP_LOOKBACK_RUNS = 40;
const DROP_STABLE_TOLERANCE = 0.2;

/** Cards the read returned: the sum over pages (parser output before filtering), else the count. */
function cardCount(/** @type {any} */ result) {
  if (Array.isArray(result?.pages) && result.pages.length)
    return result.pages.reduce(
      (/** @type {number} */ sum, /** @type {any} */ page) => sum + (Number(page?.count) || 0),
      0,
    );
  return Number(result?.count) || 0;
}

/**
 * Complete reads whose card count collapsed against the previous complete read of the same
 * source+phrase. Reads flagged earlier are skipped as a baseline, so a lasting break stays flagged.
 * @returns {{ source: string, query: string, before: number, now: number }[]}
 */
export function findSuspiciousDrops(database, results, scannedAt) {
  const wanted = completeResults(results);
  if (!wanted.length) return [];
  const todo = new Map(wanted.map((result) => [`${result.source}\u0000${result.query}`, result]));
  const baseline = new Map();
  /** Most recent earlier complete read of each pair (flagged or not). */
  const last = new Map();
  let runs = [];
  try {
    runs = database
      .prepare(
        'SELECT summary_json FROM scan_runs WHERE scanned_at<? ORDER BY scanned_at DESC LIMIT ?',
      )
      .all(scannedAt, DROP_LOOKBACK_RUNS * 5);
  } catch {
    return [];
  }
  let batchRuns = 0;
  for (const run of runs) {
    if (baseline.size >= todo.size || batchRuns >= DROP_LOOKBACK_RUNS) break;
    let summary;
    try {
      summary = JSON.parse(run.summary_json);
    } catch {
      continue;
    }
    // Newest-listing (sniper) runs read other phrases and do not count towards the lookback.
    if (summary?.context?.mode === 'newest') continue;
    batchRuns++;
    const flagged = new Set(
      (summary?.errors ?? [])
        .filter((/** @type {any} */ e) => e?.code === SUSPICIOUS_DROP_CODE)
        .map((/** @type {any} */ e) => `${e.source} ${e.query}`),
    );
    for (const previous of completeResults(summary?.context?.results ?? [])) {
      const key = `${previous.source} ${previous.query}`;
      if (!todo.has(key)) continue;
      const isFlagged = flagged.has(key);
      if (!last.has(key)) last.set(key, { count: cardCount(previous), flagged: isFlagged });
      if (!baseline.has(key) && !isFlagged) baseline.set(key, cardCount(previous));
    }
  }
  const drops = [];
  for (const [key, result] of todo) {
    const before = baseline.get(key);
    const now = cardCount(result);
    if (!(before >= DROP_MIN_BEFORE && now < before * DROP_RATIO)) continue;
    // A lasting real shrink: the previous complete read was flagged too and has about the same
    // (non-zero) size, so this is a stable new level. A 0-card level is never accepted: that is
    // exactly the signature of a broken layout.
    const prev = last.get(key);
    if (
      now > 0 &&
      prev?.flagged &&
      prev.count > 0 &&
      Math.abs(now - prev.count) <= DROP_STABLE_TOLERANCE * Math.max(now, prev.count)
    )
      continue;
    drops.push({ source: result.source, query: result.query, before, now });
  }
  return drops;
}

/** Scan-summary problem entries (shown by scanProblems / the source status) for suspicious drops. */
export function dropProblems(drops) {
  return drops.map((drop) => ({
    source: drop.source,
    query: drop.query,
    code: SUSPICIOUS_DROP_CODE,
    retryable: false,
    message: `Podejrzanie mało ofert: ${drop.now} zamiast ${drop.before} — możliwa zmiana strony; nie oznaczam zniknięć`,
  }));
}

/** The results with the suspicious reads left out: they must not conclude any disappearance. */
export function withoutDrops(results, drops) {
  const bad = new Set(drops.map((drop) => `${drop.source}\u0000${drop.query}`));
  return (results ?? []).filter((result) => !bad.has(`${result?.source}\u0000${result?.query}`));
}
