import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  fillListingAges,
  pendingListingAgeChecks,
  repairYesterdayListings,
} from '../listing-age-backfill.mjs';
import { listedAtFromAge } from '../offer-observations.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const detailPage = readFileSync(
  new URL('../fixtures/details/vinted-item-captured.html', import.meta.url),
  'utf8',
);
const URL_AGED = 'https://www.vinted.pl/items/9000000002-faust-erik-terry-pratchett';

function seed(repository, rows) {
  for (const [id, url, firstSeenAt] of rows)
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: url,
      originalTitle: id,
      currentPrice: 1000,
      firstSeenAt,
      lastSeenAt: firstSeenAt,
    });
}

test('"wczoraj" is a listing age: one day before the reading', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');
  assert.equal(listedAtFromAge('wczoraj', now), '2026-11-09T12:00:00.000Z');
});

test('offers without a listing date get it from the listing page, once, oldest first', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    seed(repository, [
      ['new', 'https://www.vinted.pl/items/9000000003-x', '2026-11-12T00:00:00.000Z'],
      ['aged', URL_AGED, '2026-11-01T00:00:00.000Z'],
      ['gone', 'https://www.vinted.pl/items/9000000004-y', '2026-11-02T00:00:00.000Z'],
      ['sold', 'https://www.vinted.pl/items/9000000005-z', '2026-11-03T00:00:00.000Z'],
      ['dated', 'https://www.vinted.pl/items/9000000006-w', '2026-11-04T00:00:00.000Z'],
    ]);
    const db = repository.database;
    db.prepare("UPDATE offers SET availability='sold' WHERE id='sold'").run();
    db.prepare("UPDATE offers SET listed_at='2026-10-01T00:00:00.000Z' WHERE id='dated'").run();
    assert.deepEqual(
      pendingListingAgeChecks(repository).map((row) => row.id),
      ['aged', 'gone', 'new'],
      'only buyable offers without a date, the oldest sighting first',
    );

    const reads = [];
    const readAt = new Date('2026-11-15T12:00:00.000Z');
    const fetchHtml = async (url) => {
      reads.push(url);
      if (url.includes('9000000004')) throw Object.assign(Error('HTTP_404'), { status: 404 });
      return url === URL_AGED ? detailPage : '<html></html>';
    };
    const report = await fillListingAges(repository, { now: () => readAt, fetchHtml });
    assert.equal(report.checked, 2);
    assert.equal(report.removed, 1);
    assert.equal(report.paused, false);
    const row = (id) => db.prepare('SELECT * FROM offers WHERE id=?').get(id);
    assert.equal(report.found, 1);
    assert.equal(report.missing, 1);
    assert.ok(row('aged').listed_at && row('aged').listed_at_text);
    assert.equal(row('new').listed_at, null);
    for (const id of ['aged', 'gone', 'new']) assert.ok(row(id).listing_age_checked_at);
    assert.equal(row('dated').listing_age_checked_at, null);
    assert.equal(pendingListingAgeChecks(repository).length, 0, 'every page is tried once');
    assert.equal(reads.length, 3);
  } finally {
    repository.close?.();
  }
});

test('a block pauses the backfill and leaves the offer queued', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    seed(repository, [
      ['a', 'https://www.vinted.pl/items/9000000010-a', '2026-11-01T00:00:00.000Z'],
      ['b', 'https://www.vinted.pl/items/9000000011-b', '2026-11-02T00:00:00.000Z'],
    ]);
    let calls = 0;
    const report = await fillListingAges(repository, {
      fetchHtml: async () => {
        calls++;
        throw Object.assign(Error('SOURCE_HTTP_403'), { status: 403, blocked: true });
      },
    });
    assert.equal(report.paused, true);
    assert.equal(calls, 1, 'no further request after a block');
    assert.equal(pendingListingAgeChecks(repository).length, 2);
  } finally {
    repository.close?.();
  }
});

test('failures are retried a few times, then the page is given up', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    seed(repository, [
      ['a', 'https://www.vinted.pl/items/9000000012-a', '2026-11-01T00:00:00.000Z'],
      ['b', 'https://www.vinted.pl/items/9000000014-b', '2026-11-02T00:00:00.000Z'],
    ]);
    const failures = new Map();
    let calls = 0;
    const fetchHtml = async () => {
      calls++;
      throw Object.assign(Error('HTTP_500'), { status: 500 });
    };
    for (let round = 0; round < 3; round++)
      await fillListingAges(repository, { fetchHtml, failures });
    assert.equal(calls, 3, 'a failed read ends the round: an outage does not burn the queue');
    assert.deepEqual(
      pendingListingAgeChecks(repository).map((row) => row.id),
      ['b'],
    );
  } finally {
    repository.close?.();
  }
});

test('the one-time repair dates "wczoraj" offers one day before their first sighting', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    seed(repository, [
      ['y', 'https://www.vinted.pl/items/9000000013-y', '2026-11-10T12:00:00.000Z'],
    ]);
    repository.database.prepare("UPDATE offers SET listed_at_text='Wczoraj' WHERE id='y'").run();
    assert.deepEqual(repairYesterdayListings(repository), { updated: 1 });
    assert.equal(
      repository.database.prepare("SELECT listed_at FROM offers WHERE id='y'").get().listed_at,
      '2026-11-09T12:00:00.000Z',
    );
  } finally {
    repository.close?.();
  }
});
