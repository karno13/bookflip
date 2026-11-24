import assert from 'node:assert/strict';
import test from 'node:test';

import { listDeals } from '../deals.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/**
 * Two editions with a market of ordinary listings around 40 zł and 25 zł, plus candidate deals.
 * `scale` multiplies every price (grosze); `reverse` inserts the offers in the opposite order.
 */
function build({ scale = 1, reverse = false, dealPrice = 1800 } = {}) {
  const repository = new SqliteCatalogRepository(':memory:');
  for (const [id, title] of [
    ['mort', 'Mort'],
    ['eryk', 'Eryk'],
  ]) {
    repository.createWork({ id: 'w_' + id, title, authors: ['Pratchett, Terry'] });
    repository.createEdition({ id: 'e_' + id, workId: 'w_' + id, title, publisher: 'Prószyński' });
  }
  const specs = [];
  for (let i = 0; i < 6; i++) specs.push(['mort', 4000 + i * 100, i < 3 ? 3 : null, 20]);
  for (let i = 0; i < 6; i++) specs.push(['eryk', 2500 + i * 100, null, 20]);
  specs.push(['mort', dealPrice, null, 1], ['eryk', 1200, null, 1]);
  const ordered = reverse ? [...specs].reverse() : specs;
  for (const [edition, price, soldAfter, days] of ordered) {
    const id = `${edition}_${price}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `${edition} ${id}`,
      currentPrice: Math.round(price * scale),
      conditionClass: 'good',
      availability: soldAfter == null ? 'available' : 'sold',
      firstSeenAt: daysAgo(days),
      favouriteCount: 3,
    });
    if (soldAfter != null)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(days - soldAfter), id);
    repository.assignOfferToEdition(id, 'e_' + edition, {
      id: 'm_' + id,
      method: 'manual',
      status: 'active',
    });
  }
  return repository;
}

const ranking = (repository) => listDeals(repository, { at: AT }).items.map((deal) => deal.offerId);

test('the ranking does not depend on the order the offers were saved in', () => {
  const forward = build();
  const reversed = build({ reverse: true });
  try {
    assert.equal(ranking(forward).length, 2);
    assert.ok(ranking(forward).every((id) => typeof id === 'string'));
    assert.deepEqual(ranking(forward), ranking(reversed));
  } finally {
    forward.close();
    reversed.close();
  }
});

test('a cheaper price never lowers the saving of a deal', () => {
  const savings = [];
  for (const dealPrice of [2600, 2200, 1800, 1500]) {
    const repository = build({ dealPrice });
    try {
      const deal = listDeals(repository, { at: AT }).items.find(
        (item) => item.offerId === `mort_${dealPrice}`,
      );
      assert.ok(deal, `no deal found at ${dealPrice}`);
      savings.push(deal.saving);
    } finally {
      repository.close();
    }
  }
  for (let i = 1; i < savings.length; i++)
    assert.ok(savings[i] > savings[i - 1], `savings ${savings.join(', ')}`);
  assert.ok(savings.at(-1) > 0);
});

test('scaling every price together keeps the same deals in the same order', () => {
  const base = build();
  const doubled = build({ scale: 2 });
  try {
    assert.deepEqual(ranking(base), ranking(doubled));
  } finally {
    base.close();
    doubled.close();
  }
});
