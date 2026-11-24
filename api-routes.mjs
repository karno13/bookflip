import { randomUUID } from 'node:crypto';
import { createRouter } from './router.mjs';
import { deleteUniverse, listUniverses, saveUniverse } from './universes.mjs';
import { recentRelistDecisions, undoRelist } from './offer-status.mjs';
import { listScanProfiles } from './scan-profiles-api.mjs';
import { groupedPriceStats } from './price-stats.mjs';
import { listDeals, removeDealVerdict, saveDealVerdict } from './deals.mjs';
import { clearDealTriage, setDealTriage } from './deal-triage.mjs';
import { listDealAlerts, markDealAlertsSeen } from './deal-alerts.mjs';
import { sniperTargets } from './market-index.mjs';
import { valuationBacktest } from './valuation-backtest.mjs';
import { dataHealth } from './data-health.mjs';
import { dealForecasts } from './deal-forecasts.mjs';
import { phraseStats, setPhraseDisabled } from './phrase-stats.mjs';
import { stockAttribution } from './stock-attribution.mjs';
import { agingReport, keepPrice, markRepriced } from './stock-aging.mjs';
import {
  addStock,
  addStockByIsbn,
  listEdition,
  listStock,
  moveStock,
  undoStock,
} from './stock.mjs';
import { activitySeries } from './activity.mjs';
import { dealLifetime } from './deal-lifetime.mjs';
import { listWatched, unwatchSeller, watchSeller } from './watched-sellers.mjs';
import { sellerBundles } from './seller-bundles.mjs';
import { searchEntities } from './entity-search.mjs';
import { weekReport } from './week-report.mjs';
import { listPriceTargets, setPriceTarget, setPriceTargetActive } from './price-targets.mjs';
import { hunterPack } from './hunter-pack.mjs';
import {
  pushStatus,
  pushTest,
  removePushSubscription,
  savePushSubscription,
} from './push-notify.mjs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { backupCatalog } from './scripts/backup-catalog.mjs';
import { verifyBackupInFolder } from './backup-verify.mjs';

import { findDuplicateWorkGroups } from './work-grouping.mjs';
import { catalogGaps } from './catalog-insights.mjs';
import { listGapFillBatches, undoGapFills } from './edition-gaps.mjs';
import {
  distinctPairs,
  listDistinctDecisions,
  markDistinct,
  pairKey,
  undoDistinct,
} from './distinct-works.mjs';
import { findTitleConflicts, resolveTitleConflict } from './title-consistency.mjs';
import {
  applyRejectionRules,
  createRejectionRule,
  deleteRejectionRule,
  listRejectionRules,
} from './rejection-rules.mjs';
import { dismissOfferSet } from './offer-sets.mjs';
import { reviewQueueSummary } from './review-queue.mjs';
import {
  getScanSchedule,
  saveScanSchedule,
  saveSniper,
  nextRunAt,
  nextQuickRunAt,
  nextSniperRunAt,
  SNIPER_BATCH,
} from './scan-schedule.mjs';
import { getPolishOnly, setPolishOnly } from './language-policy.mjs';
import { listNames, mergeNames, removeNameAlias } from './name-aliases.mjs';
import { catalogAuthors } from './catalog-authors.mjs';
import { listLabels, setWorkLabels, workLabels } from './catalog-labels.mjs';
import {
  addToLabel,
  createLabel,
  deleteLabel,
  labelBooks,
  removeFromLabel,
  renameLabel,
  reorderLabel,
  setLabelPriceTarget,
  setLabelVolume,
} from './label-collections.mjs';
import { labelMarket } from './label-market.mjs';
import { assignToGroup, createGroup, deleteGroup, renameGroup } from './label-groups.mjs';
import {
  addToSeries,
  createOwnSeries,
  deleteOwnSeries,
  listOwnSeries,
  removeFromSeries,
  updateOwnSeries,
} from './work-series-api.mjs';
import { listRemovedWorks, removeCatalogWork, restoreCatalogWork } from './catalog-removal.mjs';
function fail(code, statusCode = 400) {
  throw Object.assign(Error(code), { statusCode });
}
export function amount(value) {
  if (value === null) return null;
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-6
  )
    fail('INVALID_AMOUNT');
  return Math.round(value * 100) / 100;
}
export function getTradingDefaults(repo) {
  const row = repo.database
    .prepare("SELECT value_json FROM app_preferences WHERE key='trading_defaults'")
    .get();
  return row ? JSON.parse(row.value_json) : { shipping: null, other: null };
}
export function saveTradingDefaults(repo, input) {
  const value = { shipping: amount(input?.shipping), other: amount(input?.other) };
  repo.database
    .prepare(
      "INSERT INTO app_preferences VALUES('trading_defaults',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
    )
    .run(JSON.stringify(value), new Date().toISOString());
  return value;
}
export function getOfferScenario(repo, id) {
  if (!repo.database.prepare('SELECT id FROM offers WHERE id=?').get(id))
    fail('OFFER_NOT_FOUND', 404);
  const row = repo.database
    .prepare(
      'SELECT purchase,shipping,other,resale,actual_purchase AS actualPurchase,updated_at AS updatedAt FROM offer_scenarios WHERE offer_id=?',
    )
    .get(id);
  return (
    row || {
      purchase: null,
      shipping: null,
      other: null,
      resale: null,
      actualPurchase: null,
      updatedAt: null,
    }
  );
}
export function saveOfferScenario(repo, id, input) {
  getOfferScenario(repo, id);
  const values = ['purchase', 'shipping', 'other', 'resale', 'actualPurchase'].map((key) =>
    amount(input?.[key] ?? null),
  );
  repo.database
    .prepare(
      `INSERT INTO offer_scenarios(offer_id,purchase,shipping,other,resale,actual_purchase,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(offer_id) DO UPDATE SET purchase=excluded.purchase,shipping=excluded.shipping,other=excluded.other,resale=excluded.resale,actual_purchase=excluded.actual_purchase,updated_at=excluded.updated_at`,
    )
    .run(id, ...values, new Date().toISOString());
  return getOfferScenario(repo, id);
}
export function listScanRuns(repo) {
  return repo.database
    .prepare(
      'SELECT s.scanned_at,s.summary_json,EXISTS(SELECT 1 FROM scan_offer_results r WHERE r.scanned_at=s.scanned_at) AS indexed FROM scan_runs s ORDER BY s.scanned_at DESC LIMIT 50',
    )
    .all()
    .map((row) => {
      const summary = JSON.parse(row.summary_json);
      return { at: row.scanned_at, ...summary, indexed: Boolean(row.indexed || summary.context) };
    });
}
export function recentReviewDecisions(repo) {
  // Three separate streams with their own limits (own and other decisions 30, automatic ISBN 10, relists 10),
  // so a burst of automatic decisions or relists never pushes the owner's own decisions off the list.
  const select = (condition, limit) =>
    repo.database
      .prepare(
        `SELECT d.id,d.action,d.reason,d.created_at AS createdAt,d.offer_id AS offerId,o.original_title AS title,
    d.edition_id AS editionId,d.created_by AS createdBy,r.id AS revisionId FROM review_decisions d JOIN offers o ON o.id=d.offer_id
    LEFT JOIN review_revisions r ON r.decision_id=d.id WHERE ${condition} ORDER BY d.created_at DESC,d.id DESC LIMIT ${limit}`,
      )
      .all();
  const decisions = [
    ...select("d.created_by NOT LIKE 'auto\\_isbn%' ESCAPE '\\'", 30),
    ...select("d.created_by LIKE 'auto\\_isbn%' ESCAPE '\\'", 10),
  ];
  // Automatic relist links are decisions too (offer_relists, created_by 'relist_detection').
  return [...decisions, ...recentRelistDecisions(repo.database, 10)].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}
