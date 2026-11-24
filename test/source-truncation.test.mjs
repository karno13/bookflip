import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarketplace } from '../marketplaces.mjs';
import { ANTIQUARIAN_SOURCES } from '../antiquarian-sources.mjs';
import { markUnseenOffers, repairEmptyCategoryNotSeen } from '../offer-availability.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const nws = (extra = {}) => ({
  source: 'Antykwariat NWS',
  host: ANTIQUARIAN_SOURCES['Antykwariat NWS'].host,
  mode: 'category',
  categoryUrl: ANTIQUARIAN_SOURCES['Antykwariat NWS'].categories[0],
  page: 1,
  language: 'pl',
  paginationVersion: 1,
  ...extra,
});
// The card layout the shop has served since 19.11.2026 (photo inside <picture>, no space in the price).
const card = (id, title, price) =>
  `<div class="product_boxnew"><div><div class="product_boxnew_photo"><a href="oferta-129-${id}-x.html" title="${title}"><picture><source srcset="zdjecie/min/${id}.webp" type="image/webp" /><img src="zdjecie/min/${id}.jpg" alt="${title}" /></picture></a></div><div class="nws-karta-dane"><div class="newprice_box"><center>${price}&nbsp;zł<br /></center></div></div></div></div>`;

test('NWS: the current card layout is read, and a layout nobody recognises is an error, not an empty page', () => {
  const rows = parseMarketplace(card(1, 'IMPERIUM &ndash; Piekara, Jacek', '12,00'), nws());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 1200);
  assert.equal(rows[0].externalOfferId, '1');
  const broken = '<div class="product_boxnew"><div class="whatever">no photo, no price</div></div>';
  assert.throws(() => parseMarketplace(broken, nws()), /UNRECOGNIZED_MARKETPLACE_DATA/);
});

test('NWS: a page of only sold cards without price or photo is recognised, not an error', () => {
  const sold =
    '<div class="product_boxnew"><div><a href="oferta-129-7-x.html" title="Sprzedana">Sprzedana</a></div></div>';
  assert.deepEqual(parseMarketplace(sold, nws()), []);
});

test('the repair returns bookshop offers marked gone by an empty read, not those a real read vouched for', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  const T1 = '2026-11-01T10:00:00.000Z',
    T2 = '2026-11-05T10:00:00.000Z';
  const add = (n, source) =>
    repo.upsertOffer({
      source,
      normalizedUrl: `https://shop.example/${n}`,
      originalTitle: 'T' + n,
      currentPrice: 1000,
      matchedQueries: ['Weis'],
      availability: 'unconfirmed',
      firstSeenAt: T1,
      lastSeenAt: T1,
      at: T1,
    });
  const status = (n) =>
    repo.database
      .prepare('SELECT availability FROM offers WHERE normalized_url=?')
      .get(`https://shop.example/${n}`).availability;
  add(1, 'Antykwariat NWS'); // empty read marked it
  add(2, 'Skupszop.pl'); // not a category source: untouched
  const result = (source, count) => ({
    source,
    query: 'Weis',
    status: 'ok',
    pagination: { state: 'end' },
    pages: [
      { page: 1, count, state: 'more' },
      { page: 2, count: 0, state: 'end' },
    ],
  });
  const results = [result('Antykwariat NWS', 0), result('Skupszop.pl', 0)];
  repo.database
    .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
    .run(T2, JSON.stringify({ context: { results } }), T2);
  assert.equal(markUnseenOffers(repo.database, results, T2), 2);
  assert.deepEqual(repairEmptyCategoryNotSeen(repo), { restored: 1, checked: 1 });
  assert.deepEqual([status(1), status(2)], ['unconfirmed', 'not_seen']);
  // A read that did find offers is real evidence.
  add(3, 'Antykwariat NWS');
  const real = [result('Antykwariat NWS', 5)];
  repo.database
    .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
    .run('2026-11-06T10:00:00.000Z', JSON.stringify({ context: { results: real } }), T2);
  markUnseenOffers(repo.database, real, '2026-11-06T10:00:00.000Z');
  assert.equal(repairEmptyCategoryNotSeen(repo).restored, 0);
  assert.equal(status(3), 'not_seen');
});

test('a source that keeps offering pages never ends in "end" at our page cap', async () => {
  const { searchOffers } = await import('../scan-engine.mjs');
  let pages = 0;
  const scanner = async (task) => {
    pages++;
    return {
      offers: [],
      rejected: {},
      pagination: { state: 'more', nextPage: task.page + 1, digest: 'p' + task.page },
    };
  };
  const run = (source) =>
    searchOffers(
      { queries: ['mort'], sources: [source], polishOnly: false },
      { scanner, retryWait: async () => {} },
    );
  for (const source of ['Empik', 'Skupszop.pl', 'Antykwariat NWS']) {
    pages = 0;
    const { results } = await run(source);
    assert.ok(pages >= 50, source);
    // Search sources report "limit"; a bookshop category read, "partial": neither concludes anything.
    assert.notEqual(results[0].pagination.state, 'end', source);
    assert.ok(['limit', 'partial'].includes(results[0].pagination.state), source);
  }
});

