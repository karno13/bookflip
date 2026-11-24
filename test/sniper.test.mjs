import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import {
  createScanScheduler,
  getScanSchedule,
  nextSniperRunAt,
  saveSniper,
  SNIPER_BATCH,
} from '../scan-schedule.mjs';
import { createLocalAppServer } from '../local-app.mjs';

const targets = Array.from({ length: 14 }, (_, i) => ({ phrase: `Tytuł ${i}` }));

test('the sniper is off by default and validates its interval', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    assert.equal(getScanSchedule(repo).sniper.enabled, false);
    assert.equal(nextSniperRunAt(getScanSchedule(repo)), null);
    assert.throws(
      () => saveSniper(repo, { enabled: true, everyMinutes: 5 }),
      /INVALID_SNIPER_INTERVAL/,
    );
    assert.deepEqual(
      {
        enabled: saveSniper(repo, { enabled: true, everyMinutes: 15 }).enabled,
        every: getScanSchedule(repo).sniper.everyMinutes,
      },
      { enabled: true, every: 15 },
    );
  } finally {
    repo.close();
  }
});

test('the sniper scans the newest Vinted listings for a batch of targets, in turn', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    const calls = [];
    let clock = Date.parse('2026-11-20T12:00:00Z');
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => targets,
      now: () => clock,
    });
    const first = await scheduler.tick();
    assert.equal(first.sniper, true);
    assert.equal(first.result, 'ok');
    assert.deepEqual(calls[0], {
      queries: targets.slice(0, SNIPER_BATCH).map((target) => target.phrase),
      sources: ['Vinted'],
      mode: 'newest',
      trigger: 'sniper',
    });
    assert.deepEqual(await scheduler.tick(), { skipped: 'not-due' });
    clock += 20 * 60_000;
    await scheduler.tick();
    // The next run continues where the last one stopped and wraps around.
    assert.deepEqual(calls[1].queries, [
      ...targets.slice(SNIPER_BATCH).map((target) => target.phrase),
      ...targets
        .slice(0, SNIPER_BATCH - (targets.length - SNIPER_BATCH))
        .map((target) => target.phrase),
    ]);
    assert.equal(getScanSchedule(repo).sniper.lastResult, 'ok');
    assert.equal(getScanSchedule(repo).sniper.lastPhrases.length, SNIPER_BATCH);
  } finally {
    repo.close();
  }
});

test('the sniper waits for a running scan and does nothing without targets', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    const busy = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async () => 409,
      getTargets: () => targets,
    });
    assert.deepEqual(await busy.tick(), { skipped: 'scan-running' });
    assert.equal(
      getScanSchedule(repo).sniper.lastRunAt,
      null,
      'not recorded: tried again next minute',
    );
    const calls = [];
    const empty = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => [],
    });
    assert.equal((await empty.tick()).result, 'no-targets');
    assert.deepEqual(calls, []);
  } finally {
    repo.close();
  }
});

test('GET and PUT /api/sniper', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const status = await (await fetch(`${base}/api/sniper`)).json();
    assert.equal(status.enabled, false);
    assert.equal(status.targets, 0);
    const saved = await fetch(`${base}/api/sniper`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ enabled: true, everyMinutes: 30 }),
    });
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.equal(body.enabled, true);
    assert.equal(body.everyMinutes, 30);
    const alerts = await (await fetch(`${base}/api/deals/alerts`)).json();
    assert.deepEqual(alerts, { unseen: 0, items: [] });
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repo.close();
  }
});

test('a failed sniper scan does not move the cursor past phrases it did not check', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    let status = 503;
    let clock = Date.parse('2026-11-20T12:00:00Z');
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async () => status,
      getTargets: () => targets,
      now: () => clock,
    });
    const failed = await scheduler.tick();
    assert.equal(failed.result, 'http-503');
    assert.equal(getScanSchedule(repo).sniper.cursor, 0);
    status = 200;
    clock += 20 * 60_000;
    assert.equal((await scheduler.tick()).result, 'ok');
    assert.equal(getScanSchedule(repo).sniper.cursor, SNIPER_BATCH);
  } finally {
    repo.close();
  }
});

test('a scan that answers 200 but failed inside keeps the sniper cursor and is partial', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    let clock = Date.parse('2026-11-20T12:00:00Z');
    let fail = true;
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async () => {
        const at = new Date(clock + 1000).toISOString();
        repo.database
          .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
          .run(
            at,
            JSON.stringify({ errors: fail ? [{ source: 'Vinted', code: 'SOURCE_HTTP_403' }] : [] }),
            at,
          );
        return 200;
      },
      getTargets: () => targets,
      now: () => clock,
    });
    assert.equal((await scheduler.tick()).result, 'partial');
    assert.equal(getScanSchedule(repo).sniper.cursor, 0);
    fail = false;
    clock += 20 * 60_000;
    assert.equal((await scheduler.tick()).result, 'ok');
    assert.equal(getScanSchedule(repo).sniper.cursor, SNIPER_BATCH);
  } finally {
    repo.close();
  }
});

