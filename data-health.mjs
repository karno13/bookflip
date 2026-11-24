// @ts-check
// Data health: a few counts per source that show a silent failure (a changed page layout rarely
// throws, the results just fade): offers first seen in the last 7 days against the 7 days before,
// the share without an ISBN and the share without a usable price. Read only.

const DAY = 86_400_000;
/** The recent week must keep at least this share of the previous week's new offers. */
export const DROP_RATIO = 0.5;
/** A drop is only reported when the previous week had at least this many new offers. */
export const MIN_BASELINE = 20;

/**
 * @param {{ database: any }} repository
 * @param {{ now?: number }} [options]
 */
export function dataHealth(repository, { now = Date.now() } = {}) {
  const recentFrom = new Date(now - 7 * DAY).toISOString();
  const previousFrom = new Date(now - 14 * DAY).toISOString();
  const rows = repository.database
    .prepare(
      `SELECT source,
         count(*) AS total,
         sum(observed_isbn IS NULL) AS withoutIsbn,
         sum(current_price IS NULL OR current_price >= 1000000) AS withoutPrice,
         sum(first_seen_at >= ?) AS recent,
         sum(first_seen_at >= ? AND first_seen_at < ?) AS previous
       FROM offers GROUP BY source ORDER BY source`,
    )
    .all(recentFrom, previousFrom, recentFrom);
  // Plain `?` parameters: a repeated numbered one failed on Node 22.16.
  const share = (/** @type {number} */ part, /** @type {number} */ whole) =>
    whole ? Math.round((part / whole) * 1000) / 1000 : 0;
  return {
    at: new Date(now).toISOString(),
    sources: rows.map((row) => {
      const total = Number(row.total),
        recent = Number(row.recent ?? 0),
        previous = Number(row.previous ?? 0);
      return {
        source: String(row.source),
        total,
        withoutIsbn: share(Number(row.withoutIsbn ?? 0), total),
        withoutPrice: share(Number(row.withoutPrice ?? 0), total),
        newLast7d: recent,
        newPrevious7d: previous,
        // Far fewer new offers than the week before. It also fires when the app simply did not scan
        // for a week (computer off, sniper off): read it as "no new offers", then check the scans.
        suspectedDrop: previous >= MIN_BASELINE && recent < previous * DROP_RATIO,
      };
    }),
  };
}