export function reopenReviewDecision(repo, id) {
  return repo.transaction(() => {
    const db = repo.database;
    const decision = db.prepare('SELECT * FROM review_decisions WHERE id=?').get(id);
    if (!decision) fail('DECISION_NOT_FOUND', 404);
    if (db.prepare('SELECT id FROM review_revisions WHERE decision_id=?').get(id))
      fail('DECISION_ALREADY_REOPENED', 409);
    const latest = db
      .prepare(
        'SELECT id FROM review_decisions WHERE offer_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
      )
      .get(decision.offer_id);
    if (latest?.id !== id) fail('NEWER_DECISION_EXISTS', 409);
    const job = db.prepare('SELECT * FROM identification_jobs WHERE id=?').get(decision.job_id);
    if (!job || job.status === 'running') fail('IDENTIFICATION_IN_PROGRESS', 409);
    if (db.prepare('SELECT offer_id FROM offer_sets WHERE offer_id=?').get(decision.offer_id))
      fail('OFFER_IS_SET', 409);
    const active = db
      .prepare("SELECT * FROM offer_matches WHERE offer_id=? AND status='active'")
      .get(decision.offer_id);
    if (active && active.edition_id !== decision.edition_id) fail('NEWER_ASSIGNMENT_EXISTS', 409);
    const now = new Date().toISOString();
    if (active)
      db.prepare("UPDATE offer_matches SET status='superseded',valid_to=? WHERE id=?").run(
        now,
        active.id,
      );
    // An undone automatic assignment is not repeated: record the edition as rejected for this offer
    // (the row operatorRejectedEditions reads). Only decisions made by automation (created_by other than
    // 'local_user', e.g. a batch the owner undoes to review) and never manual assignments, which stay as is.
    if (
      active &&
      decision.created_by !== 'local_user' &&
      !['manual', 'legacy_manual'].includes(active.method)
    )
      repo.assignOfferToEdition(decision.offer_id, active.edition_id, {
        id: `reopen_rejected_${id}`,
        method: 'metadata',
        status: 'rejected',
        reason: 'Cofnięta decyzja automatyczna.',
        createdBy: 'local_user',
        at: now,
      });
    db.prepare('INSERT INTO review_revisions VALUES(?,?,?)').run(randomUUID(), id, now);
    db.prepare(
      "UPDATE identification_jobs SET status='review_required',result_json=?,lease_token=NULL,lease_expires_at=NULL,run_after=NULL,updated_at=? WHERE id=?",
    ).run(JSON.stringify({ reason: ['operator_correction'] }), now, job.id);
    return { jobId: job.id, offerId: decision.offer_id };
  });
}
function text(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    fail('INVALID_CATALOG_FIELDS');
  return value.trim();
}
export function editCatalogWork(repo, id, input) {
  const title = text(input?.title, 500, true);
  if (!Array.isArray(input?.authors) || input.authors.length > 30) fail('INVALID_CATALOG_FIELDS');
  const authors = input.authors.map((value) => text(value, 200, true));
  const result = repo.database
    .prepare(
      "UPDATE works SET title=?,authors_json=?,normalized_title=?,verification_status='manual',updated_at=? WHERE id=?",
    )
    .run(
      title,
      JSON.stringify(authors),
      title.normalize('NFC').toLocaleLowerCase('pl'),
      new Date().toISOString(),
      id,
    );
  if (!result.changes) fail('WORK_NOT_FOUND', 404);
  return { id, title, authors };
}
export function editCatalogEdition(repo, id, input) {
  const title = text(input?.title, 500, true),
    publisher = text(input?.publisher ?? '', 300),
    language = text(input?.language ?? '', 60),
    binding = text(input?.binding ?? '', 100);
  const year = input?.publicationYear;
  if (year !== null && (!Number.isSafeInteger(year) || year < 1400 || year > 2100))
    fail('INVALID_CATALOG_FIELDS');
  const result = repo.database
    .prepare(
      "UPDATE editions SET title=?,publisher=?,language=?,binding=?,publication_year=?,verification_status='manual',updated_at=? WHERE id=?",
    )
    .run(
      title,
      publisher || null,
      language || null,
      binding || null,
      year,
      new Date().toISOString(),
      id,
    );
  if (!result.changes) fail('EDITION_NOT_FOUND', 404);
  return { id, title, publisher, language, binding, publicationYear: year };
}
export function mergeCatalogWorks(repo, sourceId, targetId, confirm = false) {
  if (sourceId === targetId) fail('SAME_WORK');
  const db = repo.database;
  const source = db.prepare('SELECT * FROM works WHERE id=?').get(sourceId),
    target = db.prepare('SELECT * FROM works WHERE id=?').get(targetId);
  if (!source || !target) fail('WORK_NOT_FOUND', 404);
  if (
    db
      .prepare('SELECT 1 FROM catalog_work_merges WHERE source_id IN (?,?) OR target_id=?')
      .get(sourceId, targetId, sourceId)
  )
    fail('WORK_ALREADY_MERGED', 409);
  // Preserve old compatibility IDs rather than silently moving their identity.
  if (
    source.legacy_id &&
    db.prepare('SELECT 1 FROM editions WHERE work_id=? AND legacy_id IS NULL').get(sourceId)
  )
    fail('LEGACY_IDENTITY_PROTECTED', 409);
  const editions = db.prepare('SELECT id,title FROM editions WHERE work_id=?').all(sourceId);
  const summary = {
    sourceId,
    targetId,
    sourceTitle: source.title,
    targetTitle: target.title,
    editions: editions.length,
  };
  if (!confirm) return summary;
  return repo.transaction(() => {
    const oldSeries = db
      .prepare('SELECT * FROM work_series_annotations WHERE work_id=?')
      .get(sourceId);
    const newSeries = db
      .prepare('SELECT * FROM work_series_annotations WHERE work_id=?')
      .get(targetId);
    if (
      oldSeries &&
      newSeries &&
      (oldSeries.series !== newSeries.series || oldSeries.volume !== newSeries.volume)
    )
      fail('SERIES_CONFLICT', 409);
    if (oldSeries && !newSeries)
      db.prepare('INSERT INTO work_series_annotations VALUES(?,?,?,?)').run(
        targetId,
        oldSeries.series,
        oldSeries.volume,
        new Date().toISOString(),
      );
    db.prepare('DELETE FROM work_series_annotations WHERE work_id=?').run(sourceId);
    db.prepare(
      'INSERT OR IGNORE INTO work_universe_overrides(work_id,universe,updated_at) SELECT ?,universe,updated_at FROM work_universe_overrides WHERE work_id=?',
    ).run(targetId, sourceId);
    db.prepare('DELETE FROM work_universe_overrides WHERE work_id=?').run(sourceId);
    // Labels follow the book: those the target lacks are copied (a label it has keeps its own row).
    db.prepare(
      'INSERT OR IGNORE INTO work_labels(work_id,label,normalized_label,created_at,group_id) SELECT ?,label,normalized_label,created_at,group_id FROM work_labels WHERE work_id=?',
    ).run(targetId, sourceId);
    db.prepare('DELETE FROM work_labels WHERE work_id=?').run(sourceId);
    db.prepare('UPDATE editions SET work_id=?,updated_at=? WHERE work_id=?').run(
      targetId,
      new Date().toISOString(),
      sourceId,
    );
    // external_records are immutable (a trigger refuses updates). Work-level links are re-pointed
    // by adding links for the target; the originals stay as history.
    db.prepare(
      'INSERT OR IGNORE INTO external_record_links(external_record_id,work_id,edition_id,linked_at) SELECT external_record_id,?,NULL,? FROM external_record_links WHERE work_id=? AND edition_id IS NULL',
    ).run(targetId, new Date().toISOString(), sourceId);
    // Keep historical external links and decisions intact. The alias resolves old links.
    db.prepare('INSERT INTO catalog_work_merges VALUES(?,?,?)').run(
      sourceId,
      targetId,
      new Date().toISOString(),
    );
    return { ...summary, merged: true };
  });
}
/** How well each search phrase performs: found offers, how many reached the catalogue, how many wait. */
// Niche measurement: how fast a phrase's offers sell and for how much. A sale counts "within 14
// days" when the first check that found it sold came at most 14 days after it was first seen; the
// share is taken over offers seen at least 14 days ago, so a new phrase is not judged too early.
export const SOLD_WITHIN_DAYS = 14;
export const EXPENSIVE_GROSZE = 5000;
const SOLD_AT_SQL = `(SELECT min(h.observed_at) FROM offer_status_history h WHERE h.offer_id=o.id AND h.status='sold')`;
function marketColumns() {
  return `sum(o.first_seen_at <= ?) AS cohort,
    sum(o.first_seen_at <= ? AND o.availability='sold' AND julianday(coalesce(${SOLD_AT_SQL}, o.availability_changed_at)) - julianday(o.first_seen_at) <= ${SOLD_WITHIN_DAYS}) AS soldFast,
    sum(o.availability='sold') AS sold,
    sum(o.currency='PLN' AND o.current_price > ${EXPENSIVE_GROSZE}) AS expensive`;
}
function marketFields(row, stats) {
  const cohort = Number(row.cohort || 0);
  return {
    sold: Number(row.sold || 0),
    soldMedian: stats?.soldMedian ?? null,
    soldWithin14: Number(row.soldFast || 0),
    soldWithin14Base: cohort,
    soldWithin14Share: cohort ? Number(row.soldFast || 0) / cohort : null,
    over50: Number(row.expensive || 0),
  };
}
export function scanQueryStats(repo, at = Date.now()) {
  const db = repo.database;
  const cutoff = new Date(at - SOLD_WITHIN_DAYS * 86_400_000).toISOString();
  // The phrases that found each offer (offer_queries, migration 127).
  const queries = 'JOIN offer_queries q ON q.offer_id=o.id';
  const rows = db
    .prepare(
      `SELECT q.query AS query, o.source AS source, count(*) AS offers,
         sum(EXISTS(SELECT 1 FROM offer_matches m WHERE m.offer_id=o.id AND m.status='active')) AS matched,
         sum(EXISTS(SELECT 1 FROM identification_jobs j WHERE j.offer_id=o.id AND j.status='review_required')) AS waiting,
         sum(o.observed_isbn IS NULL OR o.observed_isbn='') AS withoutIsbn,
         max(o.last_seen_at) AS lastSeen, ${marketColumns()}
       FROM offers o ${queries}
       GROUP BY q.query, o.source ORDER BY offers DESC LIMIT 200`,
    )
    .all(cutoff, cutoff);
  const sep = String.fromCharCode(31);
  const prices = groupedPriceStats(
    db,
    `SELECT o.id AS offer_id, q.query || char(31) || o.source AS grp FROM offers o ${queries}`,
    [],
    'grp',
  );
  // The same per saved scan profile (its phrases × its sources, each offer once): niches side by side.
  const profiles = listScanProfiles(repo).map((profile) => {
    const selected = `SELECT DISTINCT o.id AS offer_id, 'p' AS grp FROM offers o ${queries}
      WHERE lower(q.query) IN (SELECT lower(value) FROM json_each(?)) AND o.source IN (SELECT value FROM json_each(?))`;
    const params = [JSON.stringify(profile.queries || []), JSON.stringify(profile.sources || [])];
    const row = db
      .prepare(
        `SELECT count(*) AS offers, ${marketColumns()} FROM offers o WHERE o.id IN (SELECT offer_id FROM (${selected}))`,
      )
      .get(cutoff, cutoff, ...params);
    const stats = groupedPriceStats(db, selected, params, 'grp').p;
    // Identified offers and the editions they belong to: many offers on few editions is a crowded
    // market (Fourth Wing), many editions is a wide one.
    const identified = db
      .prepare(
        `SELECT count(DISTINCT m.offer_id) AS matched, count(DISTINCT m.edition_id) AS editions
         FROM offer_matches m WHERE m.status='active' AND m.offer_id IN (SELECT offer_id FROM (${selected}))`,
      )
      .get(...params);
    return {
      name: profile.name,
      queries: profile.queries,
      sources: profile.sources,
      offers: Number(row.offers || 0),
      matched: Number(identified?.matched || 0),
      editions: Number(identified?.editions || 0),
      live: stats?.live ?? 0,
      liveMedian: stats?.median ?? null,
      ...marketFields(row, stats),
    };
  });
  return {
    soldWithinDays: SOLD_WITHIN_DAYS,
    expensiveGrosze: EXPENSIVE_GROSZE,
    items: rows.map((row) => ({
      query: String(row.query),
      source: row.source,
      offers: Number(row.offers),
      matched: Number(row.matched),
      waiting: Number(row.waiting),
      withoutIsbn: Number(row.withoutIsbn),
      lastSeen: row.lastSeen,
      ...marketFields(row, prices[String(row.query) + sep + row.source]),
    })),
    profiles,
  };
}
/** Per phrase: offers ever found, listings first seen in the last `days`, and the newest one. */
export function scanQueryFreshness(repo, days = 30, at = Date.now()) {
  const since = new Date(at - days * 86_400_000).toISOString();
  const rows = repo.database
    .prepare(
      `SELECT q.query AS query, count(*) AS offers, sum(o.first_seen_at>?) AS fresh, max(o.first_seen_at) AS lastNewAt
       FROM offers o JOIN offer_queries q ON q.offer_id=o.id
       GROUP BY lower(q.query)`,
    )
    .all(since);
  return {
    days,
    items: rows.map((row) => ({
      query: String(row.query),
      offers: Number(row.offers),
      fresh: Number(row.fresh || 0),
      lastNewAt: row.lastNewAt,
    })),
  };
}
export function listWorkDuplicates(repo) {
  return { groups: findDuplicateWorkGroups(repo) };
}
/** Merges every source work of a group into its target; each merge keeps the existing safeguards. */
export function mergeWorkGroup(repo, targetId, sourceIds) {
  if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.length > 50)
    fail('INVALID_CATALOG_FIELDS');
  const group = findDuplicateWorkGroups(repo).find(
    (item) => item.targetId === targetId || item.works.some((work) => work.id === targetId),
  );
  // Only works that the strict key considers the same book may be merged through this shortcut.
  const allowed = new Set(group?.works.map((work) => work.id) ?? []);
  if (!allowed.has(targetId) || sourceIds.some((id) => !allowed.has(id) || id === targetId))
    fail('NOT_A_DUPLICATE_GROUP', 409);
  // A merge cannot be undone: never join works the operator marked as different books.
  const distinct = distinctPairs(repo);
  const ids = [targetId, ...sourceIds];
  for (let i = 0; i < ids.length; i += 1)
    for (let j = i + 1; j < ids.length; j += 1)
      if (distinct.has(pairKey(ids[i], ids[j]))) fail('MARKED_DISTINCT', 409);
  return repo.transaction(() => ({
    merged: sourceIds.map((id) => mergeCatalogWorks(repo, id, targetId, true)),
  }));
}
export async function dataOverview(repo) {
  if (repo.path === ':memory:')
    return { databasePath: ':memory:', backups: [], lastBackupAt: null };
  const folder = join(dirname(repo.path), 'backups');
  const files = await readdir(folder).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const backups = (
    await Promise.all(
      files
        .filter((name) => name.endsWith('.sqlite'))
        .map(async (name) => ({ name, at: (await stat(join(folder, name))).mtime.toISOString() })),
    )
  ).sort((a, b) => b.at.localeCompare(a.at));
  return {
    databasePath: repo.path,
    backupDirectory: folder,
    lastBackupAt: backups[0]?.at || null,
    backups: backups.slice(0, 20),
  };
}
// The routes of this module, as a table (router.mjs). local-app.mjs forwards a request here when
// this table knows its path, so a new route needs no change there.
export const apiRoutes = createRouter()
  .add('GET', '/api/trading-summary', ({ repo }) => {
    const summary = repo.database
      .prepare(
        `SELECT count(*) AS watched,
      COALESCE(sum(CASE WHEN w.target_price IS NOT NULL AND o.currency='PLN' AND o.current_price<=round(w.target_price*100) THEN 1 ELSE 0 END),0) AS atTarget
      FROM offer_workspace w JOIN offers o ON o.id=w.offer_id WHERE w.watched=1`,
      )
      .get();
    return {
      ...summary,
      review: repo.database
        .prepare("SELECT count(*) AS n FROM identification_jobs WHERE status='review_required'")
        .get().n,
    };
  })
  .add('PUT', '/api/set-details/:id', ({ repo, input, params }) => {
    const id = params.id;
    if (typeof input?.confirmed !== 'boolean') fail('INVALID_SET_DETAILS');
    if (
      input.confirmed &&
      repo.database.prepare('SELECT 1 FROM offer_set_unknown_items WHERE offer_id=?').get(id)
    )
      fail('SET_HAS_UNKNOWN_ITEMS', 409);
    if (
      input.confirmed &&
      !repo.database.prepare('SELECT 1 FROM offer_set_editions WHERE offer_id=?').get(id)
    )
      fail('SET_HAS_NO_MEMBERS', 409);
    const result = repo.database
      .prepare('UPDATE offer_sets SET composition_confirmed=?,updated_at=? WHERE offer_id=?')
      .run(Number(input.confirmed), new Date().toISOString(), id);
    if (!result.changes) fail('SET_NOT_FOUND', 404);
    return { confirmed: input.confirmed };
  })
  .add('PUT', '/api/set-items/:offerId/:editionId', ({ repo, input, params }) =>
    repo.transaction(() => {
      const { offerId, editionId } = params;
      if (!Number.isSafeInteger(input?.quantity) || input.quantity < 1 || input.quantity > 10000)
        fail('INVALID_QUANTITY');
      const result = repo.database
        .prepare(
          'UPDATE offer_set_editions SET quantity=?,resale_price=? WHERE offer_id=? AND edition_id=?',
        )
        .run(input.quantity, amount(input.resalePrice), offerId, editionId);
      if (!result.changes) fail('SET_MEMBER_NOT_FOUND', 404);
      repo.database
        .prepare('UPDATE offer_sets SET composition_confirmed=0,updated_at=? WHERE offer_id=?')
        .run(new Date().toISOString(), offerId);
      return { saved: true };
    }),
  )
  .add(
    ['POST', 'DELETE'],
    '/api/set-unknown/:offerId/:itemId?',
    ({ repo, method, input, params }) =>
      repo.transaction(() => {
        const offerId = params.offerId;
        if (!repo.database.prepare('SELECT offer_id FROM offer_sets WHERE offer_id=?').get(offerId))
          fail('SET_NOT_FOUND', 404);
        if (method === 'POST') {
          const title = text(input?.title, 300, true),
            quantity = input?.quantity;
          if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000)
            fail('INVALID_QUANTITY');
          repo.database
            .prepare('INSERT INTO offer_set_unknown_items VALUES(?,?,?,?)')
            .run(randomUUID(), offerId, title, quantity);
        } else {
          if (!params.itemId) fail('UNKNOWN_ITEM_REQUIRED');
          repo.database
            .prepare('DELETE FROM offer_set_unknown_items WHERE offer_id=? AND id=?')
            .run(offerId, params.itemId);
        }
        repo.database
          .prepare('UPDATE offer_sets SET composition_confirmed=0,updated_at=? WHERE offer_id=?')
          .run(new Date().toISOString(), offerId);
        return { saved: true };
      }),
  )
  .add('GET', '/api/trading-defaults', ({ repo }) => getTradingDefaults(repo))
  .add('PUT', '/api/trading-defaults', ({ repo, input }) => saveTradingDefaults(repo, input))
  .add('GET', '/api/scan-runs', ({ repo }) => ({ items: listScanRuns(repo) }))
  .add('GET', '/api/deals', ({ repo }) =>
    listDeals(repo, { includeWatched: true, includeNear: true }),
  )
  .add('PUT', '/api/deals/:offerId/verdict', ({ repo, input, params }) =>
    saveDealVerdict(repo, params.offerId, input?.verdict),
  )
  .add('DELETE', '/api/deals/:offerId/verdict', ({ repo, params }) =>
    removeDealVerdict(repo, params.offerId),
  )
  // "Nowe okazje" (deal-alerts.mjs) and the sniper that looks for them (scan-schedule.mjs).
  // „Skrzynka okazji”: seen / snoozed (until an ISO time, default a day) / dismissed; only visibility.
  .add('PUT', '/api/deals/:offerId/triage', ({ repo, input, params }) =>
    setDealTriage(repo, params.offerId, String(input?.state ?? ''), {
      until: input?.until ?? null,
    }),
  )
  .add('DELETE', '/api/deals/:offerId/triage', ({ repo, params }) =>
    clearDealTriage(repo, params.offerId),
  )
  .add('GET', '/api/deals/alerts', ({ repo }) => listDealAlerts(repo))
  .add('POST', '/api/deals/alerts/seen', ({ repo }) => markDealAlertsSeen(repo))
  // „Frazy”: what each scan phrase brings, and the owner's switch for the scheduled scans.
  .add('GET', '/api/phrases', ({ repo }) => phraseStats(repo))
  .add('PUT', '/api/phrases/disabled', ({ repo, input }) =>
    setPhraseDisabled(repo, String(input?.phrase ?? ''), input?.disabled !== false),
  )
  // „Kupuję do … zł”: the owner's price for an edition or a work (grosze in, grosze out).
  .add('GET', '/api/price-targets', ({ repo }) => ({ items: listPriceTargets(repo) }))
  // „Łowca bez sieci”: every ISBN Łowca can judge, for the phone to keep (hunter-pack.mjs).
  .add('GET', '/api/hunter/pack', ({ repo }) => hunterPack(repo))
  // „Powiadomienia na telefonie” about new deals (push-notify.mjs).
  .add('GET', '/api/push', ({ repo }) => pushStatus(repo))
  .add('POST', '/api/push/subscribe', ({ repo, input }) => savePushSubscription(repo, input))
  .add('POST', '/api/push/unsubscribe', ({ repo, input }) => removePushSubscription(repo, input))
  .add('POST', '/api/push/test', ({ repo }) => pushTest(repo))
  .add('PUT', '/api/price-targets', ({ repo, input }) =>
    setPriceTarget(repo, {
      editionId: input?.editionId,
      workId: input?.workId,
      maxPrice: Number(input?.maxPrice),
      active: typeof input?.active === 'boolean' ? input.active : undefined,
    }),
  )
  .add('PUT', '/api/price-targets/:id/active', ({ repo, input, params }) =>
    setPriceTargetActive(repo, params.id, input?.active !== false),
  )
  // „Zapas”: copies as states and dates only (stock.mjs); a disallowed move is a 400.
  .add('GET', '/api/stock', ({ repo }) => listStock(repo))
  .add('POST', '/api/stock', ({ repo, input }) =>
    addStock(repo, { offerId: input?.offerId, editionId: input?.editionId, note: input?.note }),
  )
  .add('POST', '/api/stock/batch', ({ repo, input }) => addStockByIsbn(repo, input?.items))
  .add('POST', '/api/stock/listed', ({ repo, input }) => listEdition(repo, input?.editionId))
  .add('POST', '/api/stock/:id/move', ({ repo, input, params }) =>
    moveStock(repo, params.id, String(input?.to ?? '')),
  )
  .add('GET', '/api/stock/attribution', ({ repo }) => stockAttribution(repo))
  .add('GET', '/api/stock/aging', ({ repo }) => agingReport(repo))
  .add('POST', '/api/stock/:id/repriced', ({ repo, params }) => markRepriced(repo, params.id))
  .add('POST', '/api/stock/:id/keep', ({ repo, params }) => keepPrice(repo, params.id))
  .add('POST', '/api/stock/:id/undo', ({ repo, input, params }) =>
    undoStock(repo, params.id, { expectedEventId: input?.expectedEventId ?? null }),
  )
  // „Paczki sprzedawców”: sellers with several valued books, total price against total worth.
  .add('GET', '/api/watched-sellers', ({ repo }) => listWatched(repo))
  .add('POST', '/api/watched-sellers', ({ repo, input }) => watchSeller(repo, input))
  .add('DELETE', '/api/watched-sellers/:source/:sellerId', ({ repo, params }) =>
    unwatchSeller(repo, params.source, params.sellerId),
  )
  .add('GET', '/api/seller-bundles', ({ repo }) => sellerBundles(repo))
  .add('GET', '/api/search/entities', ({ repo, query }) => searchEntities(repo, query?.q ?? ''))
  .add('GET', '/api/data-health', ({ repo }) => dataHealth(repo))
  .add('GET', '/api/deal-forecasts', ({ repo }) => dealForecasts(repo))
  // „Ostatnie 7 dni” in „Dziś”: read-only report of seven full Warsaw days ending at `to` (default: yesterday).
  .add('GET', '/api/report/week', ({ repo, query }) => weekReport(repo, { to: query?.to }))
  .add('GET', '/api/activity', ({ repo, query }) =>
    activitySeries(repo, { days: Number(query?.days) || undefined }),
  )
  .add('GET', '/api/sniper', ({ repo }) => sniperStatus(repo))
  .add('PUT', '/api/sniper', ({ repo, input }) => {
    saveSniper(repo, input);
    return sniperStatus(repo);
  })
  // offers_seen: listings this source returned in its last checked scan, so a source whose
  // health row predates per-phrase success tracking is not shown as dead while it delivers offers.
  .add('GET', '/api/source-health', ({ repo }) => ({
    items: repo.database
      .prepare(
        'SELECT h.*,(SELECT count(*) FROM offers o WHERE o.source=h.source AND o.last_seen_at>=h.last_checked_at) AS offers_seen FROM source_health h ORDER BY h.source',
      )
      .all(),
  }))
  .add('GET', '/api/review-decisions', ({ repo }) => ({ items: recentReviewDecisions(repo) }))
  .add('POST', '/api/offer-relists/:offerId/undo', ({ repo, params }) =>
    undoRelist(repo, params.offerId),
  )
  .add('POST', '/api/review-decisions/:id/reopen', ({ repo, params }) =>
    reopenReviewDecision(repo, params.id),
  )
  .add('GET', '/api/offer-scenarios/:offerId', ({ repo, params }) =>
    getOfferScenario(repo, params.offerId),
  )
  .add('PUT', '/api/offer-scenarios/:offerId', ({ repo, input, params }) =>
    saveOfferScenario(repo, params.offerId, input),
  )
  .add('PUT', '/api/catalog/works/:id', ({ repo, input, params }) =>
    editCatalogWork(repo, params.id, input),
  )
  .add('PUT', '/api/catalog/editions/:id', ({ repo, input, params }) =>
    editCatalogEdition(repo, params.id, input),
  )
  .add('GET', '/api/scan-queries/stats', ({ repo }) => scanQueryStats(repo))
  .add('GET', '/api/scan-queries/freshness', ({ repo }) => scanQueryFreshness(repo))
  .add('GET', '/api/catalog/names', ({ repo }) => listNames(repo))
  .add('GET', '/api/catalog/authors', ({ repo }) => catalogAuthors(repo))
  // Etykiety (catalog-labels.mjs) and the owner's own series (work-series-api.mjs).
  .add('GET', '/api/catalog/labels', ({ repo }) => listLabels(repo))
  .add('GET', '/api/catalog/works/:id/labels', ({ repo, params }) => ({
    labels: workLabels(repo, params.id),
  }))
  .add('PUT', '/api/catalog/works/:id/labels', ({ repo, input, params }) =>
    setWorkLabels(repo, params.id, input?.labels),
  )
  // Etykiety as collections (label-collections.mjs).
  .add('POST', '/api/catalog/labels', ({ repo, input }) => createLabel(repo, input ?? {}))
  .add('PUT', '/api/catalog/labels/:name', ({ repo, input, params }) =>
    renameLabel(repo, params.name, input ?? {}),
  )
  .add('DELETE', '/api/catalog/labels/:name', ({ repo, params }) => deleteLabel(repo, params.name))
  .add('GET', '/api/catalog/labels/:name/works', ({ repo, params }) =>
    labelBooks(repo, params.name),
  )
  .add('POST', '/api/catalog/labels/:name/works', ({ repo, input, params }) =>
    addToLabel(repo, params.name, input ?? {}),
  )
  .add('PUT', '/api/catalog/labels/:name/order', ({ repo, input, params }) =>
    reorderLabel(repo, params.name, input ?? {}),
  )
  .add('PUT', '/api/catalog/labels/:name/works/:workId', ({ repo, input, params }) =>
    setLabelVolume(repo, params.name, params.workId, input ?? {}),
  )
  .add('DELETE', '/api/catalog/labels/:name/works/:workId', ({ repo, params }) =>
    removeFromLabel(repo, params.name, params.workId),
  )
  // Sub-labels inside a label (label-groups.mjs).
  .add('POST', '/api/catalog/labels/:name/groups', ({ repo, input, params }) =>
    createGroup(repo, params.name, input ?? {}),
  )
  .add('PUT', '/api/catalog/labels/:name/groups/:id', ({ repo, input, params }) =>
    renameGroup(repo, params.name, params.id, input ?? {}),
  )
  .add('DELETE', '/api/catalog/labels/:name/groups/:id', ({ repo, params }) =>
    deleteGroup(repo, params.name, params.id),
  )
  .add('PUT', '/api/catalog/labels/:name/assign', ({ repo, input, params }) =>
    assignToGroup(repo, params.name, input ?? {}),
  )
  // „Rynek” of a label (label-market.mjs) and one „Kupuję do” price for all its books.
  .add('GET', '/api/catalog/labels/:name/market', ({ repo, params }) =>
    labelMarket(repo, params.name),
  )
  .add('PUT', '/api/catalog/labels/:name/target', ({ repo, input, params }) =>
    setLabelPriceTarget(repo, params.name, input ?? {}),
  )
  .add('GET', '/api/catalog/my-series', ({ repo }) => listOwnSeries(repo))
  .add('POST', '/api/catalog/my-series', ({ repo, input }) => createOwnSeries(repo, input ?? {}))
  .add('PUT', '/api/catalog/my-series/:name', ({ repo, input, params }) =>
    updateOwnSeries(repo, params.name, input ?? {}),
  )
  .add('DELETE', '/api/catalog/my-series/:name', ({ repo, params }) =>
    deleteOwnSeries(repo, params.name),
  )
  .add('POST', '/api/catalog/my-series/:name/works', ({ repo, input, params }) =>
    addToSeries(repo, params.name, input ?? {}),
  )
  .add('DELETE', '/api/catalog/my-series/:name/works/:workId', ({ repo, params }) =>
    removeFromSeries(repo, params.name, params.workId),
  )
  .add('POST', '/api/catalog/names/merge', ({ repo, input }) => mergeNames(repo, input))
  .add('POST', '/api/catalog/names/unalias', ({ repo, input }) => removeNameAlias(repo, input))
  .add('GET', '/api/catalog/universes', ({ repo }) => listUniverses(repo))
  .add('PUT', '/api/catalog/universes', ({ repo, input }) => saveUniverse(repo, input))
  .add('DELETE', '/api/catalog/universes/:name', ({ repo, params }) =>
    deleteUniverse(repo, params.name),
  )
  .add('GET', '/api/scan-language', ({ repo }) => ({ polishOnly: getPolishOnly(repo) }))
  .add('PUT', '/api/scan-language', ({ repo, input }) => setPolishOnly(repo, input?.polishOnly))
  .add('GET', '/api/scan-schedule', ({ repo }) => {
    const s = getScanSchedule(repo);
    return { ...s, nextRunAt: nextRunAt(s), nextQuickRunAt: nextQuickRunAt(s) };
  })
  .add('PUT', '/api/scan-schedule', ({ repo, input }) => {
    const s = saveScanSchedule(repo, input);
    return { ...s, nextRunAt: nextRunAt(s), nextQuickRunAt: nextQuickRunAt(s) };
  })
  .add('GET', '/api/catalog/work-duplicates', ({ repo }) => listWorkDuplicates(repo))
  // "To różne książki" (migration 130): reversible, listed with the other decisions.
  .add('POST', '/api/catalog/work-duplicates/distinct', ({ repo, input }) =>
    markDistinct(repo, input?.workIds),
  )
  .add('GET', '/api/catalog/work-duplicates/distinct', ({ repo }) => ({
    items: listDistinctDecisions(repo),
  }))
  .add('POST', '/api/catalog/work-duplicates/distinct/:id/undo', ({ repo, params }) =>
    undoDistinct(repo, params.id),
  )
  // Publisher / year filled from the sources (edition-gaps.mjs): batches and their undo.
  .add('GET', '/api/catalog/edition-fills', ({ repo }) => ({ items: listGapFillBatches(repo) }))
  .add('POST', '/api/catalog/edition-fills/:id/undo', ({ repo, params }) =>
    undoGapFills(repo, params.id),
  )
  .add('GET', '/api/catalog/gaps', ({ repo }) => catalogGaps(repo))
  .add('GET', '/api/queue/summary', ({ repo }) => queueSummary(repo))
  // "Usuń z katalogu" (catalog-removal.mjs): GET previews what goes, POST removes; restorable.
  .add('GET', '/api/catalog/works/:id/removal', ({ repo, params }) =>
    removeCatalogWork(repo, params.id),
  )
  .add('POST', '/api/catalog/works/:id/removal', ({ repo, params }) =>
    removeCatalogWork(repo, params.id, { confirm: true }),
  )
  .add('GET', '/api/catalog/removed-works', ({ repo }) => ({ items: listRemovedWorks(repo) }))
  .add('POST', '/api/catalog/removed-works/:id/restore', ({ repo, params }) =>
    restoreCatalogWork(repo, params.id),
  )
  .add('GET', '/api/catalog/works/:id/sets', ({ repo, params }) => ({
    items: workSets(repo, params.id),
  }))
  // Rejection rules ("odrzucaj takie zawsze"): a new rule rejects matching queue offers at once.
  .add('GET', '/api/rejection-rules', ({ repo }) => ({ items: listRejectionRules(repo) }))
  .add('POST', '/api/rejection-rules', ({ repo, input }) => {
    const rule = createRejectionRule(repo, input || {});
    return { ...rule, ...applyRejectionRules(repo, { ruleIds: [rule.id] }) };
  })
  .add('DELETE', '/api/rejection-rules/:id', ({ repo, params }) =>
    deleteRejectionRule(repo, params.id),
  )
  .add('POST', '/api/sets/:offerId/dismiss', ({ repo, input, params }) =>
    dismissOfferSet(repo, params.offerId, input?.dismissed !== false),
  )
  .add('POST', '/api/catalog/work-duplicates/merge', ({ repo, input }) =>
    mergeWorkGroup(repo, input?.targetId, input?.sourceIds),
  )
  .add('GET', '/api/catalog/title-conflicts', ({ repo }) => ({
    conflicts: findTitleConflicts(repo),
  }))
  .add('POST', '/api/catalog/title-conflicts/resolve', ({ repo, input }) =>
    resolveTitleConflict(repo, input),
  )
  .add('POST', '/api/catalog/merge-works', ({ repo, input }) =>
    mergeCatalogWorks(repo, input?.sourceId, input?.targetId, input?.confirm === true),
  )
  .add('GET', '/api/data/overview', ({ repo }) => dataOverview(repo))
  .add('GET', '/api/deals/lifetime', ({ repo }) => dealLifetime(repo))
  .add('GET', '/api/valuation/backtest', ({ repo }) => valuationBacktest(repo))
  .add('POST', '/api/data/backup/verify', async ({ repo, input }) => {
    if (repo.path === ':memory:') fail('BACKUP_REQUIRES_FILE', 409);
    return verifyBackupInFolder(repo.path, input?.name);
  })
  .add('POST', '/api/data/backup', async ({ repo }) => {
    if (repo.path === ':memory:') fail('BACKUP_REQUIRES_FILE', 409);
    const destination = join(
      dirname(repo.path),
      'backups',
      'bookflip-manual-' + Date.now() + '-' + randomUUID() + '.sqlite',
    );
    return {
      path: await backupCatalog({ source: repo.path, destination }),
      ...(await dataOverview(repo)),
    };
  });

