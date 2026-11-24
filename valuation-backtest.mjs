// @ts-check
// Backtest of valuations (read only): for offers that went off as "sold" (the market index's
// assumption: availability 'sold'), compare the last asking price with the valuation of their
// edition computed as it stood BEFORE the offer went off. Time is respected as far as the data allows:
// only offers first seen before that moment count, every price is the one in force then
// (offer_price_history), an offer that was already off by then is sold/gone as of its own time, and the
// offer itself is left out. Not time-travelled (only today's state is stored): which edition an offer
// is assigned to, trackedSince, and offers gone without a usable time (those are skipped).
// Ratio = last price / estimate; 1 means the valuation hit it. Raw price: the valuation is for a
// "good used copy" and the sold copy's condition is not adjusted here.
import { estimateValue, valuationOptions } from './market-valuation.mjs';
import { offerKindSql } from './offer-kinds.mjs';

const DAY = 86_400_000;
/** Fewer samples than this in a group: no figures, only "za mało danych". */
export const MIN_SAMPLES = 20;
export const BAND = { low: 0.8, high: 1.2 };
export const BACKTEST_DAYS = 90;
const MAX_PRICE = 1_000_000;
/** Bands (grosze) of the valuation for the second table: label, from, to (exclusive). @type {[string, number, number][]} */
const PRICE_BANDS = [
  ['do 15 zł', 0, 1500],
  ['15–30 zł', 1500, 3000],
  ['30–60 zł', 3000, 6000],
  ['od 60 zł', 6000, Infinity],
];
/** Ratio buckets of the distribution: [from, to). */
const BUCKETS = [
  [0, 0.6],
  [0.6, 0.8],
  [0.8, 1.2],
  [1.2, 1.5],
  [1.5, Infinity],
];

/** @param {number[]} sorted */
const quantile = (sorted, q) => {
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const rest = position - below;
  return sorted[below] + (sorted[Math.min(below + 1, sorted.length - 1)] - sorted[below]) * rest;
};
const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

/** @param {number[]} ratios */
export function summarizeRatios(ratios) {
  const samples = ratios.length;
  if (samples < MIN_SAMPLES)
    return { samples, enough: false, message: 'Za mało danych', median: null };
  const sorted = [...ratios].sort((a, b) => a - b);
  const inBand = sorted.filter((r) => r >= BAND.low && r <= BAND.high).length;
  return {
    samples,
    enough: true,
    median: round(quantile(sorted, 0.5)),
    p10: round(quantile(sorted, 0.1)),
    p25: round(quantile(sorted, 0.25)),
    p75: round(quantile(sorted, 0.75)),
    p90: round(quantile(sorted, 0.9)),
    inBandShare: round(inBand / samples),
    buckets: BUCKETS.map(([from, to]) => ({
      from,
      to: Number.isFinite(to) ? to : null,
      count: sorted.filter((r) => r >= from && r < to).length,
    })),
  };
}

/** @type {WeakMap<object, { stamp: string, at: number, days: number, result: any }>} */
const cache = new WeakMap();

/**
 * Index of the last point with `at <= t` in a list sorted by `at`, or -1.
 * @param {{ at: number }[]} points
 */
function lastAtOrBefore(points, t) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].at <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Cached (same data, same minute): the result changes only with the data or with the window moving.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {{ at?: number, days?: number }} [options] at: "now" (injected); days: how far back the sales may lie
 */
export function valuationBacktest(repository, { at = Date.now(), days = BACKTEST_DAYS } = {}) {
  const database = repository.database;
  const changes = database.prepare('SELECT total_changes() AS n').get();
  const version = database.prepare('PRAGMA data_version').get();
  const stamp = `${changes?.n}:${version?.data_version}`;
  const hit = cache.get(database);
  if (hit && hit.stamp === stamp && hit.days === days && Math.abs(at - hit.at) < 60_000)
    return structuredClone(hit.result);
  const result = computeBacktest(database, at, days);
  cache.set(database, { stamp, at, days, result });
  return structuredClone(result);
}

/**
 * @param {import('node:sqlite').DatabaseSync} database
 * @param {number} at
 * @param {number} days
 */
