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
  add('cheap', 2000);
  return { repository, add };
}

const flagOf = (repository, id) =>
  listDeals(repository).items.find((item) => item.offerId === id)?.cheapestLive;

test('a deal below every other live offer is the cheapest; ties and cheaper offers are not', () => {
  const { repository, add } = setup();
  try {
    assert.equal(flagOf(repository, 'cheap'), true);
    add('gone', 1500, { availability: 'unavailable' });
    add('huge', 1_000_000, { source: 'Empik' });
    assert.equal(flagOf(repository, 'cheap'), true, 'unavailable and unknown-priced ignored');
    add('tie', 2000);
    assert.equal(flagOf(repository, 'cheap'), false, 'a tie is not strictly below');
    add('lower', 1900, { source: 'Empik' });
    assert.equal(flagOf(repository, 'cheap'), false, 'a cheaper offer of another source');
  } finally {
    repository.close();
  }
});

test('the only live offer of an edition counts as the cheapest', () => {
  const { repository } = setup();
  try {
    repository.database.prepare("UPDATE offers SET availability='sold' WHERE id='a'").run();
    assert.equal(flagOf(repository, 'cheap'), true);
  } finally {
    repository.close();
  }
});

test('stale offers, other editions and offers in a set do not count against the flag', () => {
  const { repository, add } = setup();
  try {
    repository.createEdition({ id: 'e2', workId: 'w', title: 'Mort 2', publisher: 'X' });
    add('old', 1000);
    repository.database
      .prepare("UPDATE offers SET last_seen_at=? WHERE id='old'")
      .run(new Date(Date.now() - 20 * 86_400_000).toISOString());
    assert.equal(flagOf(repository, 'cheap'), true, 'older than 14 days ignored');
    repository.upsertOffer({
      id: 'other',
      source: 'Vinted',
      normalizedUrl: 'https://example.test/other',
      originalTitle: 'Mort other',
      currentPrice: 500,
      conditionClass: 'good',
      availability: 'available',
    });
    repository.assignOfferToEdition('other', 'e2', {
      id: 'm_other',
      method: 'manual',
      status: 'active',
    });
    assert.equal(flagOf(repository, 'cheap'), true, 'another edition ignored');
    add('boxed', 800);
    repository.database
      .prepare("INSERT INTO offer_sets (offer_id, created_at, updated_at) VALUES ('boxed', ?, ?)")
      .run(new Date().toISOString(), new Date().toISOString());
    assert.equal(flagOf(repository, 'cheap'), true, 'an offer in a set ignored');
  } finally {
    repository.close();
  }
});

test('a cheaper new-shop offer of the edition counts', () => {
  const { repository, add } = setup();
  try {
    add('shop', 1500, { source: 'Empik' });
    assert.equal(flagOf(repository, 'cheap'), false);
  } finally {
    repository.close();
  }
});

test('near items carry the flag too', () => {
  const { repository } = setup();
  try {
    const result = listDeals(repository, { includeNear: true });
    for (const item of [...result.items, ...result.near])
      assert.equal(typeof item.cheapestLive, 'boolean');
  } finally {
    repository.close();
  }
});
