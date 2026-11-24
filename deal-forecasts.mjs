// @ts-check
// Does the deal ranking predict anything? Every announced deal (deal_alerts) stores the forecast at
// announcement time: the price, the worth and the chance that a copy sells within 30 days. Once an
// offer is older than the horizon this settles it: did it sell within the horizon, compared with the
// Vinted offers first seen in the same weeks that were never announced. Both groups start at
// first_seen_at and both need an active assignment. Read only.
//
// Read the gap, not the absolute rates. A deal is by definition cheaper than its worth and cheaper
// copies sell faster, so a higher rate for deals can come from the price alone, not from the
// forecast. "Sold" is what the lifecycle recorded (a scan saw it sold); offers not sold and not
// checked after the horizon are counted as unresolved, because they may have sold unseen.

const DAY = 86_400_000;
const HORIZON_DAYS = 30;

/** @param {number} n @param {number} part */
const rate = (n, part) => (n ? Math.round((part / n) * 1000) / 1000 : null);

/**
 * @param {{ database: any }} repository
 * @param {{ at?: number, horizonDays?: number }} [options]
 */
export function dealForecasts(repository, { at = Date.now(), horizonDays = HORIZON_DAYS } = {}) {
  const database = repository.database;
  const settledBefore = new Date(at - horizonDays * DAY).toISOString();
  const horizon = Number(horizonDays);
  const sold = `(o.availability='sold' AND o.availability_changed_at IS NOT NULL
      AND julianday(o.availability_changed_at) - julianday(o.first_seen_at) <= ${horizon})`;
  // Never seen sold and not looked at after the window: the outcome is unknown.
  const unresolved = `(o.availability<>'sold' AND (o.availability_checked_at IS NULL
      OR julianday(o.availability_checked_at) - julianday(o.first_seen_at) < ${horizon}))`;
  const base = `FROM offers o JOIN offer_matches m ON m.offer_id=o.id AND m.status='active'
    WHERE o.source='Vinted' AND o.first_seen_at IS NOT NULL AND o.first_seen_at <= ?`;
  const alerts = database
    .prepare(
      `SELECT a.chance AS chance, o.first_seen_at AS firstSeenAt,
         CASE WHEN ${sold} THEN 1 ELSE 0 END AS sold,
         CASE WHEN ${unresolved} THEN 1 ELSE 0 END AS unresolved
       FROM deal_alerts a JOIN offers o ON o.id=a.offer_id
         JOIN offer_matches m ON m.offer_id=o.id AND m.status='active'
       WHERE o.first_seen_at IS NOT NULL AND o.first_seen_at <= ?`,
    )
    .all(settledBefore);
  const bounds = alerts.reduce(
    (range, row) => ({
      from: row.firstSeenAt < range.from ? row.firstSeenAt : range.from,
      to: row.firstSeenAt > range.to ? row.firstSeenAt : range.to,
    }),
    { from: alerts[0]?.firstSeenAt ?? '', to: alerts[0]?.firstSeenAt ?? '' },
  );
  const control = alerts.length
    ? database
        .prepare(
          `SELECT count(*) AS n,
             coalesce(sum(CASE WHEN ${sold} THEN 1 ELSE 0 END), 0) AS sold,
             coalesce(sum(CASE WHEN ${unresolved} THEN 1 ELSE 0 END), 0) AS unresolved
           ${base} AND o.first_seen_at >= ? AND o.first_seen_at <= ?
             AND o.id NOT IN (SELECT offer_id FROM deal_alerts)`,
        )
        .get(settledBefore, bounds.from, bounds.to)
    : { n: 0, sold: 0, unresolved: 0 };
  const count = (/** @type {string} */ key) =>
    alerts.reduce((sum, row) => sum + Number(row[key]), 0);
  const announced = { n: alerts.length, sold: count('sold'), unresolved: count('unresolved') };
  const withChance = alerts.filter((row) => row.chance != null);
  // Brier score of the forecast chance against what happened (0 is perfect; always saying the base
  // rate scores base*(1-base)).
  const brier = withChance.length
    ? Math.round(
        (withChance.reduce((sum, row) => sum + (Number(row.chance) - Number(row.sold)) ** 2, 0) /
          withChance.length) *
          1000,
      ) / 1000
    : null;
  const baseRate = rate(announced.n, announced.sold);
  return {
    at: new Date(at).toISOString(),
    horizonDays,
    announced: { ...announced, soldRate: baseRate },
    control: {
      n: Number(control.n),
      sold: Number(control.sold),
      unresolved: Number(control.unresolved),
      soldRate: rate(Number(control.n), Number(control.sold)),
    },
    meanForecast: withChance.length
      ? Math.round(
          (withChance.reduce((sum, row) => sum + Number(row.chance), 0) / withChance.length) * 1000,
        ) / 1000
      : null,
    brier,
    baselineBrier: baseRate == null ? null : Math.round(baseRate * (1 - baseRate) * 1000) / 1000,
    caveat: 'price_correlated_control',
  };
}
