// @ts-check
// Data repairs at start-up. Most of them fix data saved before a rule existed: they run once and
// leave a flag in app_preferences (the pattern of `bibliography_upgrade_v1`); a job whose rules can
// change later carries a version in its key, so a new rule runs it once more. Only what has to run
// on every start does so, each with the reason.
import { upgradeCatalogBibliography } from './catalog-bibliography.mjs';
import { mergeWorkGroup } from './api-routes.mjs';
import { findDuplicateWorkGroups } from './work-grouping.mjs';
import { backupBeforeIrreversible } from './safety-backup.mjs';
import { reviewAutomaticBundleMatches } from './bundle-detection.mjs';
import { ensureStarterProfiles } from './starter-profiles.mjs';
import {
  rejectRepeatsOfRejectedOffers,
  undoUnconfirmedRepeatRejections,
} from './rejected-offers.mjs';
import { rejectForeignEditions } from './language-policy.mjs';
import { normalizeStoredPublishers, PUBLISHER_RULES_VERSION } from './publisher-names.mjs';
import { applyNameAliases, loadNameAliases } from './name-aliases.mjs';
import { backfillConditionsFromEnrichment } from './offer-observations.mjs';
import { copySeriesToLabels } from './label-collections.mjs';
import { loadUniverses } from './universes.mjs';
import { clearImplausiblePrices } from './offer-ingest.mjs';
import { repairPromotionalShippingCosts } from './shipping-backfill.mjs';
import { repairYesterdayListings } from './listing-age-backfill.mjs';
import { repairCappedNotSeen, repairEmptyCategoryNotSeen } from './offer-availability.mjs';

/**
 * Runs `job` once per `key`; the flag stores what it reported. The job and the flag are one
 * transaction: a failure or an interrupted process leaves neither, so the job is not half done
 * and not marked done. The job must be synchronous (all current ones are, none reads the network).
 */
export function runOnce(repository, key, job, { now = () => new Date() } = {}) {
  const db = repository.database;
  const done = () => db.prepare('SELECT 1 FROM app_preferences WHERE key=?').get(key);
  // Checked before the transaction so an already done job takes no write lock at start.
  if (done()) return { skipped: true };
  return repository.transaction(() => {
    if (done()) return { skipped: true };
    const report = job() ?? {};
    db.prepare(
      'INSERT INTO app_preferences(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at',
    ).run(key, JSON.stringify(report), now().toISOString());
    return report;
  });
}

/**
 * Labels left on works that were merged into another one before merges moved them: they belong to
 * the final target of the alias chain. A label the target already has keeps the target's spelling.
 */
export function moveLabelsOfMergedWorks(repository) {
  const db = repository.database;
  const target = new Map(
    db
      .prepare('SELECT source_id, target_id FROM catalog_work_merges')
      .all()
      .map((r) => [r.source_id, r.target_id]),
  );
  const finalTarget = (id) => {
    const seen = new Set([id]);
    let current = id;
    while (target.has(current)) {
      current = target.get(current);
      if (seen.has(current)) return null;
      seen.add(current);
    }
    return current === id ? null : current;
  };
  const copy = db.prepare(
    'INSERT OR IGNORE INTO work_labels(work_id,label,normalized_label,created_at,group_id) SELECT ?,label,normalized_label,created_at,group_id FROM work_labels WHERE work_id=?',
  );
  const drop = db.prepare('DELETE FROM work_labels WHERE work_id=?');
  let moved = 0;
  for (const source of target.keys()) {
    const to = finalTarget(source);
    if (!to) continue;
    moved += copy.run(to, source).changes;
    drop.run(source);
  }
  return { moved };
}

export function mergeAutomaticDuplicates(
  repository,
  { env = process.env, now = () => new Date() } = {},
) {
  const manual = new Set(
    repository.database
      .prepare("SELECT id FROM works WHERE verification_status='manual'")
      .all()
      .map((row) => row.id),
  );
  let merged = 0;
  const groups = findDuplicateWorkGroups(repository).filter(
    (group) => !group.works.some((work) => manual.has(work.id)),
  );
  // A merge cannot be undone: take a copy first, and do not merge without one (unless the owner
  // switched backups off with BOOKFLIP_AUTO_BACKUP=0).
  if (groups.length && String(env.BOOKFLIP_AUTO_BACKUP ?? '1') !== '0') {
    try {
      backupBeforeIrreversible(repository, { reason: 'merge', now: now() });
    } catch (error) {
      console.error('SAFETY_BACKUP_FAILED_MERGE_SKIPPED', error?.message ?? error);
      // The upgrade that found these groups is flagged done: remember that the merge is owed.
      setMergePending(repository, true, now());
      return 0;
    }
  }
  for (const group of groups) {
    try {
      const sources = group.works.map((work) => work.id).filter((id) => id !== group.targetId);
      merged += mergeWorkGroup(repository, group.targetId, sources).merged.length;
    } catch (error) {
      console.error('AUTOMATIC_WORK_MERGE_SKIPPED', group.key, error?.message ?? error);
    }
  }
  setMergePending(repository, false, now());
  return merged;
}

