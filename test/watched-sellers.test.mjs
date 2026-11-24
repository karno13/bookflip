import assert from 'node:assert/strict';
import test from 'node:test';

import { listDeals } from '../deals.mjs';
import { sellerBundles } from '../seller-bundles.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { listWatched, unwatchSeller, watchSeller, watchedKeys } from '../watched-sellers.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/** A market around 40 zł (4 sold copies); `add` lists one more copy of a seller. */
function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  let n = 0;
  const add = (seller, price, sold = false) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `Mort ${id}`,
      currentPrice: price,
      conditionClass: 'good',
      availability: sold ? 'sold' : 'available',
      firstSeenAt: daysAgo(20),
      sellerId: seller,
    });
    if (sold)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(10), id);
    repository.assignOfferToEdition(id, 'e', { id: 'm' + id, method: 'manual', status: 'active' });
    return id;
  };
  for (let i = 0; i < 4; i++) add('rynek' + i, 4000 + i * 100, true);
  return { repository, add };
}

test('watching needs a seller id, is idempotent and removing it deletes nothing else', () => {
  const { repository } = world();
  assert.throws(
    () => watchSeller(repository, { source: 'Vinted', sellerId: ' ' }),
    /SELLER_ID_REQUIRED/,
  );
  watchSeller(repository, { source: 'Vinted', sellerId: 'A' });
  watchSeller(repository, { source: 'Vinted', sellerId: 'A', note: 'tanio' });
  assert.equal(listWatched(repository).items.length, 1);
  assert.equal(listWatched(repository).items[0].note, 'tanio');
  unwatchSeller(repository, 'Vinted', 'A');
  assert.equal(watchedKeys(repository).size, 0);
  assert.equal(repository.database.prepare('SELECT count(*) AS c FROM offers').get().c, 4);
});

test("a watched seller's offer only has to be below the worth; others keep the thresholds", () => {
  const { repository, add } = world();
  const slight = add('A', 3700); // a little below the worth: not a deal for anyone
  const other = add('B', 3700);
  const before = listDeals(repository, { at: AT, includeWatched: true }).items.map(
    (item) => item.offerId,
  );
  assert.ok(!before.includes(slight));
  watchSeller(repository, { source: 'Vinted', sellerId: 'A' });
  // Alerts, day plan and statistics call without includeWatched: the ordinary thresholds.
  assert.ok(!listDeals(repository, { at: AT }).items.some((item) => item.offerId === slight));
  const after = listDeals(repository, { at: AT, includeWatched: true }).items;
  const mine = after.find((item) => item.offerId === slight);
  assert.ok(mine, "the watched seller's offer is listed");
  assert.equal(mine.watched, true);
  assert.ok(!after.some((item) => item.offerId === other));
  // An offer above the worth is never listed, watched or not.
  const dear = add('A', 6000);
  assert.ok(
    !listDeals(repository, { at: AT, includeWatched: true }).items.some(
      (item) => item.offerId === dear,
    ),
  );
});

test('watching changes neither the ranking of other deals nor makes bundles lose the flag', () => {
  const { repository, add } = world();
  add('C', 1500);
  add('D', 2000);
  const ranking = () =>
    listDeals(repository, { at: AT, includeWatched: true }).items.map((item) => item.offerId);
  const before = ranking();
  watchSeller(repository, { source: 'Vinted', sellerId: 'C' });
  assert.deepEqual(ranking(), before);
  for (let i = 0; i < 3; i++) add('E', 3000 + i * 100);
  watchSeller(repository, { source: 'Vinted', sellerId: 'E' });
  const bundles = sellerBundles(repository, { at: AT }).items;
  assert.equal(bundles.find((bundle) => bundle.sellerId === 'E').watched, true);
});
