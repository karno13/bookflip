import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductionCatalog } from '../catalog-production.mjs';
import { markDealAlertsSeen } from '../deal-alerts.mjs';
import { searchAndStore, validateSearchInput } from '../scan-engine.mjs';
import { putScanProfile } from '../scan-profiles-api.mjs';
import { createScanScheduler, saveScanSchedule, saveSniper } from '../scan-schedule.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

async function recordedContext(input) {
  const store = createProductionCatalog({
    databasePath: ':memory:',
    fetcher: async () => assert.fail('no network'),
  });
  try {
    const search = async (scanInput) => ({
      offers: [],
      results: [{ source: 'Vinted', query: 'mort', status: 'ok', pagination: { state: 'end' } }],
      searchedAt: '2026-11-22T10:00:00.000Z',
      summary: {},
      ...(scanInput.mode ? { mode: scanInput.mode } : {}),
    });
    await searchAndStore(validateSearchInput(input), () => {}, {
      catalogProvider: () => store,
      search,
      shouldAutoResolve: () => false,
    });
    const row = store.repository.database.prepare('SELECT summary_json FROM scan_runs').get();
    return JSON.parse(row.summary_json).context;
  } finally {
    store.close();
  }
}

test('every scan run records its mode and who started it', async () => {
  const manual = await recordedContext({ queries: ['mort'], sources: ['Vinted'] });
  assert.equal(manual.mode, 'batch');
  assert.equal(manual.trigger, 'manual');
  const sniper = await recordedContext({
    queries: ['mort'],
    sources: ['Vinted'],
    mode: 'newest',
    trigger: 'sniper',
  });
  assert.equal(sniper.mode, 'newest');
  assert.equal(sniper.trigger, 'sniper');
  // An unknown trigger from the request body is not stored as given.
  const odd = await recordedContext({ queries: ['mort'], sources: ['Vinted'], trigger: 'x<y' });
  assert.equal(odd.trigger, 'manual');
});

test('the scheduler names itself in the scan it starts', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    putScanProfile(repo, 'Fantasy', { queries: ['Warcraft'], sources: ['Vinted'] });
    saveScanSchedule(repo, {
      enabled: true,
      profile: 'Fantasy',
      everyHours: 12,
      quick: { enabled: true, everyHours: 2 },
    });
    saveSniper(repo, { enabled: true, everyMinutes: 15 });
    let clock = Date.parse('2026-11-10T12:00:00Z');
    const calls = [];
    const scheduler = createScanScheduler({
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => [{ phrase: 'Mort' }],
      getBoostTargets: () => [],
      now: () => clock,
    });
    await scheduler.tick(); // the full scan is due first
    clock += 3 * 3_600_000;
    await scheduler.tick(); // then the quick one
    clock += 3_600_000;
    await scheduler.tick(); // then the sniper
    assert.deepEqual(
      calls.map((call) => [call.trigger, call.mode ?? null]),
      [
        ['schedule', null],
        ['quick', 'newest'],
        ['sniper', 'newest'],
      ],
    );
  } finally {
    repo.close?.();
  }
});

test('marking deal alerts seen keeps the availability the offer had at that moment', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    for (const [id, availability] of [
      ['a', 'available'],
      ['b', 'sold'],
    ])
      repo.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: id,
        currentPrice: 1000,
        availability,
        firstSeenAt: '2026-11-22T08:00:00.000Z',
      });
    const insert = repo.database.prepare(
      `INSERT INTO deal_alerts(offer_id, price, worth, saving, chance, alerted_at)
       VALUES (?,1000,2000,1000,0.5,'2026-11-22T08:30:00.000Z')`,
    );
    insert.run('a');
    insert.run('b');
    const items = markDealAlertsSeen(repo, { at: Date.parse('2026-11-22T10:00:00Z') }).items;
    assert.ok(items.every((item) => item.seen));
    const rows = repo.database
      .prepare('SELECT offer_id, seen_availability FROM deal_alerts ORDER BY offer_id')
      .all()
      .map((row) => [row.offer_id, row.seen_availability]);
    assert.deepEqual(rows, [
      ['a', 'available'],
      ['b', 'sold'],
    ]);
    // A later call does not rewrite an alert already seen.
    repo.database.prepare("UPDATE offers SET availability='sold' WHERE id='a'").run();
    markDealAlertsSeen(repo);
    assert.equal(
      repo.database
        .prepare("SELECT seen_availability AS s FROM deal_alerts WHERE offer_id='a'")
        .get().s,
      'available',
    );
  } finally {
    repo.close?.();
  }
});
