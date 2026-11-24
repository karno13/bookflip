// @ts-check
// When new listings appear: how many offers were first seen in each hour of the week (local time) in
// the last weeks, and from that a sniper interval for each of those 168 hours. In the busy hours the
// interval is shorter (down to 15 min), in the quiet ones longer (up to 60 min), and the total number
// of scans per week never exceeds the fixed interval's: the budget does not grow. With too little data
// every hour has the base interval, i.e. exactly today's behaviour.
// first_seen_at is the time of OUR scan, not of the listing: an owner who scans only in the evening
// sees every offer then (measured 2026-11-21: 91.7% of offers in 5 hours, a fake 38x peak/night ratio).
// So the offers of an hour of the week are divided by how many times that hour was actually scanned
// (offers per scanned hour); an hour scanned too rarely is unknown and keeps the base interval.

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** One calendar hour counts at most this many times the median busy hour (but never less than MIN_HOUR_CAP). */
const HOUR_CAP_FACTOR = 2;
const MIN_HOUR_CAP = 5;
/** Absolute ceiling, so an import that fills most of the history cannot pass for a pattern. */
const MAX_HOUR_CAP = 50;
/** Shortest and longest interval between sniper runs, in minutes. */
export const MIN_INTERVAL = 15;
export const MAX_INTERVAL = 60;
/** Enough history to trust the pattern. */
export const MIN_SPAN_DAYS = 14;
export const MIN_OFFERS = 200;
export const SLOTS = 168;
/** An hour of the week counts as known only when it was scanned in at least this many calendar hours of the window. */
export const MIN_SCANS = 3;
/** The profile needs this share of the 168 hours known, otherwise it only describes when the owner scans. */
export const MIN_COVERAGE = 0.5;

/** Hour of the week (0 = Sunday 00:00) of a time, in the machine's local time. @param {number} ms */
export function slotOf(ms) {
  const date = new Date(ms);
  return date.getDay() * 24 + date.getHours();
}

/** @param {number} minutes */
const clamp = (minutes) => Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(minutes)));

/**
 * Offers first seen per hour of the week.
 * @param {{ database: any }} repository
 * @param {{ at?: number, days?: number }} [options]
 */
export function inflowCounts(repository, { at = Date.now(), days = 28 } = {}) {
  const from = new Date(at - days * DAY).toISOString();
  const rows = repository.database
    .prepare(
      'SELECT first_seen_at AS seen FROM offers WHERE first_seen_at >= ? AND first_seen_at <= ?',
    )
    .all(from, new Date(at).toISOString());
  // Offers per calendar hour first: one first big scan or import lands in a single hour, and counted
  // as it is it would make that hour of the week look like the busiest one.
  /** @type {Map<number, { slot: number, count: number }>} */
  const perHour = new Map();
  let earliest = Infinity;
  for (const row of rows) {
    const time = Date.parse(String(row.seen));
    if (!Number.isFinite(time)) continue;
    const hour = Math.floor(time / HOUR);
    const entry = perHour.get(hour) ?? { slot: slotOf(time), count: 0 };
    entry.count += 1;
    perHour.set(hour, entry);
    earliest = Math.min(earliest, time);
  }
  const sorted = [...perHour.values()].map((entry) => entry.count).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const cap = Math.min(MAX_HOUR_CAP, Math.max(MIN_HOUR_CAP, HOUR_CAP_FACTOR * median));
  const counts = new Array(SLOTS).fill(0);
  for (const { slot, count } of perHour.values()) counts[slot] += Math.min(count, cap);
  const offers = counts.reduce((sum, value) => sum + value, 0);
  // Calendar hours with at least one scan, per hour of the week (several scans in one hour count once).
  const scans = new Array(SLOTS).fill(0);
  let scanRows = [];
  try {
    scanRows = repository.database
      .prepare('SELECT scanned_at AS at FROM scan_runs WHERE scanned_at >= ? AND scanned_at <= ?')
      .all(from, new Date(at).toISOString());
  } catch {}
  const scannedHours = new Set();
  for (const row of scanRows) {
    const time = Date.parse(String(row.at));
    if (!Number.isFinite(time)) continue;
    const hour = Math.floor(time / HOUR);
    if (scannedHours.has(hour)) continue;
    scannedHours.add(hour);
    scans[slotOf(time)] += 1;
  }
  return { counts, scans, offers, spanDays: Number.isFinite(earliest) ? (at - earliest) / DAY : 0 };
}

