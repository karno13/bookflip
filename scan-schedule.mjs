// Recurring scans of a saved profile, so the catalogue stays fresh without opening the app.
// The scheduler only decides *when*; the scan itself goes through the same endpoint (and the same
// single-scan guard, rate limits and safeguards) as a scan started from the interface.
import { request as httpRequest } from 'node:http';
import { listScanProfiles } from './scan-profiles-api.mjs';
import { NEWEST_ORDER_SOURCES } from './marketplaces.mjs';
import { hasNoLegalAccess, scannableSources } from './source-blocks.mjs';
import { isbnTargets, sniperPhrase, sniperTargets } from './market-index.mjs';
import { listDeals } from './deals.mjs';
import { fold } from './title-proposals.mjs';
import { enabledPhrases } from './phrase-stats.mjs';
import { yieldTargets } from './phrase-yield.mjs';
import { SLOTS, slotOf, sniperProfile } from './inflow-profile.mjs';
import { STREAM_DEADLINE_MS, STREAM_EVERY_MS, STREAM_SLOTS } from './vinted-stream.mjs';

const KEY = 'scan_schedule';
// Schedule value meaning "every saved profile in turn": one profile per run, alphabetical.
export const ALL_PROFILES = '__all__';
const MIN_HOURS = 1;
const MAX_HOURS = 168;
// Quick scan of the newest listings: its own interval, off by default.
const QUICK_DEFAULT_HOURS = 2;
const QUICK_MAX_HOURS = 24;

function quickSchedule(saved = {}) {
  return {
    enabled: saved.enabled === true,
    everyHours: Number.isInteger(saved.everyHours) ? saved.everyHours : QUICK_DEFAULT_HOURS,
    lastRunAt: saved.lastRunAt ?? null,
    lastResult: saved.lastResult ?? null,
    lastProfile: typeof saved.lastProfile === 'string' ? saved.lastProfile : null,
  };
}

// Snajper: the newest Vinted listings for the works the market index rates best (market-index.mjs),
// a few phrases per run, every few minutes, so a deal is seen while it is still for sale. Off until
// the owner turns it on in „Okazje”. Same scan endpoint, gate and limits as every other scan.
export const SNIPER_BATCH = 10;
export const SNIPER_MINUTES = [15, 20, 30, 60];
const SNIPER_SOURCE = 'Vinted';
/**
 * Of the SNIPER_BATCH phrases of a run, at most this many go to works that currently have a deal on a
 * low or no-confidence valuation: sales (vanished offers) feed the valuation, so these works need
 * more frequent observation. They take slots from the batch (the request count per run is the same)
 * and only works the regular targets do not already cover.
 */
export const SNIPER_BOOST_SLOTS = 3;

/**
 * Works with a buyable deal whose valuation is low or none, best expected gain first, one phrase each.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function lowConfidenceDealTargets(repository, { at = Date.now() } = {}) {
  const best = new Map();
  for (const item of listDeals(repository, { at }).items) {
    if (item.hidden || item.confidence === 'high' || item.confidence === 'medium') continue;
    const current = best.get(item.workId);
    if (!current || item.expected > current.expected) best.set(item.workId, item);
  }
  const targets = [];
  const seen = new Set();
  for (const item of [...best.values()].sort((a, b) => b.expected - a.expected)) {
    const row = repository.database
      .prepare('SELECT authors_json AS authors FROM works WHERE id=?')
      .get(item.workId);
    let authors = [];
    try {
      authors = JSON.parse(String(row?.authors || '[]'));
    } catch {}
    const phrase = sniperPhrase(item.workTitle, authors);
    if (!phrase || seen.has(fold(phrase))) continue;
    seen.add(fold(phrase));
    targets.push({ workId: item.workId, title: item.workTitle, phrase, boost: true });
  }
  return targets;
}
/**
 * The owner's universes as sniper phrases (2026-11-22). The market index rates works by turnover and
 * value, and on the catalogue copy only 3 of 228 Warhammer / Dragonlance / Warcraft works passed that
 * sieve (none of Dragonlance), so the rare titles the owner is after were never watched. These
 * phrases take SNIPER_PRIORITY_SLOTS of every batch, in turn, like the boost slots.
 */
