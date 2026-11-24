import assert from 'node:assert/strict';
import test from 'node:test';
import { completeResults, markUnseenOffers, repairCappedNotSeen } from '../offer-availability.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-05T10:00:00.000Z';

function offer(repo, n, queries, at, availability = 'unconfirmed') {
  return repo.upsertOffer({
    source: 'Vinted',
    normalizedUrl: `https://www.vinted.pl/items/${n}`,
    originalTitle: 'T' + n,
    currentPrice: 1000,
    matchedQueries: queries,
    availability,
    firstSeenAt: at,
    lastSeenAt: at,
    at,
  });
}
const status = (repo, n) =>
  repo.database
    .prepare('SELECT availability FROM offers WHERE normalized_url=?')
    .get(`https://www.vinted.pl/items/${n}`).availability;
const complete = {
  source: 'Vinted',
  query: 'Warcraft',
  status: 'ok',
  pagination: { state: 'end' },
};

test('only a finished, successful scan counts as evidence that an offer is gone', () => {
  assert.equal(completeResults([complete]).length, 1);
  assert.equal(completeResults([{ ...complete, status: 'partial' }]).length, 0);
  assert.equal(completeResults([{ ...complete, pagination: { state: 'more' } }]).length, 0);
  assert.equal(completeResults([{ ...complete, pagination: undefined }]).length, 0);
});

test('offers missing from a complete scan of their phrase are marked, seen ones are not', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  offer(repo, 1, ['Warcraft'], T1);
  offer(repo, 2, ['Warcraft'], T1);
  offer(repo, 3, ['Warhammer'], T1);
  offer(repo, 2, ['Warcraft'], T2); // still listed in the latest scan
  assert.equal(markUnseenOffers(repo.database, [complete], T2), 1);
  assert.deepEqual(
    [status(repo, 1), status(repo, 2), status(repo, 3)],
    ['not_seen', 'unconfirmed', 'unconfirmed'],
  );
});

test('an incomplete scan never marks anything, and a re-seen offer returns to unconfirmed', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  offer(repo, 1, ['Warcraft'], T1);
  assert.equal(
    markUnseenOffers(repo.database, [{ ...complete, pagination: { state: 'unknown' } }], T2),
    0,
  );
  assert.equal(markUnseenOffers(repo.database, [complete], T2), 1);
  assert.equal(status(repo, 1), 'not_seen');
  offer(repo, 1, ['Warcraft'], '2026-11-06T10:00:00.000Z'); // listed again
  assert.equal(status(repo, 1), 'unconfirmed');
});

test('a scan that dropped offers with unreadable language is not complete; known foreign ones are fine', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  offer(repo, 1, ['Warcraft'], T1);
  const unknown = { ...complete, rejected: { language_unknown: 1 } };
  assert.equal(completeResults([unknown]).length, 0);
  assert.equal(markUnseenOffers(repo.database, [unknown], T2), 0);
  assert.equal(status(repo, 1), 'unconfirmed');
  const foreign = { ...complete, rejected: { language: 3 } };
  assert.equal(completeResults([foreign]).length, 1);
  assert.equal(completeResults([complete]).length, 1);
  assert.equal(markUnseenOffers(repo.database, [foreign], T2), 1);
  assert.equal(status(repo, 1), 'not_seen');
});

test('the offer list filters by listing state: active, sold, unseen', async () => {
  const { listCatalogOffers } = await import('../catalog-api.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  offer(repo, 1, ['A'], T1, 'unconfirmed');
  offer(repo, 2, ['A'], T1, 'sold');
  offer(repo, 3, ['A'], T1, 'not_seen');
  const urls = (availability) =>
    listCatalogOffers(repo, { status: 'all', availability })
      .items.map((item) => item.title)
      .sort();
  assert.deepEqual(urls('active'), ['T1']);
  assert.deepEqual(urls('sold'), ['T2']);
  assert.deepEqual(urls('unseen'), ['T3']);
  assert.equal(urls('').length, 3);
});

test('a scan that dropped offers with an unreadable price is not complete', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  offer(repo, 1, ['Warcraft'], T1);
  const unreadable = { ...complete, rejected: { price_unknown: 1 } };
  assert.equal(completeResults([unreadable]).length, 0);
  assert.equal(markUnseenOffers(repo.database, [unreadable], T2), 0);
  assert.equal(status(repo, 1), 'unconfirmed');
});

test('the repair returns offers marked gone by a depth-capped read, and only those', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  const pages = (last) => Array.from({ length: last }, (_, i) => ({ page: i + 1, state: 'end' }));
  const read = (query, last) => ({ ...complete, query, pages: pages(last) });
  offer(repo, 1, ['Warcraft'], T1); // only a capped phrase vouched for it
  offer(repo, 2, ['Warhammer'], T1); // a short, genuinely finished read
  offer(repo, 3, ['Warcraft', 'Warhammer'], T1); // one finished read is proof enough
  offer(repo, 4, ['Warcraft'], T1); // marked, then checked by hand afterwards
  const summary = { context: { results: [read('Warcraft', 10), read('Warhammer', 3)] } };
  repo.database
    .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
    .run(T2, JSON.stringify(summary), T2);
  markUnseenOffers(repo.database, summary.context.results, T2);
  repo.database
    .prepare(
      "INSERT INTO offer_status_history(offer_id,status,via,observed_at) SELECT id,'sold','check',? FROM offers WHERE normalized_url=?",
    )
    .run('2026-11-06T10:00:00.000Z', 'https://www.vinted.pl/items/4');
  repo.database
    .prepare("UPDATE offers SET availability='sold' WHERE normalized_url=?")
    .run('https://www.vinted.pl/items/4');
  assert.deepEqual(
    [1, 2, 3, 4].map((n) => status(repo, n)),
    ['not_seen', 'not_seen', 'not_seen', 'sold'],
  );
  assert.deepEqual(repairCappedNotSeen(repo), { restored: 1, checked: 3 });
  assert.deepEqual(
    [1, 2, 3, 4].map((n) => status(repo, n)),
    ['unconfirmed', 'not_seen', 'not_seen', 'sold'],
  );
  // The old mark stays in the history; the repair is a later 'unknown' row (via backfill).
  const history = repo.database
    .prepare(
      "SELECT status, via FROM offer_status_history WHERE offer_id=(SELECT id FROM offers WHERE normalized_url='https://www.vinted.pl/items/1') ORDER BY observed_at, id",
    )
    .all()
    .map((row) => `${row.status}/${row.via}`);
  assert.ok(history.includes('not_seen/scan'));
  assert.equal(history.at(-1), 'unknown/backfill');
  // Running again changes nothing.
  assert.equal(repairCappedNotSeen(repo).restored, 0);
});
