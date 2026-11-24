import assert from 'node:assert/strict';
import test from 'node:test';

import { activitySeries } from '../activity.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const NOW = Date.parse('2026-11-20T12:00:00Z');

function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  let n = 0;
  const offer = (firstSeen, { gone = null } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: id,
      currentPrice: 1000,
      availability: gone ? 'sold' : 'available',
      firstSeenAt: firstSeen,
    });
    repository.database
      .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
      .run(gone, id);
    return id;
  };
  return { repository, offer };
}

test('every day of the window is present and counts land on their Warsaw day', () => {
  const { repository, offer } = world();
  offer('2026-11-20T10:00:00Z');
  offer('2026-11-20T11:00:00Z', { gone: '2026-11-20T09:00:00Z' });
  offer('2026-11-18T23:30:00Z'); // 00:30 on the 19th in Warsaw
  offer('2026-09-01T10:00:00Z'); // outside the window
  const result = activitySeries(repository, { days: 7, now: () => NOW });
  assert.equal(result.days.length, 7);
  assert.equal(result.to, '2026-11-20');
  assert.equal(result.from, '2026-11-14');
  const day = (date) => result.days.find((entry) => entry.date === date);
  assert.equal(day('2026-11-20').new, 2);
  assert.equal(day('2026-11-20').gone, 1);
  assert.equal(day('2026-11-19').new, 1);
  assert.equal(day('2026-11-18').new, 0);
  assert.equal(result.totals.new, 3);
  assert.equal(result.totals.alerts, 0);
});

test('days are clamped to 7..90 and an empty database gives zeros', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  assert.equal(activitySeries(repository, { days: 1, now: () => NOW }).days.length, 7);
  assert.equal(activitySeries(repository, { days: 1000, now: () => NOW }).days.length, 90);
  assert.deepEqual(activitySeries(repository, { now: () => NOW }).totals, {
    new: 0,
    gone: 0,
    alerts: 0,
  });
});

test('announced deals count on their day, and DST days stay 24/25 h in Warsaw terms', () => {
  const { repository, offer } = world();
  const id = offer('2026-10-25T10:00:00Z');
  repository.database
    .prepare(
      'INSERT INTO deal_alerts(offer_id, price, worth, saving, chance, alerted_at) VALUES (?,?,?,?,?,?)',
    )
    .run(id, 1000, 3000, 2000, 0.5, '2026-10-24T22:30:00Z'); // 00:30 on the 25th in Warsaw (CEST)
  const result = activitySeries(repository, {
    days: 10,
    now: () => Date.parse('2026-10-28T12:00:00Z'),
  });
  const day = (date) => result.days.find((entry) => entry.date === date);
  assert.equal(day('2026-10-25').alerts, 1);
  assert.equal(day('2026-10-24').alerts, 0);
  assert.equal(day('2026-10-25').new, 1);
  assert.equal(result.days.length, 10);
});

test('the answer is cached for a minute while nothing changes, and refreshed after a change', () => {
  const { repository, offer } = world();
  offer('2026-11-20T10:00:00Z');
  const first = activitySeries(repository, { days: 7, now: () => NOW });
  assert.equal(first.totals.new, 1);
  offer('2026-11-20T11:00:00Z');
  const second = activitySeries(repository, { days: 7, now: () => NOW + 1000 });
  assert.equal(second.totals.new, 2, 'a write invalidates the cached answer');
  const third = activitySeries(repository, { days: 7, now: () => NOW + 2000 });
  assert.deepEqual(third, second);
  third.days[0].new = 99; // the caller cannot corrupt the cache
  assert.notEqual(activitySeries(repository, { days: 7, now: () => NOW + 3000 }).days[0].new, 99);
});