export const SNIPER_PRIORITY_SLOTS = 2;
export const SNIPER_PRIORITY_PHRASES = [
  'Warhammer',
  'Warcraft',
  'Dragonlance',
  'Smocza Lanca',
  'Herezja Horusa',
];
/**
 * Phrases with the best smoothed deal yield over the last 14 days (phrase-yield.mjs) take up to this
 * many slots of the batch, in turn (2026-11-22: the best phrases are author/series ones, not the
 * turnover targets). Taken from the regular share, so the request count per run does not change.
 */
export const SNIPER_YIELD_SLOTS = 2;
/**
 * The most valuable editions searched by their ISBN (market-index.mjs isbnTargets): one slot of the
 * batch, in turn. Catches listings whose title has a typo or no searchable words (2026-11-23).
 */
export const SNIPER_ISBN_SLOTS = 1;
const ISBN_PHRASE = /^97[89]\d{10}$/;
function sniperSchedule(saved = {}) {
  return {
    enabled: saved.enabled === true,
    everyMinutes: SNIPER_MINUTES.includes(saved.everyMinutes) ? saved.everyMinutes : 20,
    lastRunAt: saved.lastRunAt ?? null,
    lastResult: saved.lastResult ?? null,
    cursor: Number.isInteger(saved.cursor) && saved.cursor >= 0 ? saved.cursor : 0,
    boostCursor:
      Number.isInteger(saved.boostCursor) && saved.boostCursor >= 0 ? saved.boostCursor : 0,
    priorityCursor:
      Number.isInteger(saved.priorityCursor) && saved.priorityCursor >= 0
        ? saved.priorityCursor
        : 0,
    yieldCursor:
      Number.isInteger(saved.yieldCursor) && saved.yieldCursor >= 0 ? saved.yieldCursor : 0,
    isbnCursor: Number.isInteger(saved.isbnCursor) && saved.isbnCursor >= 0 ? saved.isbnCursor : 0,
    lastPhrases: Array.isArray(saved.lastPhrases) ? saved.lastPhrases.map(String) : [],
    // The last stream reading: new listings seen, pages read, phrases it put in the batch.
    lastStream:
      saved.lastStream && typeof saved.lastStream === 'object'
        ? {
            at: saved.lastStream.at ? String(saved.lastStream.at) : null,
            result: saved.lastStream.result ? String(saved.lastStream.result) : null,
            listings: Number(saved.lastStream.listings) || 0,
            pages: Number(saved.lastStream.pages) || 0,
            phrases: Array.isArray(saved.lastStream.phrases)
              ? saved.lastStream.phrases.map(String)
              : [],
            error: saved.lastStream.error ? String(saved.lastStream.error) : null,
          }
        : null,
    // "Dopasuj do godzin napływu": the interval follows the hours new listings appear in (off by default).
    adaptive: saved.adaptive === true,
    profile:
      saved.profile &&
      Array.isArray(saved.profile.intervals) &&
      saved.profile.intervals.length === SLOTS
        ? saved.profile
        : null,
  };
}

function fail(code, statusCode = 400) {
  throw Object.assign(Error(code), { statusCode });
}

export function getScanSchedule(repository) {
  const row = repository.database
    .prepare('SELECT value_json FROM app_preferences WHERE key=?')
    .get(KEY);
  const saved = row ? JSON.parse(row.value_json) : {};
  return {
    enabled: saved.enabled === true,
    profile: typeof saved.profile === 'string' ? saved.profile : '',
    everyHours: Number.isFinite(saved.everyHours) ? saved.everyHours : 24,
    lastRunAt: saved.lastRunAt ?? null,
    lastResult: saved.lastResult ?? null,
    lastProfile: typeof saved.lastProfile === 'string' ? saved.lastProfile : null,
    // Sources left out of the last run (failed recently) and sources that failed during it.
    lastSkipped: Array.isArray(saved.lastSkipped) ? saved.lastSkipped : [],
    lastProblems: Array.isArray(saved.lastProblems) ? saved.lastProblems : [],
    quick: quickSchedule(saved.quick),
    sniper: sniperSchedule(saved.sniper),
  };
}

// A source that failed its last check is left out of scheduled scans for this long, then tried
// again once so that it can come back on its own (health is updated by every scan that uses it).
export const DEAD_SOURCE_PAUSE_MS = 24 * 3_600_000;