const MERGE_PENDING_KEY = 'startup_merge_pending_v1';
function mergePending(repository) {
  return Boolean(
    repository.database.prepare('SELECT 1 FROM app_preferences WHERE key=?').get(MERGE_PENDING_KEY),
  );
}
function setMergePending(repository, pending, at) {
  const db = repository.database;
  if (!pending) db.prepare('DELETE FROM app_preferences WHERE key=?').run(MERGE_PENDING_KEY);
  else
    db.prepare(
      'INSERT INTO app_preferences(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET updated_at=excluded.updated_at',
    ).run(MERGE_PENDING_KEY, '1', at.toISOString());
}

export function runStartupJobs(repository, { now = () => new Date(), env = process.env } = {}) {
  const report = {};
  // Every start — state held in memory: universe names and the operator's publisher / series merges
  // are read by title folding and by normalizePublisher on every write.
  loadUniverses(repository);
  loadNameAliases(repository);

  // Once (own flag inside): editions upgraded from their stored BN MARC records; the clean titles
  // reveal reprints that the glued BN titles hid, which are joined right after the upgrade.
  const upgrade = upgradeCatalogBibliography(repository, { now });
  if (!upgrade.skipped || mergePending(repository))
    report.merged = mergeAutomaticDuplicates(repository, { env, now });
  // Once per rule version (own flags inside): automatic matches of set listings back to review.
  report.bundles = reviewAutomaticBundleMatches(repository, { now });
  // Once: automatic repeat-rejections of the first rule version (8.11) that the fixed rule does not
  // confirm go back to identification; then copies of rejected offers saved before the rule.
  // Afterwards new offers are checked when they are saved, existing ones after each rejection.
  report.repeatsUndone = runOnce(
    repository,
    'repeat_rejections_undo_v1',
    () => undoUnconfirmedRepeatRejections(repository, { now }),
    { now },
  );
  report.repeats = runOnce(
    repository,
    'repeat_rejections_v1',
    () => rejectRepeatsOfRejectedOffers(repository, { now }),
    { now },
  );
  // Once: foreign editions found before "Tylko polskie wydania"; afterwards every identification
  // pass and switching the option on do it.
  report.foreign = runOnce(
    repository,
    'foreign_editions_v1',
    () => rejectForeignEditions(repository, { now }),
    { now },
  );
  // Once per spelling-rule version: every write path normalizes publishers, so stored names need a
  // pass only when the rules in publisher-names.mjs change (bump PUBLISHER_RULES_VERSION).
  report.publishers = runOnce(
    repository,
    `publisher_names_v${PUBLISHER_RULES_VERSION}`,
    () => normalizeStoredPublishers(repository, { now }),
    { now },
  );
  // Every start — series names are written by BN reads and by the listing inference without the
  // alias table; this one pass applies the operator's merges to them (idempotent, one query each).
  report.aliases = applyNameAliases(repository, { now });
  // Once (own flag inside): starter scan profiles for an empty catalogue; deleted ones stay deleted.
  if (String(env.BOOKFLIP_STARTER_PROFILES ?? '1') !== '0') ensureStarterProfiles(repository);
  // Once (own flag inside): condition of offers whose page was read before migration 124.
  report.conditions = backfillConditionsFromEnrichment(repository, { now });
  // Once: placeholder prices (10 000 zł and more) saved before the ingest limit existed.
  report.prices = runOnce(repository, 'implausible_prices_v1', () =>
    clearImplausiblePrices(repository),
  );
  // Once: listing dates of offers whose age read "wczoraj" (not understood until 22.11.2026).
  report.yesterday = runOnce(repository, 'vinted_yesterday_listings_v1', () =>
    repairYesterdayListings(repository),
  );
  // Once: Vinted delivery prices saved as 0 zł from the signed-out promotion, and the foreign
  // editions that got in because of it. v2 (20.11.2026): also the 0 zł saved from the page's isFree
  // flag, which is not free delivery for the owner.
  report.shipping = runOnce(
    repository,
    'vinted_promo_shipping_v2',
    () => repairPromotionalShippingCosts(repository, { now }),
    { now },
  );
  // Once: labels that earlier merges left on the hidden source works.
  report.mergedLabels = runOnce(repository, 'merged_work_labels_v1', () =>
    moveLabelsOfMergedWorks(repository),
  );
  // Once: the owner's own series become labels (collections) in volume order; the series stay.
  report.seriesToLabels = runOnce(repository, 'own_series_to_labels_v1', () =>
    copySeriesToLabels(repository, { now }),
  );
  // Once: Vinted offers marked gone by a read that stopped at the 10-page depth cap (not proof of anything).
  report.cappedNotSeen = runOnce(repository, 'vinted_capped_not_seen_v1', () =>
    repairCappedNotSeen(repository),
  );
  // Once: bookshop offers marked gone by an empty category read (layout change, Antykwariat NWS since 19.11.2026).
  report.emptyCategoryNotSeen = runOnce(repository, 'category_empty_not_seen_v1', () =>
    repairEmptyCategoryNotSeen(repository),
  );
  // Not here any more: cycle and volume from listing titles (edition-series.mjs) are recomputed
  // every ten minutes by the server, the first time right after start.
  return report;
}
