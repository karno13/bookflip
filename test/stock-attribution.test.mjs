import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { addStock, listEdition, moveStock } from '../stock.mjs';
import { MIN_COPIES, stockAttribution } from '../stock-attribution.mjs';

function world(copies) {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  const ids = [];
  for (let i = 0; i < copies; i += 1) {
    repository.upsertOffer({
      id: `o${i}`,
      source: 'Vinted',
      normalizedUrl: `https://example.test/o${i}`,
      originalTitle: `Mort ${i}`,
      currentPrice: 1000,
      availability: 'available',
      sellerId: i < 5 ? 's1' : 's2',
      matchedQueries: ['pratchett'],
    });
    repository.assignOfferToEdition(`o${i}`, 'e', {
      id: `m${i}`,
      method: 'manual',
      status: 'active',
    });
    ids.push(addStock(repository, { offerId: `o${i}` }).id);
  }
  return { repository, ids };
}

test('a copy keeps the phrase and seller of its offer after the offer is gone', () => {
  const { repository, ids } = world(1);
  const snap = repository.database
    .prepare('SELECT source, source_phrase, source_seller_id FROM stock_items WHERE id=?')
    .get(ids[0]);
  assert.deepEqual(
    { ...snap },
    { source: 'Vinted', source_phrase: 'pratchett', source_seller_id: 's1' },
  );
  repository.database.prepare('DELETE FROM offers WHERE id=?').run('o0');
  const row = repository.database
    .prepare('SELECT offer_id, source_phrase, source_seller_id FROM stock_items')
    .get();
  assert.equal(row.offer_id, null);
  assert.equal(row.source_seller_id, 's1');
});

test('groups below the minimum say too little data; old copies without a snapshot are unknown', () => {
  const { repository, ids } = world(6);
  repository.database
    .prepare('UPDATE stock_items SET source_phrase=?, source_seller_id=?, source=?')
    .run('pratchett', 's1', 'Vinted');
  repository.database
    .prepare('UPDATE stock_items SET source_seller_id=? WHERE id=?')
    .run('s2', ids[5]);
  moveStock(repository, ids[0], 'listed', { now: () => new Date('2026-10-01') });
  moveStock(repository, ids[0], 'sold', { now: () => new Date('2026-10-04') });
  repository.database
    .prepare('UPDATE stock_items SET source_phrase=NULL, source_seller_id=NULL WHERE id=?')
    .run(ids[4]);
  const report = stockAttribution(repository);
  assert.equal(report.total, 6);
  assert.equal(report.unknown, 1);
  assert.equal(MIN_COPIES, 5);
  const phrase = report.phrases.find((entry) => entry.label === 'pratchett');
  assert.equal(phrase.bought, 5);
  assert.equal(phrase.enough, true);
  assert.equal(phrase.sold, 1);
  assert.equal(phrase.medianDaysToSold, 3);
  const small = report.sellers.find((entry) => entry.sellerId === 's2');
  assert.equal(small.bought, 1);
  assert.equal(small.enough, false);
  assert.equal(small.sold, null);
});

test('a copy added by "Wystawiłem" has no purchase and stays out', () => {
  const { repository } = world(0);
  listEdition(repository, 'e');
  assert.equal(stockAttribution(repository).total, 0);
});