/** The profile's sources minus those that failed their last check less than a day ago. */
export function sourcesToScan(repository, allSources, at = Date.now()) {
  // Allegro and OLX have no legal access (source-blocks.mjs): never part of a scheduled scan.
  const sources = scannableSources(allSources);
  let rows = [];
  try {
    rows = repository.database
      .prepare('SELECT source,status,last_checked_at FROM source_health')
      .all();
  } catch {
    return { sources: [...sources], skipped: [] };
  }
  const dead = new Set(
    rows
      .filter(
        (row) =>
          row.status === 'failed' &&
          at - Date.parse(row.last_checked_at || '') < DEAD_SOURCE_PAUSE_MS,
      )
      .map((row) => row.source),
  );
  return {
    sources: sources.filter((source) => !dead.has(source)),
    skipped: sources.filter((source) => dead.has(source)),
  };
}

/** Sources that reported errors in the scan saved at or after `since` (not the ones without legal access). */
/** The errors of the newest scan run since `since` ({ source, query, code, retryable? }). */
export function scanErrors(repository, since) {
  try {
    const row = repository.database
      .prepare(
        'SELECT summary_json FROM scan_runs WHERE scanned_at>=? ORDER BY scanned_at DESC LIMIT 1',
      )
      .get(since);
    const errors = row ? JSON.parse(row.summary_json).errors || [] : [];
    return errors.filter(
      (/** @type {any} */ error) => error?.source && !hasNoLegalAccess(error.source),
    );
  } catch {
    return [];
  }
}

export function scanProblems(repository, since) {
  try {
    const row = repository.database
      .prepare(
        'SELECT summary_json FROM scan_runs WHERE scanned_at>=? ORDER BY scanned_at DESC LIMIT 1',
      )
      .get(since);
    const errors = row ? JSON.parse(row.summary_json).errors || [] : [];
    return [
      ...new Set(
        errors.map((error) => error.source).filter((source) => source && !hasNoLegalAccess(source)),
      ),
    ].sort();
  } catch {
    return [];
  }
}

function store(repository, value, now) {
  repository.database
    .prepare(
      'INSERT INTO app_preferences(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at',
    )
    .run(KEY, JSON.stringify(value), new Date(now).toISOString());
}

export function saveScanSchedule(repository, input, now = Date.now()) {
  const enabled = input?.enabled === true;
  const profile = typeof input?.profile === 'string' ? input.profile : '';
  const everyHours = Number(input?.everyHours);
  if (!Number.isInteger(everyHours) || everyHours < MIN_HOURS || everyHours > MAX_HOURS)
    fail('INVALID_SCHEDULE_INTERVAL');
  const current = getScanSchedule(repository);
  const quick = { ...current.quick };
  if (input?.quick !== undefined) {
    const hours = Number(input.quick?.everyHours ?? quick.everyHours);
    if (!Number.isInteger(hours) || hours < MIN_HOURS || hours > QUICK_MAX_HOURS)
      fail('INVALID_QUICK_SCAN_INTERVAL');
    quick.enabled = input.quick?.enabled === true;
    quick.everyHours = hours;
  }
  const profiles = listScanProfiles(repository);
  if (
    (enabled || quick.enabled) &&
    !(profile === ALL_PROFILES ? profiles.length : profiles.some((item) => item.name === profile))
  )
    fail('SCHEDULE_PROFILE_NOT_FOUND');
  store(repository, { ...current, enabled, profile, everyHours, quick }, now);
  return getScanSchedule(repository);
}

/** Turns the sniper on or off and sets its interval; the rest of the schedule stays. */
export function saveSniper(repository, input, now = Date.now()) {
  const current = getScanSchedule(repository);
  const everyMinutes = Number(input?.everyMinutes ?? current.sniper.everyMinutes);
  if (!SNIPER_MINUTES.includes(everyMinutes)) fail('INVALID_SNIPER_INTERVAL');
  const adaptive = typeof input?.adaptive === 'boolean' ? input.adaptive : current.sniper.adaptive;
  // The intervals rest on the base interval: they are worked out again when it or the switch changes.
  const profile =
    adaptive && (!current.sniper.adaptive || everyMinutes !== current.sniper.everyMinutes)
      ? sniperProfile(repository, everyMinutes, { at: now })
      : adaptive
        ? current.sniper.profile
        : null;
  store(
    repository,
    {
      ...current,
      sniper: {
        ...current.sniper,
        enabled: input?.enabled === true,
        everyMinutes,
        adaptive,
        profile,
      },
    },
    now,
  );
  return getScanSchedule(repository).sniper;
}