/**
 * Counts of the "Kolejka" tabs: review decisions, sets waiting for their composition, suspect
 * title assignments and possible duplicate works.
 */
/** Sets that contain an edition of this book (the book page). */
export function workSets(repo, workId) {
  return repo.database
    .prepare(
      `SELECT s.offer_id AS offerId, o.original_title AS title, o.source, o.current_price AS currentPrice,
         s.composition_confirmed AS confirmed, s.dismissed_at AS dismissedAt,
         (SELECT count(*) FROM offer_set_editions x WHERE x.offer_id=s.offer_id) AS books
       FROM offer_sets s JOIN offers o ON o.id=s.offer_id
       WHERE EXISTS (SELECT 1 FROM offer_set_editions se JOIN editions e ON e.id=se.edition_id
                     WHERE se.offer_id=s.offer_id AND e.work_id=?)
       ORDER BY s.dismissed_at IS NOT NULL, o.current_price DESC`,
    )
    .all(String(workId))
    .map((row) => ({ ...row, confirmed: Boolean(row.confirmed), books: Number(row.books) }));
}

export function queueSummary(repo) {
  const sets = repo.database
    .prepare(
      `SELECT count(*) AS open,
         sum(CASE WHEN NOT EXISTS (SELECT 1 FROM offer_set_editions e WHERE e.offer_id=s.offer_id)
                   AND NOT EXISTS (SELECT 1 FROM offer_set_unknown_items u WHERE u.offer_id=s.offer_id) THEN 1 ELSE 0 END) AS empty
       FROM offer_sets s WHERE s.composition_confirmed=0 AND s.dismissed_at IS NULL`,
    )
    .get();
  return {
    review: reviewQueueSummary(repo).decisions,
    sets: Number(sets.open || 0),
    setsEmpty: Number(sets.empty || 0),
    conflicts: findTitleConflicts(repo).length,
    duplicates: listWorkDuplicates(repo).groups.length,
  };
}

/** The sniper's state for „Okazje”: on/off, interval, last and next run, what it watches. */
function sniperStatus(repo) {
  const schedule = getScanSchedule(repo);
  const targets = sniperTargets(repo);
  return {
    ...schedule.sniper,
    nextRunAt: nextSniperRunAt(schedule),
    batch: SNIPER_BATCH,
    targets: targets.length,
    phrases: targets.map((target) => target.phrase),
    // Scheduled scans are switched off for this process (BOOKFLIP_SCHEDULED_SCANS=0).
    schedulerOff: String(process.env.BOOKFLIP_SCHEDULED_SCANS ?? '1') === '0',
  };
}

export async function apiRoute({ repo, method, path, input, query = {} }) {
  const found = apiRoutes.match(method, path);
  if (!found?.handler) return undefined;
  return found.handler({ repo, method, input, query, params: found.params });
}
