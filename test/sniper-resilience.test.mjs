import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import {
  createScanScheduler,
  DEAD_SOURCE_PAUSE_MS,
  getScanSchedule,
  saveSniper,
  SNIPER_BATCH,
  SNIPER_BOOST_SLOTS,
} from '../scan-schedule.mjs';
import { createMarketplaceGate } from '../marketplace-gate.mjs';
import { readSourceHtml } from '../marketplaces.mjs';

const targets = Array.from({ length: 14 }, (_, i) => ({ phrase: `Tytuł ${i}` }));
const START = Date.parse('2026-11-20T12:00:00Z');

function markVintedFailed(repo, at) {
  repo.database
    .prepare(
      'INSERT INTO source_health(source,last_checked_at,last_success_at,last_error_at,last_error,status) VALUES(?,?,?,?,?,?)',
    )
    .run(
      'Vinted',
      new Date(at).toISOString(),
      null,
      new Date(at).toISOString(),
      'SOURCE_CAPTCHA',
      'failed',
    );
}

test('after a block the sniper sends no request to the source during the pause, then tries once', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 15 }, START);
    markVintedFailed(repo, START);
    let clock = START + 20 * 60_000;
    const calls = [];
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => targets,
      now: () => clock,
    });
    for (let i = 0; i < 5; i++) {
      assert.equal((await scheduler.tick()).result, 'source-down');
      clock += 60 * 60_000;
    }
    assert.deepEqual(calls, []);
    clock = START + DEAD_SOURCE_PAUSE_MS + 60_000;
    assert.equal((await scheduler.tick()).result, 'ok');
    assert.equal(calls.length, 1);
  } finally {
    repo.close();
  }
});

test('the gate holds back a second read of a blocked source until the cooldown ends', async () => {
  let clock = 1000;
  const gate = createMarketplaceGate();
  const waits = [];
  const options = {
    source: 'Vinted',
    gate,
    now: () => clock,
    pause: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  };
  await assert.rejects(
    readSourceHtml('https://www.vinted.pl/catalog/2312-books', {
      ...options,
      fetcher: async () => new Response('<title>Verify you are human</title>', { status: 403 }),
    }),
    (error) => error.blocked === true,
  );
  const blockedUntil = gate.snapshot('Vinted').cooldownUntil;
  assert.ok(blockedUntil > clock);
  const started = [];
  await readSourceHtml('https://www.vinted.pl/catalog/2312-books', {
    ...options,
    fetcher: async () => {
      started.push(clock);
      return new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } });
    },
  });
  assert.equal(started.length, 1);
  assert.ok(started[0] >= blockedUntil, 'the request started only after the cooldown');
});

test('a new scheduler on the same repository resumes: cursor kept, no immediate re-run', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 }, START);
    let clock = START;
    const calls = [];
    const make = () =>
      createScanScheduler({
        getPriorityPhrases: () => [],
        getRepository: () => repo,
        runScan: async (input) => (calls.push(input), 200),
        getTargets: () => targets,
        now: () => clock,
      });
    assert.equal((await make().tick()).result, 'ok');
    // "Restart": a fresh instance, only the saved state remains.
    const restarted = make();
    clock += 5 * 60_000;
    assert.deepEqual(await restarted.tick(), { skipped: 'not-due' });
    assert.equal(calls.length, 1);
    clock += 15 * 60_000;
    assert.equal((await restarted.tick()).result, 'ok');
    assert.equal(getScanSchedule(repo).sniper.enabled, true);
    assert.deepEqual(
      calls[1].queries.slice(0, targets.length - SNIPER_BATCH),
      targets.slice(SNIPER_BATCH).map((target) => target.phrase),
      'continues where the previous instance stopped',
    );
  } finally {
    repo.close();
  }
});

test('boost works with a low-confidence deal take a few slots, the batch size stays', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 15 }, START);
    const boost = Array.from({ length: 5 }, (_, i) => ({ phrase: `Słaba wycena ${i}` }));
    // One boost work is already in the regular targets: it must not be scanned twice.
    boost.push({ phrase: targets[2].phrase });
    let clock = START + 20 * 60_000;
    const calls = [];
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => targets,
      getBoostTargets: () => boost,
      now: () => clock,
    });
    for (let i = 0; i < 3; i++) {
      assert.equal((await scheduler.tick()).result, 'ok');
      clock += 20 * 60_000;
    }
    for (const call of calls) {
      assert.equal(call.queries.length, SNIPER_BATCH, 'request count per run unchanged');
      assert.equal(new Set(call.queries).size, SNIPER_BATCH, 'no phrase twice');
      assert.equal(call.queries.filter((q) => q.startsWith('Słaba')).length, SNIPER_BOOST_SLOTS);
      assert.equal(call.mode, 'newest');
    }
    // The best-turnover works still rotate: 7 of them per run, in order.
    assert.deepEqual(
      calls[0].queries.slice(0, 7),
      targets.slice(0, 7).map((target) => target.phrase),
    );
    assert.deepEqual(
      calls[1].queries.slice(0, 7),
      targets.slice(7, 14).map((target) => target.phrase),
    );
    // The boost rotates through all of its works over the runs.
    const seen = new Set(
      calls.flatMap((call) => call.queries.filter((q) => q.startsWith('Słaba'))),
    );
    assert.equal(seen.size, 5);
    assert.equal(getScanSchedule(repo).sniper.boostCursor, 9 % 5);
  } finally {
    repo.close();
  }
});

test('without boost works the sniper behaves as before', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 15 }, START);
    const calls = [];
    const scheduler = createScanScheduler({
      getPriorityPhrases: () => [],
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => targets,
      getBoostTargets: () => [],
      now: () => START + 20 * 60_000,
    });
    await scheduler.tick();
    assert.deepEqual(
      calls[0].queries,
      targets.slice(0, SNIPER_BATCH).map((target) => target.phrase),
    );
  } finally {
    repo.close();
  }
});
