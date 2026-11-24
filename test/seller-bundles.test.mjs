import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_BOOKS, sellerBundles } from '../seller-bundles.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/** One edition with a market around 40 zł; sellers list copies at their own prices. */
function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  let n = 0;
  const add = (seller, price, { soldAfter = null, availability = null } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `Mort ${id}`,
      currentPrice: price,
      conditionClass: 'good',
      availability: availability ?? (soldAfter == null ? 'available' : 'sold'),
      firstSeenAt: daysAgo(20),
      favouriteCount: 3,
      sellerId: seller,
      sellerName: seller ? `Sprzedawca ${seller}` : null,
    });
    if (soldAfter != null)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(20 - soldAfter), id);
    repository.assignOfferToEdition(id, 'e', { id: 'm' + id, method: 'manual', status: 'active' });
    return id;
  };
  // The market: sold and listed copies of other sellers around 40 zł.
  for (let i = 0; i < 4; i++) add('rynek' + i, 4000 + i * 100, { soldAfter: 3 + i });
  return { repository, add };
}

test('a seller with enough valued books is a bundle, with the sums and the offers by saving', () => {
  const { repository, add } = world();
  try {
    add('A', 3000);
    add('A', 3200);
    add('A', 3400);
    add('B', 3000); // only two books: not a bundle
    add('B', 3000);
    const result = sellerBundles(repository, { at: AT });
    assert.equal(result.minBooks, MIN_BOOKS);
    assert.deepEqual(
      result.items.map((bundle) => bundle.sellerId),
      ['A'],
    );
    const [bundle] = result.items;
    assert.equal(bundle.count, 3);
    assert.equal(bundle.totalPrice, 9600);
    assert.equal(bundle.totalSaving, bundle.totalWorth - 9600);
    assert.ok(bundle.totalWorth > 9600);
    // Offers are listed with the biggest saving first.
    assert.deepEqual(
      bundle.offers.map((offer) => offer.price),
      [3000, 3200, 3400],
    );
  } finally {
    repository.close();
  }
});

test('sold or unavailable books, wrong matches and sellers without an id do not count', () => {
  const { repository, add } = world();
  try {
    add('C', 3000);
    add('C', 3100);
    add('C', 3200, { availability: 'unavailable' }); // gone: not a book of the bundle
    assert.deepEqual(sellerBundles(repository, { at: AT }).items, []);
    const third = add('C', 3200);
    assert.equal(sellerBundles(repository, { at: AT }).items.length, 1);
    // The owner marked one as a wrong match: it leaves the bundle, which falls below three books.
    repository.database
      .prepare('INSERT INTO deal_verdicts(offer_id, verdict, created_at) VALUES (?,?,?)')
      .run(third, 'wrong_match', daysAgo(0));
    assert.deepEqual(sellerBundles(repository, { at: AT }).items, []);
    // Offers with no seller id never join a bundle.
    add(null, 3000);
    add(null, 3000);
    add(null, 3000);
    assert.deepEqual(sellerBundles(repository, { at: AT }).items, []);
  } finally {
    repository.close();
  }
});

test('bundles are ordered by the total saving', () => {
  const { repository, add } = world();
  try {
    for (const price of [3400, 3400, 3400]) add('small', price);
    for (const price of [3000, 3000, 3000, 3000]) add('big', price);
    assert.deepEqual(
      sellerBundles(repository, { at: AT }).items.map((bundle) => bundle.sellerId),
      ['big', 'small'],
    );
  } finally {
    repository.close();
  }
});

test('a seller own listings are not the market that values them', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
    repository.createEdition({ id: 'e', workId: 'w', title: 'Mort' });
    // Three books by one seller and no other copy of the edition anywhere: nothing to value them by.
    for (let i = 0; i < 3; i++) {
      repository.upsertOffer({
        id: `o${i}`,
        source: 'Vinted',
        normalizedUrl: `https://example.test/o${i}`,
        originalTitle: 'Mort',
        currentPrice: 1000 + i,
        conditionClass: 'good',
        availability: 'available',
        firstSeenAt: daysAgo(5),
        sellerId: 'solo',
      });
      repository.assignOfferToEdition(`o${i}`, 'e', {
        id: `m${i}`,
        method: 'manual',
        status: 'active',
      });
    }
    assert.deepEqual(sellerBundles(repository, { at: AT }).items, []);
  } finally {
    repository.close();
  }
});