/**
 * The interval for each hour of the week.
 * @param {number[]} counts offers per hour of the week (per scanned hour when `known` is given)
 * @param {number} base the fixed interval in minutes (15, 20, 30 or 60)
 * @param {{ enough?: boolean, known?: boolean[] }} [options] enough false: every hour gets the base
 *   interval; known: hours without data (false) keep the base interval and take no part in the pattern
 * @returns {number[]}
 */
export function sniperIntervals(counts, base, { enough = true, known } = {}) {
  const flat = new Array(SLOTS).fill(base);
  const isKnown = (/** @type {number} */ slot) => (known ? known[slot] === true : true);
  const knownSlots = counts.map((_, slot) => slot).filter(isKnown);
  const total = knownSlots.reduce((sum, slot) => sum + counts[slot], 0);
  if (!enough || !total) return flat;
  const mean = total / knownSlots.length;
  // Smoothed so an hour with no offers is quiet, not infinitely so.
  const weights = counts.map((value) => (value + mean * 0.25) / (mean * 1.25));
  // Only the known hours are planned; the unknown ones keep the base interval and its share of the budget.
  const budget = knownSlots.length * (60 / base);
  /** @param {number} k */
  const intervalsAt = (k) =>
    weights.map((weight, slot) => (isKnown(slot) ? clamp(base / (weight * k)) : base));
  /** @param {number[]} intervals */
  const scans = (intervals) => knownSlots.reduce((sum, slot) => sum + 60 / intervals[slot], 0);
  // Busy hours are scanned in proportion to their inflow (factor 1). Only when that would take more
  // scans than the fixed interval does the whole thing slow down until it fits: the budget never grows.
  let low = 0.01;
  let high = 1;
  let result = intervalsAt(1);
  if (scans(result) > budget) {
    for (let step = 0; step < 50; step++) {
      const middle = (low + high) / 2;
      if (scans(intervalsAt(middle)) <= budget) low = middle;
      else high = middle;
    }
    result = intervalsAt(low);
  }
  // Rounding must never take the weekly budget over: fall back to the fixed interval if it did.
  return scans(result) <= budget + 1e-9 ? result : flat;
}

/**
 * The profile to store with the sniper: intervals for the 168 hours and what they rest on.
 * @param {{ database: any }} repository
 * @param {number} base
 * @param {{ at?: number }} [options]
 */
export function sniperProfile(repository, base, { at = Date.now() } = {}) {
  const { counts, scans, offers, spanDays } = inflowCounts(repository, { at });
  const known = scans.map((value) => value >= MIN_SCANS);
  const coverage = known.filter(Boolean).length / SLOTS;
  const history = spanDays >= MIN_SPAN_DAYS && offers >= MIN_OFFERS;
  const enough = history && coverage >= MIN_COVERAGE;
  // Offers per scanned hour: the pattern of the market, not of when the owner happens to scan.
  const rates = counts.map((value, slot) => (known[slot] ? value / scans[slot] : 0));
  return {
    computedAt: new Date(at).toISOString(),
    enough,
    // Why the profile is flat: 'history' (too few days or offers) or 'coverage' (scans in too few hours).
    reason: enough ? null : history ? 'coverage' : 'history',
    offers,
    spanDays: Math.round(spanDays * 10) / 10,
    coverage: Math.round(coverage * 100) / 100,
    intervals: sniperIntervals(rates, base, { enough, known }),
  };
}
