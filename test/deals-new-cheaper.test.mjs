import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { listDeals } from '../deals.mjs';

function setup() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  const add = (id, price, extra = {}) => {
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: 'Mort ' + id,
      currentPrice: price,
      conditionClass: 'good',
      availability: 'available',
      ...extra,
    });
    repository.assignOfferToEdition(id, 'e', { id: 'm_' + id, method: 'manual', status: 'active' });
  };
  add('s1', 4000, { availability: 'sold' });
  add('s2', 4200, { availability: 'sold' });
  add('a', 4400);
  add('b', 4500);
  add('cheap', 2000);
  return { repository, add };
}

const flagOf = (repository, id) =>
  listDeals(repository).items.find((item) => item.offerId === id)?.newCheaper;

test('a used deal is flagged with the cheapest available new offer priced at or below it', () => {
  const { repository, add } = setup();
  try {
    assert.equal(flagOf(repository, 'cheap'), null, 'no shop offer, no flag');
    add('shop-dear', 2500, { source: 'Empik' });
    assert.equal(flagOf(repository, 'cheap'), null, 'new dearer than the deal: no flag');
    add('shop-eq', 2000, { source: 'Lagano' });
    add('shop-low', 1990, { source: 'Empik' });
    const flag = flagOf(repository, 'cheap');
    assert.deepEqual(flag, {
      source: 'Empik',
      url: 'https://example.test/shop-low',
      price: 1990,
    });
  } finally {
    repository.close();
  }
});

test('a cheaper new copy of another edition of the same work does not flag', () => {
  const { repository } = setup();
  try {
    repository.createEdition({ id: 'e2', workId: 'w', title: 'Mort', publisher: 'Inny' });
    repository.upsertOffer({
      id: 'shop-other',
      source: 'Empik',
      normalizedUrl: 'https://example.test/shop-other',
      originalTitle: 'Mort',
      currentPrice: 900,
      conditionClass: 'new',
      availability: 'available',
    });
    repository.assignOfferToEdition('shop-other', 'e2', {
      id: 'm_shop-other',
      method: 'manual',
      status: 'active',
    });
    assert.equal(flagOf(repository, 'cheap'), null);
  } finally {
    repository.close();
  }
});

test('an unavailable, unknown-priced or own-kind shop offer does not flag', () => {
  const { repository, add } = setup();
  try {
    add('shop-gone', 1500, { source: 'Empik', availability: 'unavailable' });
    assert.equal(flagOf(repository, 'cheap'), null, 'unavailable shop offer');
    add('shop-huge', 1_000_000, { source: 'Empik' });
    assert.equal(flagOf(repository, 'cheap'), null, 'price of 10 000 zl or more is unknown');
    // A shop offer is never flagged against another shop's offer.
    add('shop-a', 1000, { source: 'Empik' });
    const shops = listDeals(repository).items.filter((item) => item.source === 'Empik');
    assert.ok(shops.length, 'the shop offer is itself a deal');
    for (const item of shops) assert.equal(item.newCheaper, null);
  } finally {
    repository.close();
  }
});
