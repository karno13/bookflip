import assert from 'node:assert/strict';
import test from 'node:test';

import { searchUrl } from '../marketplaces.mjs';
import { createProductionCatalog } from '../catalog-production.mjs';
import {
  searchAndStore,
  searchOffers,
  validateSearchInput,
  VINTED_BAND_PAGES_PER_SCAN,
} from '../scan-engine.mjs';

const offer = (n, price = 2000) => ({
  url: `https://www.vinted.pl/items/${n}-warcraft`,
  title: `Warcraft ${n}`,
  price,
  language: 'Polski',
});
const scan = (scanner) =>
  searchOffers(
    { queries: ['warcraft'], sources: ['Vinted'], polishOnly: false },
    { scanner, retryWait: async () => {} },
  );
// A fake Vinted: every query is cut at 10 pages; a price band has fewer results.
const fakeVinted = (bandPages, calls) => async (task) => {
  const banded = task.priceFrom !== undefined || task.priceTo !== undefined;
  calls.push({ page: task.page, from: task.priceFrom, to: task.priceTo });
  const total = banded ? bandPages : 10;
  const id = (banded ? 1000 * ((task.priceFrom ?? 0) + 1) : 0) + task.page;
  return {
    offers: [offer(id)],
    rejected: {},
    pagination: {
      state: task.page < total ? 'more' : 'end',
      nextPage: task.page < total ? task.page + 1 : null,
      digest: `d-${id}`,
      totalPages: total,
    },
  };
};

test('the search address carries a price band only when asked', () => {
  const task = { source: 'Vinted', host: 'www.vinted.pl', searchQuery: 'Warcraft', page: 1 };
  assert.equal(new URL(searchUrl(task)).searchParams.has('price_to'), false);
  const url = new URL(searchUrl({ ...task, priceFrom: 15, priceTo: 30 }));
  assert.equal(url.searchParams.get('price_from'), '15');
  assert.equal(url.searchParams.get('price_to'), '30');
  assert.throws(() => searchUrl({ ...task, priceTo: -1 }), /INVALID_VINTED_PRICE/);
});

test('a phrase that reaches the 10-page depth is read again in price bands', async () => {
  const calls = [];
  const result = await scan(fakeVinted(2, calls));
  const banded = calls.filter((c) => c.from !== undefined || c.to !== undefined);
  assert.equal(calls.length - banded.length, 10);
  assert.equal(banded.length, 8); // 4 bands x 2 pages
  assert.equal(result.offers.length, 10 + 8);
  assert.equal(result.results[0].pagination.state, 'end');
});

test('a phrase below the cap is read once, without bands', async () => {
  const calls = [];
  const result = await scan(async (task) => {
    calls.push(task);
    return {
      offers: [offer(1)],
      rejected: {},
      pagination: { state: 'end', digest: 'x', totalPages: 3 },
    };
  });
  assert.equal(calls.length, 1);
  assert.equal(result.results[0].pagination.state, 'end');
});

test('extra pages are capped per scan and a partly read phrase is never "end"', async () => {
  const calls = [];
  const result = await scan(fakeVinted(10, calls)); // every band capped too
  const banded = calls.filter((c) => c.from !== undefined || c.to !== undefined);
  assert.ok(banded.length <= VINTED_BAND_PAGES_PER_SCAN);
  assert.equal(banded.length, VINTED_BAND_PAGES_PER_SCAN);
  assert.equal(result.results[0].pagination.state, 'limit');
});

test('a quick scan (newest) does not split into bands', async () => {
  const calls = [];
  await searchOffers(
    { queries: ['warcraft'], sources: ['Vinted'], polishOnly: false, mode: 'newest' },
    { scanner: fakeVinted(2, calls), retryWait: async () => {} },
  );
  assert.equal(calls.length, 1);
});

// Bands: up to 15, 15-30, 30-60, from 60. `shape` says how many pages each has (10 = capped too).
const bandShape = (shape, calls) => async (task) => {
  const banded = task.priceFrom !== undefined || task.priceTo !== undefined;
  calls.push({ page: task.page, from: task.priceFrom, to: task.priceTo });
  const key = task.priceFrom === undefined ? 'low' : String(task.priceFrom);
  const total = banded ? shape[key] : 10;
  if (shape.broken === key) throw Error('BAD_PAGE');
  const id = (banded ? 1000 * ((task.priceFrom ?? 0) + 1) : 0) + task.page;
  return {
    offers: [offer(id)],
    rejected: {},
    pagination: {
      state: task.page < total ? 'more' : 'end',
      nextPage: task.page < total ? task.page + 1 : null,
      digest: `d-${id}`,
      totalPages: total,
    },
  };
};

