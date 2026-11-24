import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import {
  createScanScheduler,
  getScanSchedule,
  saveSniper,
  SNIPER_BATCH,
} from '../scan-schedule.mjs';
import { setPhraseDisabled } from '../phrase-stats.mjs';
import {
  catalogPhrases,
  readStream,
  sniperStream,
  STREAM_DEADLINE_MS,
  STREAM_EVERY_MS,
  STREAM_MAX_PAGES,
  STREAM_SLOTS,
  streamPageUrl,
  streamPhrases,
  vintedStreamPage,
} from '../vinted-stream.mjs';

const listing = (id, title) => ({ url: `https://www.vinted.pl/items/${id}-x`, title });

test('the first reading takes one page; later ones read until a page is mostly known', async () => {
  const asked = [];
  const pages = {
    1: [listing(30, 'a'), listing(29, 'b')],
    2: [listing(28, 'c'), listing(27, 'd')],
    3: [listing(26, 'e'), listing(25, 'f')],
  };
  const readPage = async (page) => (asked.push(page), pages[page] ?? []);
  const first = await readStream(readPage);
  assert.deepEqual(asked, [1]);
  assert.deepEqual(
    first.listings.map((row) => row.id),
    [30, 29],
  );
  assert.deepEqual(first.seen, [30, 29]);
  // Nothing on page 1 or 2 was seen: read on; page 3 holds a remembered id (half): stop there.
  asked.length = 0;
  const later = await readStream(readPage, { seen: [26, 1] });
  assert.deepEqual(asked, [1, 2, 3]);
  assert.deepEqual(
    later.listings.map((row) => row.id),
    [30, 29, 28, 27, 25],
  );
  assert.equal(later.caughtUp, true);
  // Never more than the page cap, and an empty page ends the reading.
  asked.length = 0;
  const capped = await readStream(async (page) => (asked.push(page), [listing(100 + page, 'x')]), {
    seen: [1],
  });
  assert.equal(asked.length, STREAM_MAX_PAGES);
  assert.equal(capped.caughtUp, false);
  asked.length = 0;
  await readStream(async (page) => (asked.push(page), []), { seen: [1] });
  assert.deepEqual(asked, [1]);
});

test('a listing picks the most specific catalogue phrase whose every word is in its title', () => {
  const phrases = [
    { phrase: 'Smoki', words: ['smoki'] },
    { phrase: 'Smoki jesiennego zmierzchu', words: ['smoki', 'jesiennego', 'zmierzchu'] },
    { phrase: 'Mort Pratchett', words: ['mort', 'pratchett'] },
  ];
  const listings = [
    { title: 'Weis Hickman SMOKI JESIENNEGO ZMIERZCHU Zysk 1997' },
    { title: 'Mort - Terry Pratchett, stan dobry' },
    { title: 'Smoki jesiennego zmierzchu twarda' },
    { title: 'Mort i inne' },
    { title: 'Kuchnia polska' },
  ];
  assert.deepEqual(streamPhrases(listings, phrases), [
    'Smoki jesiennego zmierzchu',
    'Mort Pratchett',
  ]);
});

test('catalogue phrases leave out removed works and works without an edition', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.createWork({ id: 'a', title: 'Smoki jesiennego zmierzchu', authors: ['Weis, Margaret'] });
    repo.createEditionForISBN({
      workId: 'a',
      isbn: '9788375780307',
      title: 'Smoki jesiennego zmierzchu',
    });
    repo.createWork({ id: 'b', title: 'Mort', authors: ['Terry Pratchett'] });
    repo.createEditionForISBN({ workId: 'b', isbn: '9788373196032', title: 'Mort' });
    repo.createWork({ id: 'c', title: 'Bez wydania', authors: [] });
    repo.createWork({ id: 'd', title: 'Usunięta', authors: [] });
    repo.createEditionForISBN({ workId: 'd', isbn: '9788324031511', title: 'Usunięta' });
    repo.database
      .prepare('INSERT INTO removed_works(work_id, title, removed_at) VALUES (?,?,?)')
      .run('d', 'Usunięta', '2026-11-20T00:00:00Z');
    assert.deepEqual(
      catalogPhrases(repo).map((row) => row.phrase),
      ['Smoki jesiennego zmierzchu', 'Mort Pratchett'],
    );
  } finally {
    repo.close();
  }
});

