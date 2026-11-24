import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { dealRank, listDeals } from '../deals.mjs';
import { setPriceTarget } from '../price-targets.mjs';

function seed(repository, workId, prefix, { sold, live }) {
  repository.createWork({ id: workId, title: 'Mort ' + workId, authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e' + workId, workId, title: 'Mort', publisher: 'P' });
  const add = (id, price, extra = {}) => {
    repository.upsertOffer({
      id: prefix + id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${prefix}${id}`,
      originalTitle: 'Mort ' + id,
      currentPrice: price,
      conditionClass: 'good',
      availability: 'available',
      ...extra,
    });
    repository.assignOfferToEdition(prefix + id, 'e' + workId, {
      id: 'm_' + prefix + id,
      method: 'manual',
      status: 'active',
    });
  };
  for (let i = 0; i < sold; i += 1) add('s' + i, 4000, { availability: 'sold' });
  for (let i = 0; i < live; i += 1) add('l' + i, 4400);
  add('cheap', 2000);
}

test('rank weighs the saving by confidence', () => {
  assert.ok(dealRank('high', 2000) > dealRank('medium', 2000));
  assert.ok(dealRank('medium', 2000) > dealRank('low', 2000));
  assert.ok(dealRank('low', 2000) > dealRank('none', 2000));
});

test('a deal with a weaker valuation never outranks a stronger one at the same saving', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    seed(repository, 'strong', 'a', { sold: 6, live: 3 });
    seed(repository, 'weak', 'b', { sold: 0, live: 2 });
    const { items } = listDeals(repository);
    const strong = items.find((item) => item.offerId === 'acheap');
    const weak = items.find((item) => item.offerId === 'bcheap');
    assert.ok(strong && weak);
    assert.equal(strong.saving, weak.saving);
    assert.notEqual(strong.confidence, weak.confidence);
    assert.ok(strong.rank > weak.rank);
    assert.ok(items.indexOf(strong) < items.indexOf(weak));
  } finally {
    repository.close();
  }
});

const HOUR = 3_600_000;

/** One work with a cheap deal 'acheap' last seen `ageHours` before its sibling offers. */
function agedDeal(ageHours, { source = 'Vinted', nullSeen = false } = {}) {
  const repository = new SqliteCatalogRepository(':memory:');
  const now = Date.now();
  seed(repository, 'w', 'a', { sold: 3, live: 2 });
  const iso = (ms) => new Date(now - ms).toISOString();
  repository.database.prepare('UPDATE offers SET source=?, last_seen_at=?').run(source, iso(0));
  repository.database
    .prepare("UPDATE offers SET last_seen_at=? WHERE id='acheap'")
    .run(nullSeen ? null : iso(ageHours * HOUR));
  return { repository, now, deal: () => listDeals(repository, { at: now }).items[0] };
}

test('an offer not refreshed for over 48 h while its work was read at the source is maybe gone', () => {
  for (const [hours, expected] of [
    [47, false],
    [49, true],
  ]) {
    const { repository, deal } = agedDeal(hours);
    try {
      assert.equal(deal().offerId, 'acheap');
      assert.equal(deal().maybeGone, expected, `${hours} h`);
      assert.ok(deal().lastSeenAt && deal().firstSeenAt !== undefined);
    } finally {
      repository.close();
    }
  }
});

test('maybe gone works for any source and never fires without a last-seen time', () => {
  const other = agedDeal(60, { source: 'Tezeusz.pl' });
  const unknown = agedDeal(0, { nullSeen: true });
  try {
    assert.equal(other.deal().maybeGone, true);
    assert.equal(unknown.deal().lastSeenAt, null);
    assert.equal(unknown.deal().maybeGone, false);
  } finally {
    other.repository.close();
    unknown.repository.close();
  }
});

test('a newer offer of another work does not mark an old offer as maybe gone', () => {
  const { repository, now } = agedDeal(0);
  try {
    seed(repository, 'x', 'b', { sold: 3, live: 2 });
    const old = new Date(now - 100 * HOUR).toISOString();
    repository.database.prepare("UPDATE offers SET last_seen_at=? WHERE id LIKE 'a%'").run(old);
    const items = listDeals(repository, { at: now }).items;
    assert.equal(items.find((item) => item.offerId === 'acheap')?.maybeGone, false);
  } finally {
    repository.close();
  }
});

test('an owner-target deal gets a rank too, and a non-finite expected gain ranks 0', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
    repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'P' });
    repository.upsertOffer({
      id: 'only',
      source: 'Vinted',
      normalizedUrl: 'https://example.test/only',
      originalTitle: 'Mort',
      currentPrice: 1000,
      conditionClass: 'good',
      availability: 'available',
    });
    repository.assignOfferToEdition('only', 'e', {
      id: 'm_only',
      method: 'manual',
      status: 'active',
    });
    setPriceTarget(repository, { editionId: 'e', maxPrice: 1500 });
    const [deal] = listDeals(repository).items;
    assert.equal(deal.offerId, 'only');
    assert.deepEqual(deal.reasons, ['owner_target']);
    assert.equal(deal.rank, dealRank('high', deal.expected));
    assert.ok(Number.isFinite(deal.rank));
    assert.equal(dealRank('high', Number.NaN), 0);
    assert.equal(dealRank('low', undefined), 0);
  } finally {
    repository.close();
  }
});
