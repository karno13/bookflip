import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_DEALS, dealLifetime } from '../deal-lifetime.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const MIN = 60_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const iso = (offsetMinutes) => new Date(AT + offsetMinutes * MIN).toISOString();

function world(deals) {
  const repository = new SqliteCatalogRepository(':memory:');
  deals.forEach((deal, index) => {
    const id = `o${index}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: id,
      currentPrice: 1000,
      availability: deal.availability ?? 'sold',
      listedAt: deal.listed == null ? null : iso(deal.listed),
    });
    repository.database
      .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
      .run(deal.ended == null ? null : iso(deal.ended), id);
    repository.database
      .prepare(
        'INSERT INTO deal_alerts(offer_id, price, worth, saving, chance, alerted_at) VALUES (?,?,?,?,?,?)',
      )
      .run(id, 1000, 3000, 2000, 0.5, iso(deal.alerted));
  });
  return repository;
}

test('delay and life come from the listing time; live and timeless offers are counted apart', () => {
  const deals = [];
  // 30 deals found 20 min after listing, gone 60 min after listing.
  for (let i = 0; i < MIN_DEALS; i++) deals.push({ listed: -100, alerted: -80, ended: -40 });
  deals.push({ listed: -100, alerted: -90, availability: 'available' });
  deals.push({ listed: null, alerted: -90 });
  const result = dealLifetime(world(deals), { at: AT });
  assert.equal(result.deals, MIN_DEALS + 2);
  assert.equal(result.noListingTime, 1);
  assert.equal(result.alive, 1);
  assert.equal(result.gone, MIN_DEALS);
  assert.equal(result.enough, true);
  assert.deepEqual(result.lifeMinutes, { p50: 60, p75: 60 });
  assert.equal(result.medianDelayMinutes, 20);
});

test('below the minimum there are no numbers', () => {
  const result = dealLifetime(world([{ listed: -100, alerted: -80, ended: -40 }]), { at: AT });
  assert.equal(result.enough, false);
  assert.equal(result.medianDelayMinutes, null);
  assert.equal(result.lifeMinutes, null);
});
