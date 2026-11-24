import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductionCatalog } from '../catalog-production.mjs';
import { searchOffers } from '../scan-engine.mjs';
import { persistSqliteScan } from '../sqlite-single-store.mjs';

const offer = (n) => ({
  url: `https://www.vinted.pl/items/${n}-mort`,
  title: `Mort ${n}`,
  price: 2000,
  language: 'Polski',
});
const scan = (scanner) =>
  searchOffers(
    { queries: ['mort'], sources: ['Vinted'], polishOnly: false },
    { scanner, retryWait: async () => {} },
  );

test('a source that repeats the same page while announcing a next one is read twice, not fifty times', async () => {
  for (const withDigest of [true, false]) {
    let calls = 0;
    const result = await scan(async (task) => {
      calls++;
      return {
        offers: [offer(1), offer(2)],
        rejected: {},
        pagination: {
          state: 'more',
          nextPage: task.page + 1,
          ...(withDigest ? { digest: 'same' } : {}),
        },
      };
    });
    assert.equal(calls, 2);
    assert.equal(result.offers.length, 2);
    const row = result.results[0];
    assert.equal(row.status, 'partial');
    assert.equal(row.diagnostic.code, 'PAGINATION_LOOP');
    assert.equal(row.diagnostic.blocked, false);
    assert.equal(row.pagination.state, 'partial');
  }
});

test('different pages are read to the last one as before', async () => {
  let calls = 0;
  const result = await scan(async (task) => {
    calls++;
    return {
      offers: [offer(task.page)],
      rejected: {},
      pagination: {
        state: task.page < 3 ? 'more' : 'end',
        nextPage: task.page < 3 ? task.page + 1 : null,
        digest: `page-${task.page}`,
      },
    };
  });
  assert.equal(calls, 3);
  assert.equal(result.offers.length, 3);
  assert.equal(result.results[0].status, 'ok');
  assert.equal(result.results[0].pagination.state, 'end');
});

test('pages filtered down to nothing are not mistaken for a repeated page', async () => {
  let calls = 0;
  const result = await scan(async (task) => {
    calls += 1;
    const last = task.page >= 4;
    return {
      offers: last ? [offer(1)] : [],
      rejected: {},
      // The same digest on every empty page: the hash of an empty offer list.
      pagination: last
        ? { state: 'end', digest: 'last' }
        : { state: 'more', nextPage: task.page + 1, digest: 'empty-list' },
    };
  });
  assert.equal(calls, 4);
  assert.equal(result.offers.length, 1);
  assert.equal(result.results[0].status, 'ok');
  assert.equal(result.results[0].pagination.state, 'end');
});

test('a repeated page does not mark saved offers as gone', async () => {
  const store = createProductionCatalog({
    databasePath: ':memory:',
    fetcher: async () => assert.fail('no network'),
  });
  try {
    const db = store.repository.database;
    persistSqliteScan(store, {
      offers: [{ ...offer(9), source: 'Vinted', matchedQueries: ['mort'] }],
      searchedAt: '2026-11-01T10:00:00.000Z',
    });
    const result = await scan(async (task) => ({
      offers: [offer(1)],
      rejected: {},
      pagination: { state: 'more', nextPage: task.page + 1, digest: 'same' },
    }));
    persistSqliteScan(store, {
      offers: result.offers,
      searchedAt: '2026-11-02T10:00:00.000Z',
      scanContext: { results: result.results },
    });
    // The scan stopped at the repeat: it is partial and says why, so it can never count as complete.
    assert.equal(result.results[0].pagination.state, 'partial');
    assert.equal(result.results[0].diagnostic.code, 'PAGINATION_LOOP');
    const gone = db
      .prepare("SELECT count(*) AS n FROM offers WHERE availability='not_seen'")
      .get().n;
    assert.equal(gone, 0);
  } finally {
    store.close();
  }
});