// Safety net: a complete read whose card count collapsed does not conclude disappearances.
import { persistSqliteScan } from '../sqlite-single-store.mjs';
import { findSuspiciousDrops } from '../offer-availability.mjs';
import { createProductionCatalog } from '../catalog-production.mjs';

async function dropFixture() {
  const catalog = createProductionCatalog({ databasePath: ':memory:' });
  const read = (cards) => ({
    source: 'Sklep',
    query: 'Fraza',
    status: 'ok',
    pagination: { state: 'end' },
    pages: [{ page: 1, count: cards }],
    count: cards,
  });
  const scan = (at, cards, offers) =>
    persistSqliteScan(catalog, {
      offers,
      searchedAt: at,
      scanContext: { queries: ['Fraza'], sources: ['Sklep'], results: [read(cards)] },
    });
  const one = [
    {
      source: 'Sklep',
      url: 'https://sklep.example/a',
      title: 'A',
      price: 1000,
      matchedQueries: ['Fraza'],
    },
  ];
  return { catalog, scan, one };
}
const stateOf = (catalog) =>
  catalog.repository.database.prepare('SELECT availability FROM offers').get().availability;
const lastErrors = (catalog) =>
  JSON.parse(
    catalog.repository.database
      .prepare('SELECT summary_json FROM scan_runs ORDER BY scanned_at DESC LIMIT 1')
      .get().summary_json,
  ).errors;

test('drastic drop of a complete read marks nothing and reports a problem', async () => {
  const { catalog, scan, one } = await dropFixture();
  await scan('2026-11-10T10:00:00.000Z', 214, one);
  await scan('2026-11-11T10:00:00.000Z', 0, []);
  assert.equal(stateOf(catalog), 'unconfirmed');
  const [problem] = lastErrors(catalog);
  assert.equal(problem.source, 'Sklep');
  assert.match(problem.message, /0 zamiast 214/);
  // the break lasts: the flagged read is not a baseline, so the next empty read is still suspicious
  await scan('2026-11-12T10:00:00.000Z', 0, []);
  assert.equal(stateOf(catalog), 'unconfirmed');
  // a normal read decides again
  await scan('2026-11-13T10:00:00.000Z', 200, []);
  assert.equal(stateOf(catalog), 'not_seen');
});

test('normal variation and a first read conclude disappearances as before', async () => {
  const { catalog, scan, one } = await dropFixture();
  await scan('2026-11-10T10:00:00.000Z', 100, one);
  await scan('2026-11-11T10:00:00.000Z', 70, []);
  assert.equal(stateOf(catalog), 'not_seen');
  assert.deepEqual(lastErrors(catalog), []);
  const first = await dropFixture();
  await first.scan('2026-11-10T10:00:00.000Z', 100, first.one);
  assert.deepEqual(
    findSuspiciousDrops(first.catalog.repository.database, [], '2026-11-11T10:00:00.000Z'),
    [],
  );
  // a small baseline (under 10 cards) may legitimately shrink to nothing
  const small = await dropFixture();
  await small.scan('2026-11-10T10:00:00.000Z', 5, small.one);
  await small.scan('2026-11-11T10:00:00.000Z', 0, []);
  assert.equal(stateOf(small.catalog), 'not_seen');
});

test('a lasting shrink becomes the new baseline after 2 stable low reads; 0 cards never does', async () => {
  const { catalog, scan, one } = await dropFixture();
  await scan('2026-11-10T10:00:00.000Z', 400, one);
  await scan('2026-11-11T10:00:00.000Z', 60, []);
  assert.equal(stateOf(catalog), 'unconfirmed'); // one low read stays flagged
  assert.equal(lastErrors(catalog).length, 1);
  await scan('2026-11-12T10:00:00.000Z', 65, []);
  assert.equal(stateOf(catalog), 'not_seen'); // second stable low read is accepted
  assert.deepEqual(lastErrors(catalog), []);
  const zero = await dropFixture();
  await zero.scan('2026-11-10T10:00:00.000Z', 400, zero.one);
  await zero.scan('2026-11-11T10:00:00.000Z', 0, []);
  await zero.scan('2026-11-12T10:00:00.000Z', 0, []);
  await zero.scan('2026-11-13T10:00:00.000Z', 0, []);
  assert.equal(stateOf(zero.catalog), 'unconfirmed');
  assert.equal(lastErrors(zero.catalog).length, 1);
  // unstable low reads (60 then 30) are not a stable level
  const unstable = await dropFixture();
  await unstable.scan('2026-11-10T10:00:00.000Z', 400, unstable.one);
  await unstable.scan('2026-11-11T10:00:00.000Z', 60, []);
  await unstable.scan('2026-11-12T10:00:00.000Z', 30, []);
  assert.equal(stateOf(unstable.catalog), 'unconfirmed');
});

test('newest-listing runs do not use up the drop lookback', async () => {
  const { catalog, scan, one } = await dropFixture();
  await scan('2026-10-01T10:00:00.000Z', 400, one);
  for (let i = 0; i < 45; i++) {
    await persistSqliteScan(catalog, {
      offers: [],
      searchedAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
      scanContext: { mode: 'newest', queries: ['X'], sources: ['Sklep'], results: [] },
    });
  }
  await scan('2026-11-20T10:00:00.000Z', 0, []);
  assert.equal(stateOf(catalog), 'unconfirmed');
});
