import test from 'node:test';
import assert from 'node:assert/strict';
import { searchOffers } from '../scan-engine.mjs';

const forbidden = () =>
  Object.assign(Error('SOURCE_HTTP_403'), { status: 403, blocked: false, retryable: true });
const okPage = { offers: [], pagination: { state: 'last' }, rejected: {} };
const run = (scanner, queries = ['a', 'b', 'c']) =>
  searchOffers({ queries, sources: ['Vinted'] }, { scanner, retryWait: async () => {} });

test('two 403 in a row block the source and later phrases do not ask it', async () => {
  let calls = 0;
  const result = await run(async () => {
    calls++;
    throw forbidden();
  });
  assert.equal(calls, 2);
  const diagnostics = result.results?.map((row) => row.diagnostic) ?? [];
  assert.equal(diagnostics.length, 3);
  assert.ok(diagnostics.every((d) => d.blocked === true && d.code === 'SOURCE_HTTP_403'));
  assert.equal(diagnostics.filter((d) => d.skipped).length, 2);
});

test('a 403 followed by a 200 does not block the source', async () => {
  let calls = 0;
  const result = await run(async () => {
    calls++;
    if (calls === 1) throw forbidden();
    return okPage;
  });
  assert.equal(calls, 4);
  assert.ok(result.results.every((row) => row.status === 'ok' && !row.diagnostic));
});

test('429 keeps retrying up to the limit and does not block', async () => {
  let calls = 0;
  const result = await run(async () => {
    calls++;
    throw Object.assign(Error('SOURCE_HTTP_429'), { status: 429, retryable: true });
  }, ['a']);
  assert.equal(calls, 3);
  assert.equal(result.results[0].diagnostic.blocked, false);
});

test('CAPTCHA blocks at once, as before', async () => {
  let calls = 0;
  const result = await run(async () => {
    calls++;
    throw Object.assign(Error('SOURCE_CAPTCHA'), { status: 403, blocked: true });
  });
  assert.equal(calls, 1);
  assert.ok(result.results.every((row) => row.diagnostic.blocked === true));
});

const offerOn = (page) => ({ url: `https://example.test/o/${page}`, title: `Book ${page}` });
const status = (code) =>
  Object.assign(Error(`SOURCE_HTTP_${code}`), { status: code, retryable: true });

test('a category source answering 403 twice stops after exactly two scanner calls', async () => {
  const tasks = [];
  const result = await searchOffers(
    { queries: ['a', 'b'], sources: ['Antykwariat NWS'] },
    {
      scanner: async (task) => {
        tasks.push(task);
        throw forbidden();
      },
      retryWait: async () => {},
    },
  );
  // Two categories are listed for this shop: the second one is never asked.
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((task) => task.mode === 'category'));
  assert.equal(new Set(tasks.map((task) => task.categoryUrl)).size, 1);
  assert.equal(result.results.length, 2);
  assert.ok(
    result.results.every((row) => row.status === 'unavailable' && row.diagnostic.blocked === true),
  );
});

test('a 403 on page 2 after a good page 1 is retried once and success resets the count', async () => {
  const pages = [];
  const result = await searchOffers(
    { queries: ['a'], sources: ['Vinted'], polishOnly: false },
    {
      scanner: async (task) => {
        pages.push(task.page);
        if (task.page === 1)
          return { offers: [offerOn(1)], pagination: { state: 'more', nextPage: 2 }, rejected: {} };
        if (pages.filter((page) => page === 2).length === 1) throw forbidden();
        if (task.page === 2)
          return { offers: [offerOn(2)], pagination: { state: 'more', nextPage: 3 }, rejected: {} };
        if (pages.filter((page) => page === 3).length === 1) throw forbidden();
        return { offers: [offerOn(3)], pagination: { state: 'last' }, rejected: {} };
      },
      retryWait: async () => {},
    },
  );
  // Page 2 fails once, then passes (reset); page 3 fails once more and still must be retried.
  assert.deepEqual(pages, [1, 2, 2, 3, 3]);
  assert.equal(result.results[0].status, 'ok');
  assert.equal(result.results[0].count, 3);
});

test('two 403 in a row on page 2 stop the source and keep page 1 offers', async () => {
  const pages = [];
  const result = await searchOffers(
    { queries: ['a', 'b'], sources: ['Vinted'], polishOnly: false },
    {
      scanner: async (task) => {
        pages.push(task.page);
        if (task.page === 1)
          return { offers: [offerOn(1)], pagination: { state: 'more', nextPage: 2 }, rejected: {} };
        throw forbidden();
      },
      retryWait: async () => {},
    },
  );
  // Page 1, then two failed asks of page 2; the next phrase never reaches the scanner.
  assert.deepEqual(pages, [1, 2, 2]);
  const [first, second] = result.results;
  assert.equal(first.status, 'partial');
  assert.equal(first.count, 1);
  assert.equal(first.diagnostic.blocked, true);
  assert.equal(second.status, 'unavailable');
  assert.equal(second.diagnostic.blocked, true);
});

test('403 counts are kept per source when two sources run in parallel', async () => {
  const calls = { Vinted: 0, Empik: 0 };
  const result = await searchOffers(
    { queries: ['a', 'b', 'c'], sources: ['Vinted', 'Empik'] },
    {
      scanner: async (task) => {
        calls[task.source]++;
        if (task.source === 'Vinted') throw forbidden();
        return okPage;
      },
      retryWait: async () => {},
    },
  );
  assert.equal(calls.Vinted, 2);
  assert.equal(calls.Empik, 3);
  for (const row of result.results.filter((r) => r.source === 'Empik'))
    assert.equal(row.status, 'ok');
  for (const row of result.results.filter((r) => r.source === 'Vinted'))
    assert.equal(row.diagnostic.blocked, true);
});

test('one 403 per source at the same time does not block either of them', async () => {
  const calls = { Vinted: 0, Empik: 0 };
  const result = await searchOffers(
    { queries: ['a', 'b', 'c'], sources: ['Vinted', 'Empik'] },
    {
      scanner: async (task) => {
        if (++calls[task.source] === 1) throw forbidden();
        return okPage;
      },
      retryWait: async () => {},
    },
  );
  // First phrase: 403 then retry; two more phrases: one call each.
  assert.equal(calls.Vinted, 4);
  assert.equal(calls.Empik, 4);
  assert.ok(result.results.every((row) => row.status === 'ok'));
});

test('a different error between two 403 resets the count: the source is not blocked', async () => {
  let calls = 0;
  const result = await run(async () => {
    calls++;
    if (calls === 1 || calls === 3) throw forbidden();
    if (calls === 2) throw status(500);
    return okPage;
  }, ['a', 'b']);
  // Phrase a: 403, 500, 403 (retry limit reached). Phrase b is still asked and succeeds.
  assert.equal(calls, 4);
  const [first, second] = result.results;
  assert.equal(first.status, 'unavailable');
  assert.equal(first.diagnostic.httpStatus, 403);
  assert.equal(first.diagnostic.blocked, false);
  assert.equal(second.status, 'ok');
});