function computeBacktest(database, at, days) {
  const rows = database
    .prepare(
      `SELECT m.edition_id AS editionId, e.is_unknown AS unknownEdition, o.id AS offerId,
         o.current_price AS price, o.availability AS availability, o.last_seen_at AS lastSeenAt,
         coalesce(o.condition_class,'unknown') AS condition, ${offerKindSql('o')} AS kind,
         o.first_seen_at AS firstSeenAt, o.availability_changed_at AS changedAt
       FROM offer_matches m JOIN editions e ON e.id=m.edition_id JOIN offers o ON o.id=m.offer_id
       WHERE m.status='active' AND o.currency='PLN' AND o.current_price>0 AND e.is_unknown=0
         AND m.edition_id IN (SELECT m2.edition_id FROM offer_matches m2 JOIN offers o2 ON o2.id=m2.offer_id
           WHERE m2.status='active' AND o2.availability='sold' AND o2.availability_changed_at IS NOT NULL)`,
    )
    .all();
  const since = at - days * DAY;
  // Editions with a sale inside the window: only those are valued, only their offers need prices.
  const wanted = new Set();
  for (const row of rows) {
    const t = row.changedAt == null ? NaN : Date.parse(String(row.changedAt));
    if (row.availability === 'sold' && Number.isFinite(t) && t <= at && t >= since)
      wanted.add(String(row.editionId));
  }
  /** @type {Map<string, { price: number, at: number }[]>} */
  const history = new Map();
  if (wanted.size)
    for (const row of database
      .prepare(
        `SELECT h.offer_id AS id, h.price, h.observed_at AS at FROM offer_price_history h
         WHERE h.offer_id IN (SELECT o.id FROM offer_matches m JOIN offers o ON o.id=m.offer_id
           WHERE m.status='active' AND m.edition_id IN (SELECT value FROM json_each(?)))
         ORDER BY h.offer_id, h.observed_at, h.id`,
      )
      .all(JSON.stringify([...wanted]))) {
      const list = history.get(String(row.id)) ?? [];
      history.set(String(row.id), list);
      const point = { price: Number(row.price), at: Date.parse(String(row.at)) };
      if (Number.isFinite(point.at)) list.push(point);
    }
  const byEdition = new Map();
  for (const row of rows) {
    if (!wanted.has(String(row.editionId))) continue;
    const list = byEdition.get(String(row.editionId)) ?? [];
    byEdition.set(String(row.editionId), list);
    list.push({
      offerId: String(row.offerId),
      editionId: String(row.editionId),
      price: Number(row.price),
      availability: String(row.availability),
      lastSeenAt: Date.parse(String(row.lastSeenAt)),
      condition: String(row.condition),
      kind: String(row.kind),
      firstSeenAt: Date.parse(String(row.firstSeenAt)),
      changedAt: row.changedAt == null ? NaN : Date.parse(String(row.changedAt)),
    });
  }
  const options = valuationOptions(database);
  /** @type {{ ratio: number, confidence: string, estimate: number, sold: number }[]} */
  const samples = [];
  for (const offers of byEdition.values()) {
    for (const target of offers) {
      const t = target.changedAt;
      if (target.availability !== 'sold' || !Number.isFinite(t) || t > at || t < since) continue;
      if (target.price >= MAX_PRICE) continue;
      /** @type {import('./market-valuation.mjs').Observation[]} */
      const observations = [];
      for (const other of offers) {
        if (other === target || !(other.firstSeenAt < t)) continue;
        const goneAt =
          other.availability === 'sold' ||
          other.availability === 'unavailable' ||
          other.availability === 'reserved'
            ? other.changedAt
            : other.availability === 'not_seen'
              ? other.lastSeenAt
              : NaN;
        // Gone with no usable time of going: cannot be placed before or after t, so it is left out
        // (it would otherwise count as a live price).
        const goneKind =
          other.availability === 'sold' ||
          other.availability === 'unavailable' ||
          other.availability === 'reserved';
        if (goneKind && !Number.isFinite(goneAt)) continue;
        const off = Number.isFinite(goneAt) && goneAt < t;
        const points = history.get(other.offerId) ?? [];
        const lastKnown = lastAtOrBefore(points, t);
        if (!off && lastKnown < 0) continue; // no price known as of then
        const price = off ? other.price : points[lastKnown].price;
        /** @type {'live'|'sold'|'gone'} */
        const state = !off ? 'live' : other.availability === 'sold' ? 'sold' : 'gone';
        observations.push({
          offerId: other.offerId,
          editionId: other.editionId,
          price,
          state,
          kind: other.kind,
          condition: other.condition,
          firstSeenAt: new Date(other.firstSeenAt).toISOString(),
          soldAt: state === 'sold' ? new Date(goneAt).toISOString() : null,
          firstPrice: points[0]?.price ?? null,
        });
      }
      const valuation = estimateValue(observations, t, options);
      if (valuation.estimate == null || valuation.confidence === 'none') continue;
      samples.push({
        ratio: target.price / valuation.estimate,
        confidence: valuation.confidence,
        estimate: valuation.estimate,
        sold: valuation.sold,
      });
    }
  }
  const of = (/** @type {string} */ level) =>
    summarizeRatios(samples.filter((s) => s.confidence === level).map((s) => s.ratio));
  return {
    at: new Date(at).toISOString(),
    days,
    minSamples: MIN_SAMPLES,
    band: BAND,
    overall: summarizeRatios(samples.map((s) => s.ratio)),
    byConfidence: { high: of('high'), medium: of('medium'), low: of('low') },
    // Where the valuation misses: by the valuation itself (never by the price the copy sold at: that
    // would select on the outcome and make cheap sales look overvalued) and by whether any sale backed it.
    byPrice: PRICE_BANDS.map(([label, from, to]) => ({
      label,
      ...summarizeRatios(
        samples.filter((s) => s.estimate >= from && s.estimate < to).map((s) => s.ratio),
      ),
    })),
    bySales: [
      ['bez potwierdzonej sprzedaży', 0, 0],
      ['z potwierdzoną sprzedażą', 1, Infinity],
    ].map(([label, from, to]) => ({
      label,
      ...summarizeRatios(
        samples.filter((s) => s.sold >= Number(from) && s.sold <= Number(to)).map((s) => s.ratio),
      ),
    })),
  };
}
