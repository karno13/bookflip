import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import {
  createScanScheduler,
  getScanSchedule,
  saveSniper,
  SNIPER_BATCH,
} from '../scan-schedule.mjs';
import { setPhraseDisabled } from '../phrase-stats.mjs';
import { yieldTargets } from '../phrase-yield.mjs';

const targets = Array.from({ length: 14 }, (_, i) => ({ phrase: `Tytuł ${i}` }));
const yields = ['Pratchett', 'Weis', 'Salvatore'].map((phrase) => ({ phrase }));

function setup(extra = {}) {
  const repo = new SqliteCatalogRepository(':memory:');
  saveSniper(repo, { enabled: true, everyMinutes: 20 });
  const calls = [];
  const state = { clock: Date.parse('2026-11-22T12:00:00Z'), status: 200 };
  const scheduler = createScanScheduler({
    getRepository: () => repo,
    runScan: async (input) => (calls.push(input), state.status),
    getTargets: () => targets,
    getBoostTargets: () => [],
    getPriorityPhrases: () => [],
    getYieldTargets: () => yields,
    now: () => state.clock,
    ...extra,
  });
  const next = async () => {
    const result = await scheduler.tick();
    state.clock += 20 * 60_000;
    return result;
  };
  return { repo, calls, state, next };
}

test('two yield slots rotate through the best phrases and the batch size stays', async () => {
  const { repo, calls, next } = setup();
  try {
    for (let run = 0; run < 3; run++) await next();
    assert.ok(calls.every((call) => call.queries.length === SNIPER_BATCH));
    assert.deepEqual(
      calls.map((call) => call.queries.slice(-2)),
      [
        ['Pratchett', 'Weis'],
        ['Salvatore', 'Pratchett'],
        ['Weis', 'Salvatore'],
      ],
    );
    for (const call of calls) assert.equal(new Set(call.queries).size, call.queries.length);
  } finally {
    repo.close();
  }
});

test('a switched-off yield phrase stays off; a phrase already in the batch is not asked twice', async () => {
  const { repo, calls, next } = setup({
    getPriorityPhrases: () => ['Weis'],
    getTargets: () => [{ phrase: 'Pratchett' }, ...targets],
  });
  try {
    setPhraseDisabled(repo, 'Salvatore', true);
    await next();
    const queries = calls[0].queries;
    assert.equal(queries.length, SNIPER_BATCH);
    assert.equal(new Set(queries).size, queries.length);
    assert.ok(!queries.includes('Salvatore'));
    assert.equal(queries.filter((phrase) => phrase === 'Weis').length, 1);
    assert.equal(queries.filter((phrase) => phrase === 'Pratchett').length, 1);
  } finally {
    repo.close();
  }
});

test('a failed run keeps the yield cursor; no yield phrases leaves the regular batch', async () => {
  const { repo, state, next } = setup();
  try {
    state.status = 500;
    await next();
    assert.equal(getScanSchedule(repo).sniper.yieldCursor, 0);
    state.status = 200;
    await next();
    assert.equal(getScanSchedule(repo).sniper.yieldCursor, 2);
  } finally {
    repo.close();
  }
  const none = setup({ getYieldTargets: () => [] });
  try {
    await none.next();
    assert.deepEqual(
      none.calls[0].queries,
      targets.slice(0, SNIPER_BATCH).map((target) => target.phrase),
    );
  } finally {
    none.repo.close();
  }
});

test('yieldTargets needs saved evidence: no deals means no yield phrases', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.database
      .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
      .run(
        '2026-11-21T10:00:00.000Z',
        JSON.stringify({
          context: { results: [{ source: 'Vinted', query: 'Pratchett', pages: [{ page: 1 }] }] },
        }),
        '2026-11-21T10:00:00.000Z',
      );
    assert.deepEqual(yieldTargets(repo, { at: Date.parse('2026-11-22T00:00:00Z') }), []);
  } finally {
    repo.close();
  }
});

test('a failing yield ranking leaves the yield slots empty and the sniper still scans', async () => {
  let asked = 0;
  const { repo, calls, next } = setup({
    getYieldTargets: () => {
      asked++;
      throw new Error('no such table: deals');
    },
  });
  try {
    assert.equal((await next()).result, 'ok');
    assert.equal(calls[0].queries.length, SNIPER_BATCH);
    await next();
    assert.equal(asked, 1, 'the ranking is worked out at most once an hour');
  } finally {
    repo.close();
  }
});

test('yieldTargets ignores the first-ever run of a phrase: stock is not flow', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
    repo.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
    const add = (id, price, query, seen, availability = 'available') => {
      repo.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: 'Mort ' + id,
        currentPrice: price,
        conditionClass: 'good',
        availability,
      });
      repo.assignOfferToEdition(id, 'e', { id: 'm_' + id, method: 'manual', status: 'active' });
      repo.database.prepare('UPDATE offers SET first_seen_at=? WHERE id=?').run(seen, id);
      repo.database
        .prepare('INSERT INTO offer_queries(offer_id,query,position) VALUES (?,?,0)')
        .run(id, query);
    };
    const t1 = '2026-11-20T10:00:00.000Z';
    const t2 = '2026-11-21T10:00:00.000Z';
    add('s1', 4000, 'Zapas', t1, 'sold');
    add('s2', 4200, 'Zapas', t1, 'sold');
    add('a', 4400, 'Zapas', t1);
    add('b', 4500, 'Zapas', t1);
    add('stock', 2000, 'Zapas', t1);
    add('flow', 2100, 'Nowe', t2);
    const run = (at, queries) =>
      repo.database
        .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
        .run(
          at,
          JSON.stringify({
            context: {
              results: queries.map((query) => ({ source: 'Vinted', query, pages: [{ page: 1 }] })),
            },
          }),
          at,
        );
    run(t1, ['Zapas', 'Nowe']);
    run(t2, ['Zapas', 'Nowe']);
    const at = Date.parse('2026-11-22T00:00:00Z');
    assert.deepEqual(
      yieldTargets(repo, { at }).map((item) => item.phrase),
      ['Nowe'],
    );
  } finally {
    repo.close();
  }
});