const PROFILE_MAX_AGE = 24 * 3_600_000;
/** The sniper profile, recomputed when it is a day old; null when the sniper is not adaptive. */
function refreshedProfile(repository, sniper, now) {
  if (!sniper.adaptive) return null;
  const age = sniper.profile ? now - Date.parse(sniper.profile.computedAt) : Infinity;
  // A profile saved by the older method (no reason / coverage) is recomputed at once, not after a day.
  const current =
    sniper.profile && 'reason' in sniper.profile && typeof sniper.profile.coverage === 'number';
  return current && age < PROFILE_MAX_AGE
    ? sniper.profile
    : sniperProfile(repository, sniper.everyMinutes, { at: now });
}

/** When the next sniper run is due, or null when it is off. */
export function nextSniperRunAt(schedule) {
  if (!schedule.sniper?.enabled) return null;
  const last = schedule.sniper.lastRunAt ? Date.parse(schedule.sniper.lastRunAt) : 0;
  const intervals = schedule.sniper.adaptive ? schedule.sniper.profile?.intervals : null;
  // The interval of the hour the last run was in; the fixed one without a profile.
  const minutes =
    last && Array.isArray(intervals) && intervals.length === SLOTS
      ? intervals[slotOf(last)]
      : schedule.sniper.everyMinutes;
  return last + minutes * 60_000;
}

/** When the stream (streamTick) reads next: STREAM_EVERY_MS after its last reading, while the sniper is on. */
export function nextStreamRunAt(schedule) {
  if (!schedule.sniper?.enabled) return null;
  const last = schedule.sniper.lastStream?.at ? Date.parse(schedule.sniper.lastStream.at) : 0;
  return (Number.isFinite(last) ? last : 0) + STREAM_EVERY_MS;
}

/** The profile after `last` in name order (wrapping), for the rotating schedule. */
export function nextProfile(profiles, last) {
  if (!profiles.length) return null;
  const index = profiles.findIndex((item) => item.name === last);
  return profiles[(index + 1) % profiles.length];
}

/** When the next quick scan (newest listings) is due, or null when it is off. */
export function nextQuickRunAt(schedule) {
  if (!schedule.quick?.enabled || !schedule.profile) return null;
  const last = schedule.quick.lastRunAt ? Date.parse(schedule.quick.lastRunAt) : 0;
  return last + schedule.quick.everyHours * 3_600_000;
}

/** When the next scan is due, or null when the schedule is off. */
export function nextRunAt(schedule) {
  if (!schedule.enabled || !schedule.profile) return null;
  const last = schedule.lastRunAt ? Date.parse(schedule.lastRunAt) : 0;
  return last + schedule.everyHours * 3_600_000;
}

// The runner answers with the HTTP status, or { status, error } when it read the body: a 409 is
// either another scan in progress (try again next minute) or this scan cancelled by the owner.
function scanReply(reply) {
  const { status, error = null } = typeof reply === 'number' ? { status: reply } : reply;
  return { status, cancelled: status === 409 && error === 'SCAN_CANCELLED' };
}

