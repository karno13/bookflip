import assert from 'node:assert/strict';
import test from 'node:test';

import { listDeals } from '../deals.mjs';
import { MIN_EVENTS, MIN_FACTOR, priceDrops, suggestedPrice } from '../price-drops.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  let n = 0;
  const offer = (price, availability, { age = 30, history = [] } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: id,
      currentPrice: price,
      conditionClass: 'good',
      availability,
      firstSeenAt: daysAgo(age),
    });
    if (availability === 'sold')
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(5), id);
    repository.assignOfferToEdition(id, 'e', { id: 'm' + id, method: 'manual', status: 'active' });
    history.forEach(([p, d]) =>
      repository.database
        .prepare('INSERT INTO offer_price_history(offer_id, price, observed_at) VALUES (?,?,?)')
        .run(id, p, daysAgo(d)),
    );
    return id;
  };
  return { repository, offer };
}

test('a cut is counted, a rise is not, and the hint stays inside its bounds', () => {
  const { repository, offer } = world();
  const id = offer(3000, 'available', {
    history: [
      [4000, 20],
      [3600, 10],
      [3800, 5],
      [3000, 1],
    ],
  });
  const stats = priceDrops(repository);
  assert.equal(stats.perOffer.get(id).count, 2); // 4000→3600 and 3800→3000; 3600→3800 is a rise
  assert.equal(stats.perOffer.get(id).lastPercent, 21);
  assert.equal(stats.medianCut, null); // fewer than MIN_EVENTS
  assert.equal(suggestedPrice(3000, 0.9), Math.round((3000 * MIN_FACTOR) / 100) * 100);
  assert.equal(suggestedPrice(3000, 0.1), 2700);
  assert.equal(suggestedPrice(3000, null), null);
  assert.equal(suggestedPrice(3000, 0), null);
});

test('an old offer that a usual cut would make a deal is "near", never in the deals list', () => {
  const { repository, offer } = world();
  for (let i = 0; i < 4; i++) offer(4000 + i * 100, 'sold', { age: 40 });
  // MIN_EVENTS cuts of 9% on other offers give the median cut.
  for (let i = 0; i < MIN_EVENTS; i++)
    offer(3600, 'sold', {
      age: 40,
      history: [
        [4000, 30],
        [3600, 20],
      ],
    });
  const target = offer(3100, 'available', { age: 30 }); // 14% below the worth: not a deal
  const young = offer(3100, 'available', { age: 2 });
  const plain = listDeals(repository, { at: AT });
  assert.ok(!plain.items.some((item) => item.offerId === target));
  assert.deepEqual(plain.near, []);
  const withNear = listDeals(repository, { at: AT, includeNear: true });
  const found = withNear.near.find((item) => item.offerId === target);
  assert.ok(found, 'old offer is near');
  assert.equal(found.near.suggested, 2800);
  assert.ok(!withNear.near.some((item) => item.offerId === young), 'a young offer is not');
  assert.deepEqual(
    withNear.items.map((item) => item.offerId),
    plain.items.map((item) => item.offerId),
  );
});

test('an offer that is a deal through the owner target is not also near', () => {
  const { repository, offer } = world();
  for (let i = 0; i < 4; i++) offer(4000 + i * 100, 'sold', { age: 40 });
  for (let i = 0; i < MIN_EVENTS; i++)
    offer(4000, 'sold', {
      age: 40,
      history: [
        [4400, 30],
        [4000, 20],
      ],
    });
  const old = offer(3100, 'available', { age: 30 });
  repository.database
    .prepare(
      "INSERT INTO price_targets(id, scope, edition_id, work_id, max_price, active, created_at, updated_at) VALUES ('t1', 'edition', 'e', NULL, 3200, 1, ?, ?)",
    )
    .run(daysAgo(1), daysAgo(1));
  const result = listDeals(repository, { at: AT, includeNear: true });
  assert.ok(result.items.some((item) => item.offerId === old));
  assert.ok(!result.near.some((item) => item.offerId === old));
});