test('a partial run whose only errors cannot be retried (404 on one phrase) moves the rotation on', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    let clock = Date.parse('2026-11-23T12:00:00Z');
    let errors = [
      { source: 'Vinted', query: 'Warhammer', code: 'SOURCE_HTTP_404', retryable: false },
    ];
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async () => {
        const at = new Date(clock + 1000).toISOString();
        repo.database
          .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
          .run(at, JSON.stringify({ errors }), at);
        return 200;
      },
      getTargets: () => targets,
      now: () => clock,
    });
    assert.equal((await scheduler.tick()).result, 'partial');
    assert.equal(getScanSchedule(repo).sniper.cursor, SNIPER_BATCH);
    // A retryable error among them keeps the cursor, as before.
    errors = [
      ...errors,
      { source: 'Vinted', query: 'Legion', code: 'SOURCE_HTTP_429', retryable: true },
    ];
    clock += 20 * 60_000;
    assert.equal((await scheduler.tick()).result, 'partial');
    assert.equal(getScanSchedule(repo).sniper.cursor, SNIPER_BATCH);
  } finally {
    repo.close();
  }
});

test('PUT and GET /api/sniper pass adaptive through and drop the profile when it is switched off', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const put = (body) =>
      fetch(`${base}/api/sniper`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify(body),
      });
    assert.equal((await (await fetch(`${base}/api/sniper`)).json()).adaptive, false);
    const on = await (await put({ enabled: true, everyMinutes: 30, adaptive: true })).json();
    assert.equal(on.adaptive, true);
    assert.equal(on.profile.intervals.length, 168);
    const read = await (await fetch(`${base}/api/sniper`)).json();
    assert.equal(read.adaptive, true);
    assert.equal(read.profile.intervals.length, 168);
    const off = await (await put({ enabled: true, everyMinutes: 30, adaptive: false })).json();
    assert.equal(off.adaptive, false);
    assert.equal(off.profile, null);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repo.close();
  }
});

test('a profile saved without reason and coverage is recomputed at the next run, not after a day', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const clock = Date.parse('2026-11-20T12:00:00Z');
    saveSniper(repo, { enabled: true, everyMinutes: 20, adaptive: true }, clock);
    const read = () =>
      JSON.parse(
        repo.database
          .prepare("SELECT value_json FROM app_preferences WHERE key LIKE '%schedule%'")
          .get().value_json,
      );
    const row = repo.database
      .prepare("SELECT key, value_json FROM app_preferences WHERE key LIKE '%schedule%'")
      .get();
    const saved = JSON.parse(row.value_json);
    assert.ok('coverage' in saved.sniper.profile);
    delete saved.sniper.profile.reason;
    delete saved.sniper.profile.coverage;
    saved.sniper.profile.computedAt = new Date(clock - 3_600_000).toISOString(); // an hour old
    repo.database
      .prepare('UPDATE app_preferences SET value_json=? WHERE key=?')
      .run(JSON.stringify(saved), row.key);
    assert.ok(!('coverage' in read().sniper.profile));
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async () => 200,
      getTargets: () => targets,
      now: () => clock,
    });
    assert.equal((await scheduler.tick()).result, 'ok');
    const profile = getScanSchedule(repo).sniper.profile;
    assert.ok('reason' in profile && typeof profile.coverage === 'number');
    assert.equal(profile.computedAt, new Date(clock).toISOString());
  } finally {
    repo.close();
  }
});

test('the owner universes take two slots of every batch, in turn, and the batch size stays', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    const calls = [];
    let clock = Date.parse('2026-11-22T12:00:00Z');
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => ['Warhammer', 'Warcraft', 'Dragonlance'],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => targets,
      getBoostTargets: () => [],
      now: () => clock,
    });
    for (let run = 0; run < 3; run++) {
      await scheduler.tick();
      clock += 20 * 60_000;
    }
    assert.ok(calls.every((call) => call.queries.length === SNIPER_BATCH));
    assert.deepEqual(
      calls.map((call) => call.queries.slice(-2)),
      [
        ['Warhammer', 'Warcraft'],
        ['Dragonlance', 'Warhammer'],
        ['Warcraft', 'Dragonlance'],
      ],
    );
    assert.equal(getScanSchedule(repo).sniper.priorityCursor, 0);
  } finally {
    repo.close();
  }
});

test('with no regular targets the sniper still watches the owner universes', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    const calls = [];
    let clock = Date.parse('2026-11-22T12:00:00Z');
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => ['Warhammer', 'Warcraft', 'Dragonlance'],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => [],
      getBoostTargets: () => [],
      now: () => clock,
    });
    assert.equal((await scheduler.tick()).result, 'ok');
    clock += 20 * 60_000;
    await scheduler.tick();
    assert.deepEqual(
      calls.map((call) => call.queries),
      [
        ['Warhammer', 'Warcraft'],
        ['Dragonlance', 'Warhammer'],
      ],
    );
    assert.equal(getScanSchedule(repo).sniper.cursor, 0);
  } finally {
    repo.close();
  }
});

test('a universe phrase that is also a regular target is asked once; a failed scan keeps the priority cursor', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    const calls = [];
    let status = 200;
    let clock = Date.parse('2026-11-22T12:00:00Z');
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => ['Warhammer', 'warhammer', 'Warcraft'],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), status),
      getTargets: () => [{ phrase: 'Warhammer' }, ...targets],
      getBoostTargets: () => [],
      now: () => clock,
    });
    await scheduler.tick();
    const queries = calls[0].queries;
    assert.equal(queries.length, SNIPER_BATCH);
    assert.equal(queries.filter((phrase) => phrase.toLowerCase() === 'warhammer').length, 1);
    assert.deepEqual(
      queries.slice(-2).map((phrase) => phrase.toLowerCase()),
      ['warhammer', 'warcraft'],
    );
    const cursor = getScanSchedule(repo).sniper.priorityCursor;
    status = 500;
    clock += 20 * 60_000;
    await scheduler.tick();
    assert.equal(getScanSchedule(repo).sniper.priorityCursor, cursor);
  } finally {
    repo.close();
  }
});
