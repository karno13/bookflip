// @ts-check
// „Puls rynku”: three daily counts for the last N days (Warsaw days, today included): offers seen for
// the first time, offers that went off (sold / unavailable) and deals announced (deal_alerts).
// Read only. The first_seen count follows the scans (a first scan of a new source is one tall bar),
// it is not the inflow of the market; the chart says so.
import { addDays, warsawDay } from './week-report.mjs';

export const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

/** @type {WeakMap<object, { stamp: string, days: number, at: number, result: any }>} */
const cache = new WeakMap();

/**
 * Cached for a minute while the data does not change (the view asks on every refresh of „Dziś”).
 * @param {{ database: any }} repository
 * @param {{ days?: number, now?: () => number }} [options]
 */
export function activitySeries(repository, options = {}) {
  const now = options.now ?? (() => Date.now());
  const database = repository.database;
  const changes = database.prepare('SELECT total_changes() AS n').get();
  const version = database.prepare('PRAGMA data_version').get();
  const stamp = `${changes?.n}:${version?.data_version}`;
  const days = options.days ?? DEFAULT_DAYS;
  const hit = cache.get(database);
  if (hit && hit.stamp === stamp && hit.days === days && Math.abs(now() - hit.at) < 60_000)
    return structuredClone(hit.result);
  const result = computeSeries(repository, { days, now });
  cache.set(database, { stamp, days, at: now(), result });
  return structuredClone(result);
}

/**
 * @param {{ database: any }} repository
 * @param {{ days?: number, now?: () => number }} options
 */
function computeSeries(repository, { days = DEFAULT_DAYS, now = () => Date.now() }) {
  const span = Math.max(7, Math.min(MAX_DAYS, Math.trunc(Number(days)) || DEFAULT_DAYS));
  const today = warsawDay(now());
  const first = addDays(today, -(span - 1));
  // One day of slack on both sides of the window; the exact day is decided in Warsaw time below.
  const since = new Date(Date.parse(`${addDays(first, -1)}T00:00:00Z`)).toISOString();
  /** @type {Map<string, { date: string, new: number, gone: number, alerts: number }>} */
  const byDay = new Map();
  for (let i = 0; i < span; i += 1) {
    const date = addDays(first, i);
    byDay.set(date, { date, new: 0, gone: 0, alerts: 0 });
  }
  /** @param {unknown} iso @param {'new' | 'gone' | 'alerts'} key */
  const count = (iso, key) => {
    const at = Date.parse(String(iso ?? ''));
    if (!Number.isFinite(at)) return;
    const entry = byDay.get(warsawDay(at));
    if (entry) entry[key] += 1;
  };
  const database = repository.database;
  for (const row of database
    .prepare('SELECT first_seen_at AS at FROM offers WHERE first_seen_at >= ?')
    .all(since))
    count(row.at, 'new');
  for (const row of database
    .prepare(
      "SELECT availability_changed_at AS at FROM offers WHERE availability IN ('sold','unavailable') AND availability_changed_at >= ?",
    )
    .all(since))
    count(row.at, 'gone');
  try {
    for (const row of database
      .prepare('SELECT alerted_at AS at FROM deal_alerts WHERE alerted_at >= ?')
      .all(since))
      count(row.at, 'alerts');
  } catch {
    // An older copy without deal alerts: that series stays at zero.
  }
  const list = [...byDay.values()];
  const total = (/** @type {'new' | 'gone' | 'alerts'} */ key) =>
    list.reduce((sum, entry) => sum + entry[key], 0);
  return {
    from: first,
    to: today,
    days: list,
    totals: { new: total('new'), gone: total('gone'), alerts: total('alerts') },
  };
}