test('the sniper stream remembers what it saw between runs', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.createWork({ id: 'b', title: 'Mort', authors: ['Terry Pratchett'] });
    repo.createEditionForISBN({ workId: 'b', isbn: '9788373196032', title: 'Mort' });
    let page1 = [listing(2, 'Mort Pratchett'), listing(1, 'Kuchnia')];
    const first = await sniperStream(repo, async () => page1);
    assert.deepEqual(first.phrases, ['Mort Pratchett']);
    assert.equal(first.listings, 2);
    // Same page again: nothing new, nothing to ask.
    const again = await sniperStream(repo, async () => page1);
    assert.deepEqual([again.phrases, again.listings], [[], 0]);
    page1 = [
      listing(3, 'Mort Terry Pratchett'),
      listing(2, 'Mort Pratchett'),
      listing(1, 'Kuchnia'),
    ];
    assert.deepEqual((await sniperStream(repo, async () => page1)).phrases, ['Mort Pratchett']);
    // Universe phrases given as extra are picked too; a work's own phrase still wins over them.
    page1 = [
      listing(5, 'Warhammer 40k Duchy Ognia'),
      listing(4, 'Mort Pratchett Warhammer'),
      ...page1,
    ];
    assert.deepEqual(
      (await sniperStream(repo, async () => page1, { extra: ['Warhammer', 'Mort Pratchett'] }))
        .phrases,
      ['Warhammer', 'Mort Pratchett'],
    );
  } finally {
    repo.close();
  }
});

test('a stream page is read through the given reader at the category URL, newest first', async () => {
  const urls = [];
  const html = JSON.parse(
    readFileSync(
      new URL('../fixtures/marketplaces/vinted-search-captured.json', import.meta.url),
      'utf8',
    ),
  ).html;
  const rows = await vintedStreamPage(2, {
    read: async (url, options) => (urls.push([url, options.source]), html),
  });
  assert.deepEqual(urls, [[streamPageUrl(2), 'Vinted']]);
  assert.equal(
    streamPageUrl(2),
    'https://www.vinted.pl/catalog/2312-books?order=newest_first&page=2',
  );
  assert.equal(streamPageUrl(1).includes('page='), false);
  // Every card is kept (no phrase filter here), with its URL and the seller's title.
  assert.deepEqual(
    rows.map((row) => row.url),
    [
      'https://www.vinted.pl/items/9000000001-kolor-magii-terry-pratchett',
      'https://www.vinted.pl/items/9000000002-faust-erik-terry-pratchett',
      'https://www.vinted.pl/items/9000000003-wyprawa-czarownic-swiat-dysku-12-terry-pratchett',
    ],
  );
  assert.ok(rows.every((row) => row.title.length > 0));
});

function setup(readStream, extra = {}) {
  const repo = new SqliteCatalogRepository(':memory:');
  saveSniper(repo, { enabled: true, everyMinutes: 20 });
  const calls = [];
  const state = { clock: Date.parse('2026-11-23T12:00:00Z'), status: 200 };
  const scheduler = createScanScheduler({
    getRepository: () => repo,
    runScan: async (input) => (calls.push(input), state.status),
    getTargets: () => Array.from({ length: 14 }, (_, i) => ({ phrase: `Tytuł ${i}` })),
    getBoostTargets: () => [],
    getPriorityPhrases: () => [],
    getYieldTargets: () => [],
    getIsbnTargets: () => [],
    readStream,
    now: () => state.clock,
    ...extra,
  });
  return { repo, calls, state, tick: () => scheduler.tick() };
}