export function createScanScheduler({
  getRepository,
  runScan,
  getTargets = (repository) => sniperTargets(repository),
  getBoostTargets = (repository) => lowConfidenceDealTargets(repository),
  getPriorityPhrases = () => SNIPER_PRIORITY_PHRASES,
  getYieldTargets = (repository) => yieldTargets(repository),
  getIsbnTargets = (repository) => isbnTargets(repository),
  // The Vinted stream (vinted-stream.mjs sniperStream): resolves { phrases, listings, pages } or
  // null when switched off. A failure leaves the batch as it would be without it.
  // null: no stream tick at all (BOOKFLIP_SNIPER_STREAM=0, tests that do not test it).
  readStream = /** @type {null | ((repository: any, options: { signal?: AbortSignal }) => Promise<any>)} */ (
    null
  ),
  now = Date.now,
  checkEveryMs = 60_000,
  onEvent = () => {},
  setTimer = setInterval,
  clearTimer = clearInterval,
}) {
  let timer = null;
  // The yield ranking is a 14-day view (about half a second of synchronous SQLite): worked out at
  // most once an hour, and a failure only leaves the yield slots empty, never stops the sniper run.
  let yieldCache = { at: -Infinity, phrases: [] };
  const YIELD_CACHE_MS = 3_600_000;
  function yieldPhrases(repository) {
    if (now() - yieldCache.at < YIELD_CACHE_MS) return yieldCache.phrases;
    let phrases = [];
    try {
      phrases = getYieldTargets(repository).map((target) => target.phrase);
    } catch {
      phrases = [];
    }
    yieldCache = { at: now(), phrases };
    return phrases;
  }
  // ISBN targets come from the market index (~0.4 s): also once an hour, a failure leaves the slot empty.
  let isbnCache = { at: -Infinity, phrases: [] };
  function isbnPhrases(repository) {
    if (now() - isbnCache.at < YIELD_CACHE_MS) return isbnCache.phrases;
    let phrases = [];
    try {
      phrases = getIsbnTargets(repository).map((target) => target.phrase);
    } catch {
      phrases = [];
    }
    isbnCache = { at: now(), phrases };
    return phrases;
  }
  let running = false;

  async function tick() {
    if (running) return { skipped: 'busy' };
    const repository = getRepository();
    if (!repository) return { skipped: 'no-catalog' };
    const schedule = getScanSchedule(repository);
    const due = nextRunAt(schedule);
    // The full scan has priority; the quick one runs in between, the sniper in the gaps left.
    if (due === null || now() < due) {
      const quickDue = nextQuickRunAt(schedule);
      if (quickDue !== null && now() >= quickDue) return quickTick(repository, schedule);
      const sniperDue = nextSniperRunAt(schedule);
      if (sniperDue !== null && now() >= sniperDue) return sniperTick(repository, schedule);
      const streamDue = readStream ? nextStreamRunAt(schedule) : null;
      if (streamDue !== null && now() >= streamDue) return streamTick(repository);
      return {
        skipped: due === null && quickDue === null && sniperDue === null ? 'off' : 'not-due',
      };
    }
    const profiles = listScanProfiles(repository);
    const profile =
      schedule.profile === ALL_PROFILES
        ? nextProfile(profiles, schedule.lastProfile)
        : profiles.find((item) => item.name === schedule.profile);
    running = true;
    let result;
    let skipped = [];
    let problems = [];
    try {
      if (!profile) result = 'profile-missing';
      else {
        const plan = sourcesToScan(repository, profile.sources, now());
        skipped = plan.skipped;
        // Phrases the owner switched off ("Frazy") are not scanned by the schedule.
        const queries = enabledPhrases(repository, profile.queries);
        if (!plan.sources.length) result = 'all-sources-down';
        else if (!queries.length) result = 'all-phrases-disabled';
        else {
          const startedAt = new Date(now()).toISOString();
          const { status, cancelled } = scanReply(
            await runScan({ queries, sources: plan.sources, trigger: 'schedule' }),
          );
          // A cancelled scan counts as this run: starting it again a minute later would make
          // "Anuluj" useless (2026-11-20: the same profile restarted after every cancel).
          if (status === 409 && !cancelled) return { skipped: 'scan-running' };
          const success = status >= 200 && status < 300;
          problems = success ? scanProblems(repository, startedAt) : [];
          result = cancelled
            ? 'cancelled'
            : success
              ? problems.length
                ? 'partial'
                : 'ok'
              : `http-${status}`;
        }
      }
    } catch (error) {
      result = `error:${String(error?.message ?? error).slice(0, 60)}`;
    } finally {
      running = false;
    }
    // Record the attempt even on failure so that a broken profile cannot be retried every minute.
    const fresh = getScanSchedule(repository);
    store(
      repository,
      {
        ...fresh,
        lastRunAt: new Date(now()).toISOString(),
        lastResult: result,
        lastProfile: profile?.name ?? fresh.lastProfile,
        lastSkipped: skipped,
        lastProblems: problems,
      },
      now(),
    );
    onEvent({
      type: 'scheduled_scan',
      profile: profile?.name ?? schedule.profile,
      result,
      skipped,
      problems,
    });
    return { ran: true, result, skipped, problems };
  }

  async function quickTick(repository, schedule) {
    const profiles = listScanProfiles(repository);
    const profile =
      schedule.profile === ALL_PROFILES
        ? nextProfile(profiles, schedule.quick.lastProfile)
        : profiles.find((item) => item.name === schedule.profile);
    running = true;
    let result;
    try {
      const sortable = (profile?.sources || []).filter((source) =>
        NEWEST_ORDER_SOURCES.has(source),
      );
      const plan = sourcesToScan(repository, sortable, now());
      if (!profile) result = 'profile-missing';
      else if (!sortable.length) result = 'no-sortable-source';
      else if (!plan.sources.length) result = 'all-sources-down';
      else if (!enabledPhrases(repository, profile.queries).length) result = 'all-phrases-disabled';
      else {
        const startedAt = new Date(now()).toISOString();
        const { status, cancelled } = scanReply(
          await runScan({
            queries: enabledPhrases(repository, profile.queries),
            sources: plan.sources,
            mode: 'newest',
            trigger: 'quick',
          }),
        );
        if (status === 409 && !cancelled) return { skipped: 'scan-running' };
        const success = status >= 200 && status < 300;
        // The endpoint answers 2xx even when a source failed inside the scan: that is partial.
        result = cancelled
          ? 'cancelled'
          : success
            ? scanProblems(repository, startedAt).length
              ? 'partial'
              : 'ok'
            : `http-${status}`;
      }
    } catch (error) {
      result = `error:${String(error?.message ?? error).slice(0, 60)}`;
    } finally {
      running = false;
    }
    const fresh = getScanSchedule(repository);
    store(
      repository,
      {
        ...fresh,
        quick: {
          ...fresh.quick,
          lastRunAt: new Date(now()).toISOString(),
          lastResult: result,
          lastProfile: profile?.name ?? fresh.quick.lastProfile,
        },
      },
      now(),
    );
    onEvent({ type: 'scheduled_quick_scan', profile: profile?.name ?? schedule.profile, result });
    return { ran: true, quick: true, result };
  }

  async function sniperTick(repository, schedule) {
    running = true;
    let result;
    let phrases = [];
    let cursor = schedule.sniper.cursor;
    let boostCursor = schedule.sniper.boostCursor;
    let priorityCursor = schedule.sniper.priorityCursor;
    let yieldCursor = schedule.sniper.yieldCursor;
    let isbnCursor = schedule.sniper.isbnCursor;
    // The cursors move after an ok run (and after a partial one whose errors cannot be retried).
    let advance = false;
    try {
      const everyTarget = getTargets(repository);
      const allowed = new Set(
        enabledPhrases(
          repository,
          everyTarget.map((target) => target.phrase),
        ),
      );
      const targets = everyTarget.filter((target) => allowed.has(target.phrase));
      const plan = sourcesToScan(repository, [SNIPER_SOURCE], now());
      // The owner's universe phrases are watched even when the sieve gives no regular target
      // (a fresh install with no turnover history yet).
      const anyPriority = enabledPhrases(repository, getPriorityPhrases(repository)).length > 0;
      if (!targets.length && !anyPriority) result = 'no-targets';
      else if (!plan.sources.length) result = 'source-down';
      else {
        let left = SNIPER_BATCH;
        // Low-confidence-deal works the regular rotation does not cover take a few slots of the batch.
        const covered = new Set(targets.map((target) => fold(target.phrase)));
        const boostAll = getBoostTargets(repository).filter(
          (target) => !covered.has(fold(target.phrase)),
        );
        const boostAllowed = new Set(
          enabledPhrases(
            repository,
            boostAll.map((target) => target.phrase),
          ),
        );
        const boostable = boostAll.filter((target) => boostAllowed.has(target.phrase));
        const boostCount = Math.min(SNIPER_BOOST_SLOTS, boostable.length, left);
        left -= boostCount;
        const boostStart = boostable.length ? boostCursor % boostable.length : 0;
        const boosted = [...boostable.slice(boostStart), ...boostable.slice(0, boostStart)]
          .slice(0, boostCount)
          .map((target) => target.phrase);
        if (boostable.length) boostCursor = (boostStart + boostCount) % boostable.length;
        // The owner's universes: a phrase the owner switched off stays off, and one the boost
        // already asks is not asked twice. A universe phrase that is also a regular target gets its
        // priority slot and is skipped among the regular ones (no double request in one batch).
        const boostedKeys = new Set(boosted.map(fold));
        const priorityAll = [
          ...new Map(
            enabledPhrases(repository, getPriorityPhrases(repository))
              .filter((phrase) => !boostedKeys.has(fold(phrase)))
              .map((phrase) => [fold(phrase), phrase]),
          ).values(),
        ];
        const priorityCount = Math.min(SNIPER_PRIORITY_SLOTS, priorityAll.length, left);
        left -= priorityCount;
        const priorityStart = priorityAll.length ? priorityCursor % priorityAll.length : 0;
        const priority = [
          ...priorityAll.slice(priorityStart),
          ...priorityAll.slice(0, priorityStart),
        ].slice(0, priorityCount);
        if (priorityAll.length)
          priorityCursor = (priorityStart + priorityCount) % priorityAll.length;
        // The best-yield phrases: not switched off, not already asked as boost or priority.
        const takenKeys = new Set([...boostedKeys, ...priority.map(fold)]);
        const yieldAll = [
          ...new Map(
            enabledPhrases(repository, yieldPhrases(repository))
              // ISBN phrases have their own slot (they reach phrase-yield through offer_queries).
              .filter((phrase) => !takenKeys.has(fold(phrase)) && !ISBN_PHRASE.test(phrase))
              .map((phrase) => [fold(phrase), phrase]),
          ).values(),
        ];
        const yieldCount = Math.min(SNIPER_YIELD_SLOTS, yieldAll.length, left);
        left -= yieldCount;
        const yieldStart = yieldAll.length ? yieldCursor % yieldAll.length : 0;
        const yielded = [...yieldAll.slice(yieldStart), ...yieldAll.slice(0, yieldStart)].slice(
          0,
          yieldCount,
        );
        if (yieldAll.length) yieldCursor = (yieldStart + yieldCount) % yieldAll.length;
        // The most valuable editions by ISBN, in turn.
        const isbnAll = enabledPhrases(repository, isbnPhrases(repository));
        const isbnCount = Math.min(SNIPER_ISBN_SLOTS, isbnAll.length, left);
        left -= isbnCount;
        const isbnStart = isbnAll.length ? isbnCursor % isbnAll.length : 0;
        const isbned = [...isbnAll.slice(isbnStart), ...isbnAll.slice(0, isbnStart)].slice(
          0,
          isbnCount,
        );
        if (isbnAll.length) isbnCursor = (isbnStart + isbnCount) % isbnAll.length;
        const priorityKeys = new Set([...priority, ...yielded, ...isbned].map(fold));
        const room = Math.max(0, left);
        const start = targets.length ? cursor % targets.length : 0;
        const regular = [];
        let looked = 0;
        for (const target of [...targets.slice(start), ...targets.slice(0, start)]) {
          if (regular.length >= room) break;
          looked++;
          if (!priorityKeys.has(fold(target.phrase))) regular.push(target.phrase);
        }
        if (targets.length) cursor = (start + looked) % targets.length;
        phrases = [...regular, ...boosted, ...priority, ...yielded, ...isbned];
        const startedAt = new Date(now()).toISOString();
        const { status, cancelled } = scanReply(
          await runScan({
            queries: phrases,
            sources: plan.sources,
            mode: 'newest',
            trigger: 'sniper',
          }),
        );
        if (status === 409 && !cancelled) return { skipped: 'scan-running' };
        const success = status >= 200 && status < 300;
        // 2xx with a failed source inside is partial: the phrases were not really checked, so the
        // cursor stays (below) and the next round tries them again, unless every error says a
        // retry will not help (a 404 on one phrase): then the rotation moves on instead of
        // asking the same batch for ever.
        result = cancelled
          ? 'cancelled'
          : success
            ? scanProblems(repository, startedAt).length
              ? 'partial'
              : 'ok'
            : `http-${status}`;
        if (result === 'partial')
          advance = scanErrors(repository, startedAt).every((error) => error.retryable === false);
      }
    } catch (error) {
      result = `error:${String(error?.message ?? error).slice(0, 60)}`;
    } finally {
      running = false;
    }
    const fresh = getScanSchedule(repository);
    store(
      repository,
      {
        ...fresh,
        sniper: {
          ...fresh.sniper,
          lastRunAt: new Date(now()).toISOString(),
          lastResult: result,
          // The profile is worked out again once a day (new offers move the busy hours).
          profile: refreshedProfile(repository, fresh.sniper, now()),
          // A failed scan must not skip the phrases it did not check.
          cursor: result === 'ok' || advance ? cursor : schedule.sniper.cursor,
          boostCursor: result === 'ok' || advance ? boostCursor : schedule.sniper.boostCursor,
          priorityCursor:
            result === 'ok' || advance ? priorityCursor : schedule.sniper.priorityCursor,
          yieldCursor: result === 'ok' || advance ? yieldCursor : schedule.sniper.yieldCursor,
          isbnCursor: result === 'ok' || advance ? isbnCursor : schedule.sniper.isbnCursor,
          lastPhrases: phrases,
        },
      },
      now(),
    );
    onEvent({ type: 'sniper_scan', phrases: phrases.length, result });
    return { ran: true, sniper: true, result, phrases };
  }

  /**
   * „Strumień”: every STREAM_EVERY_MS while the sniper is on, the newest listings of the whole
   * Vinted books category (vinted-stream.mjs); when some point at catalogue works, a newest scan of
   * just those phrases (at most STREAM_SLOTS). Nothing new: no scan at all.
   */
  async function streamTick(repository) {
    running = true;
    const at = new Date(now()).toISOString();
    /** @type {any} */
    let stream = null;
    let result = 'nothing-new';
    /** @type {string[]} */
    let phrases = [];
    try {
      const plan = sourcesToScan(repository, [SNIPER_SOURCE], now());
      if (!plan.sources.length) result = 'source-down';
      else {
        try {
          // A deadline: a long gate cooldown must not hold the scheduler (and the running flag).
          const signal = AbortSignal.timeout(STREAM_DEADLINE_MS);
          let timer;
          stream = await Promise.race([
            /** @type {NonNullable<typeof readStream>} */ (readStream)(repository, { signal }),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Error('STREAM_TIMEOUT')), STREAM_DEADLINE_MS + 1000);
              timer.unref?.();
            }),
          ]).finally(() => clearTimeout(timer));
        } catch (error) {
          stream = {
            listings: 0,
            pages: 0,
            phrases: [],
            error: String(error?.message ?? error).slice(0, 60),
          };
          result = [403, 429].includes(Number(error?.status)) ? 'source-down' : 'error';
        }
        if (!stream) result = 'off';
        else if (!stream.error) {
          phrases = enabledPhrases(repository, stream.phrases ?? []).slice(0, STREAM_SLOTS);
          if (phrases.length) {
            const startedAt = new Date(now()).toISOString();
            const { status, cancelled } = scanReply(
              await runScan({
                queries: phrases,
                sources: plan.sources,
                mode: 'newest',
                trigger: 'sniper',
              }),
            );
            if (status === 409 && !cancelled) return { skipped: 'scan-running' };
            result = cancelled
              ? 'cancelled'
              : status >= 200 && status < 300
                ? scanProblems(repository, startedAt).length
                  ? 'partial'
                  : 'ok'
                : `http-${status}`;
          }
        }
      }
    } catch (error) {
      result = `error:${String(error?.message ?? error).slice(0, 60)}`;
    } finally {
      running = false;
    }
    const fresh = getScanSchedule(repository);
    store(
      repository,
      {
        ...fresh,
        sniper: {
          ...fresh.sniper,
          lastStream: {
            at,
            listings: Number(stream?.listings) || 0,
            pages: Number(stream?.pages) || 0,
            phrases,
            error: stream?.error ?? null,
            result,
          },
        },
      },
      now(),
    );
    onEvent({
      type: 'sniper_stream',
      listings: stream?.listings ?? 0,
      phrases: phrases.length,
      result,
    });
    return { ran: true, stream: true, result, phrases };
  }

  return {
    tick,
    start() {
      if (!timer) timer = setTimer(() => void tick().catch(() => {}), checkEveryMs);
      timer?.unref?.();
    },
    stop() {
      if (timer) clearTimer(timer);
      timer = null;
    },
  };
}

/**
 * POSTs to this server's own scan endpoint exactly like the browser does; resolves { status, error }.
 * A request unanswered within timeoutMs (default 3 h) is abandoned so the scheduler is not stuck as busy.
 */
export function localScanRunner(port, { timeoutMs = 3 * 3600_000 } = {}) {
  return (input) =>
    new Promise((resolve, reject) => {
      const body = JSON.stringify(input);
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: '/api/search',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Origin: `http://127.0.0.1:${port}`,
          },
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (text += chunk));
          res.on('end', () => {
            let error = null;
            try {
              error = JSON.parse(text)?.error ?? null;
            } catch {}
            resolve({ status: res.statusCode, error });
          });
        },
      );
      req.setTimeout(timeoutMs, () => req.destroy(new Error('SCAN_TIMEOUT')));
      req.on('error', reject);
      req.end(body);
    });
}