test('three bands read whole and one capped band leave the phrase "limit"', async () => {
  const calls = [];
  const result = await scan(bandShape({ low: 2, 15: 2, 30: 2, 60: 10 }, calls));
  assert.equal(result.results[0].pagination.state, 'limit');
  assert.ok(result.offers.length > 18, 'the offers of every band are still kept');
});

test('a band that fails keeps the other bands and the phrase is not "end"', async () => {
  const calls = [];
  const result = await scan(bandShape({ low: 2, 15: 2, 30: 2, 60: 2, broken: '30' }, calls));
  const row = result.results[0];
  assert.notEqual(row.pagination.state, 'end');
  assert.notEqual(row.status, 'ok');
  assert.ok(row.diagnostic);
  assert.ok(
    result.offers.length >= 10 + 2 + 2,
    'the first read and the bands read before the failure',
  );
});

test('a phrase cut at the depth cap never marks offers not_seen in the store', async () => {
  const store = createProductionCatalog({
    databasePath: ':memory:',
    fetcher: async () => assert.fail('no network'),
  });
  try {
    const run = async (scanner) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await searchAndStore(
        validateSearchInput({ queries: ['warcraft'], sources: ['Vinted'], polishOnly: false }),
        () => {},
        {
          catalogProvider: () => store,
          search: (input, options) =>
            searchOffers(input, {
              ...options,
              scanner,
              languageReader: async () => ({ language: 'Polski' }),
              retryWait: async () => {},
            }),
          shouldAutoResolve: () => false,
        },
      );
    };
    const availability = () =>
      Object.fromEntries(
        store.repository.database
          .prepare(
            "SELECT original_title AS t, availability AS a FROM offers WHERE source='Vinted'",
          )
          .all()
          .map((r) => [r.t, r.a]),
      );
    const only = (urls) => async () => ({
      offers: urls.map((n) => offer(n)),
      rejected: {},
      pagination: { state: 'end', digest: 'x', totalPages: 1 },
    });
    await run(only([1, 2]));
    assert.deepEqual(availability(), { 'Warcraft 1': 'unconfirmed', 'Warcraft 2': 'unconfirmed' });
    // Offer 2 is not in the cut-off read, and the bands (all capped) do not reach it either.
    const calls = [];
    await run(async (task) => {
      const base = await fakeVinted(10, calls)(task);
      return { ...base, offers: [offer(1)] };
    });
    assert.equal(availability()['Warcraft 2'], 'unconfirmed');
    // Control: a read that really ended does mark it.
    await run(only([1]));
    assert.equal(availability()['Warcraft 2'], 'not_seen');
  } finally {
    store.close();
  }
});

test('the band budget rotates over capped phrases; those waiting get "limit"', async () => {
  const phrases = ['alfa', 'beta', 'gamma'];
  const bandTurns = new Map();
  const banded = [];
  for (let round = 0; round < 4; round++) {
    const perPhrase = {};
    const result = await searchOffers(
      { queries: phrases, sources: ['Vinted'], polishOnly: false },
      {
        scanner: async (task) => {
          const isBand = task.priceFrom !== undefined || task.priceTo !== undefined;
          if (isBand) perPhrase[task.searchQuery] = (perPhrase[task.searchQuery] || 0) + 1;
          return fakeVinted(10, [])(task);
        },
        retryWait: async () => {},
        bandTurns,
      },
    );
    const used = Object.values(perPhrase).reduce((a, b) => a + b, 0);
    assert.ok(used <= VINTED_BAND_PAGES_PER_SCAN, 'budget never exceeded');
    assert.equal(Object.keys(perPhrase).length, 1, 'one phrase gets the whole budget');
    banded.push(Object.keys(perPhrase)[0]);
    const waiting = result.results.filter((row) => !perPhrase[row.query]);
    assert.equal(waiting.length, 2);
    for (const row of waiting) assert.equal(row.pagination.state, 'limit');
  }
  // Round 1 order follows the input; afterwards the longest-waiting phrase is first.
  assert.deepEqual(banded, ['alfa', 'beta', 'gamma', 'alfa']);
});

test('a phrase that is no longer capped leaves the rotation', async () => {
  const bandTurns = new Map([['alfa', 0]]);
  await searchOffers(
    { queries: ['alfa'], sources: ['Vinted'], polishOnly: false },
    {
      scanner: async () => ({
        offers: [offer(1)],
        rejected: {},
        pagination: { state: 'end', digest: 'x', totalPages: 2 },
      }),
      retryWait: async () => {},
      bandTurns,
    },
  );
  assert.equal(bandTurns.size, 0);
});