test('between sniper runs the stream is read every 5 minutes; only new catalogue works are scanned', async () => {
  let reply = { phrases: ['Mort Pratchett', 'Smoki', 'Legion'], listings: 40, pages: 1 };
  const { repo, calls, state, tick } = setup(async () => reply);
  try {
    setPhraseDisabled(repo, 'Smoki', true);
    // First tick: the sniper itself is due (its batch has no stream phrases any more).
    await tick();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].queries.length, SNIPER_BATCH);
    // Next tick: the stream is due; a newest scan of just its phrases (switched-off ones stay off).
    const result = await tick();
    assert.equal(result.stream, true);
    assert.deepEqual(calls[1], {
      queries: ['Mort Pratchett', 'Legion'],
      sources: ['Vinted'],
      mode: 'newest',
      trigger: 'sniper',
    });
    const last = getScanSchedule(repo).sniper.lastStream;
    assert.deepEqual(
      [last.listings, last.phrases, last.result],
      [40, ['Mort Pratchett', 'Legion'], 'ok'],
    );
    // Not due again within 5 minutes; nothing new means no scan at all.
    assert.equal((await tick()).skipped, 'not-due');
    state.clock += STREAM_EVERY_MS;
    reply = { phrases: [], listings: 12, pages: 1 };
    assert.equal((await tick()).result, 'nothing-new');
    assert.equal(calls.length, 2);
    // Never more than STREAM_SLOTS phrases in one stream scan.
    state.clock += STREAM_EVERY_MS;
    reply = { phrases: Array.from({ length: 9 }, (_, i) => `Dzieło ${i}`), listings: 90, pages: 1 };
    await tick();
    assert.equal(calls[2].queries.length, STREAM_SLOTS);
  } finally {
    repo.close();
  }
});

test('no stream reader (BOOKFLIP_SNIPER_STREAM=0): only the sniper runs', async () => {
  const { repo, calls, tick } = setup(null);
  try {
    await tick();
    assert.equal((await tick()).skipped, 'not-due');
    assert.equal(calls.length, 1);
    assert.equal(getScanSchedule(repo).sniper.lastStream, null);
  } finally {
    repo.close();
  }
});

test('a refused stream (429) is source-down, a broken one an error; no scan either way', async () => {
  const refused = setup(async () => {
    throw Object.assign(Error('SOURCE_HTTP_429'), { status: 429 });
  });
  const broken = setup(async () => {
    throw Error('VINTED_PAGE_NOT_MATCHED');
  });
  try {
    for (const { tick } of [refused, broken]) {
      await tick();
      await tick();
    }
    assert.equal(refused.calls.length, 1);
    assert.equal(broken.calls.length, 1);
    assert.equal(getScanSchedule(refused.repo).sniper.lastStream.result, 'source-down');
    assert.match(getScanSchedule(refused.repo).sniper.lastStream.error, /429/);
    assert.equal(getScanSchedule(broken.repo).sniper.lastStream.result, 'error');
  } finally {
    refused.repo.close();
    broken.repo.close();
  }
});

test('the stream gets an abort signal and a reading that never ends does not hold the scheduler', async (t) => {
  let given = null;
  const { repo, tick } = setup(async (_repo, { signal }) => {
    given = signal;
    return new Promise(() => {});
  });
  try {
    await tick();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const run = tick();
    await Promise.resolve();
    t.mock.timers.tick(STREAM_DEADLINE_MS + 1000);
    await run;
    assert.ok(given instanceof AbortSignal);
    assert.match(getScanSchedule(repo).sniper.lastStream.error, /STREAM_TIMEOUT/);
    assert.equal((await tick()).skipped, 'not-due');
  } finally {
    repo.close();
  }
});

test('a one-word work phrase is too generic for the stream', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.createWork({ id: 'f', title: 'Fantasy', authors: [] });
    repo.createEditionForISBN({ workId: 'f', isbn: '9788375780307', title: 'Fantasy' });
    repo.createWork({ id: 'm', title: 'Mort', authors: ['Terry Pratchett'] });
    repo.createEditionForISBN({ workId: 'm', isbn: '9788373196032', title: 'Mort' });
    assert.deepEqual(
      catalogPhrases(repo).map((row) => row.phrase),
      ['Mort Pratchett'],
    );
  } finally {
    repo.close();
  }
});
