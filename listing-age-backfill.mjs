// @ts-check
// Vinted offers without a listing date (about a third of them, 11.2026: saved before the page's
// age was kept, or decided from the detail cache, which carries no age). The market index and the
// freshness of deals need `offers.listed_at`, so the listing page of a still-buyable offer is read
// again, a few per round through the marketplace gate, oldest sighting first. Each page is tried
// once (listing_age_checked_at); a page that names no age, or is gone, is left.
import { readSourceHtml } from './marketplaces.mjs';
import { parseVintedDetail } from './vinted-detail.mjs';
import { listedAtFromAge } from './offer-observations.mjs';

/**
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {{ limit?: number }} [options]
 */
export function pendingListingAgeChecks(repository, { limit = 6 } = {}) {
  return /** @type {{ id: string, url: string }[]} */ (
    repository.database
      .prepare(
        `SELECT id, normalized_url AS url FROM offers
         WHERE source='Vinted' AND listed_at IS NULL AND listing_age_checked_at IS NULL
           AND availability IN ('unconfirmed','available','reserved')
         ORDER BY coalesce(first_seen_at, last_seen_at), id LIMIT ?`,
      )
      .all(Math.max(1, Math.min(50, limit)))
  );
}

/**
 * One-time repair: the age "wczoraj" was not understood, so those offers kept the text and no date.
 * The date is one day before the first sighting (the page was read when the offer was first saved).
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function repairYesterdayListings(repository) {
  const result = repository.database
    .prepare(
      `UPDATE offers SET listed_at=strftime('%Y-%m-%dT%H:%M:%fZ', julianday(coalesce(first_seen_at,last_seen_at)) - 1)
       WHERE source='Vinted' AND listed_at IS NULL AND lower(trim(listed_at_text))='wczoraj'
         AND coalesce(first_seen_at,last_seen_at) IS NOT NULL`,
    )
    .run();
  return { updated: Number(result.changes) };
}

function markChecked(repository, offerId, at, ageText = null, listedAt = null) {
  repository.database
    .prepare(
      `UPDATE offers SET listing_age_checked_at=?, listed_at_text=coalesce(listed_at_text,?),
         listed_at=coalesce(listed_at,?) WHERE id=?`,
    )
    .run(at, ageText, listedAt, offerId);
}

// Failed reads per offer since the app started: a page that keeps failing is given up after a few
// tries instead of being read again every round at the top of the queue.
const readFailures = new Map();
const MAX_READ_FAILURES = 3;

/**
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {{ limit?: number, fetchHtml?: (url: string) => Promise<string>, now?: () => Date,
 *   failures?: Map<string, number> }} [options]
 */
export async function fillListingAges(
  repository,
  {
    limit = 6,
    fetchHtml = (url) => readSourceHtml(url, /** @type {any} */ ({ source: 'Vinted' })),
    now = () => new Date(),
    failures = readFailures,
  } = {},
) {
  const report = { checked: 0, found: 0, missing: 0, removed: 0, failed: 0, paused: false };
  for (const offer of pendingListingAgeChecks(repository, { limit })) {
    const readAt = now();
    const at = readAt.toISOString();
    let html;
    try {
      html = await fetchHtml(offer.url);
    } catch (error) {
      const e = /** @type {{ status?: number, blocked?: boolean }} */ (error);
      if (e?.status === 404 || e?.status === 410) {
        report.removed += 1;
        markChecked(repository, offer.id, at);
        continue;
      }
      // A challenge or rate limit applies to the whole source: stop and let the caller pause.
      if (e?.blocked || e?.status === 403 || e?.status === 429) {
        report.paused = true;
        break;
      }
      report.failed += 1;
      const count = (failures.get(offer.id) ?? 0) + 1;
      if (count >= MAX_READ_FAILURES) {
        failures.delete(offer.id);
        markChecked(repository, offer.id, at);
      } else failures.set(offer.id, count);
      // A failed read is probably the source, not the page: stop the round, so an outage costs at
      // most one page every few rounds instead of giving up on the whole queue.
      break;
    }
    failures.delete(offer.id);
    report.checked += 1;
    const detail = /** @type {{ listedAtText?: string }} */ (parseVintedDetail(html, offer.url));
    const listedAt = detail.listedAtText ? listedAtFromAge(detail.listedAtText, readAt) : null;
    if (listedAt) report.found += 1;
    else report.missing += 1;
    markChecked(repository, offer.id, at, detail.listedAtText ?? null, listedAt);
  }
  return report;
}
