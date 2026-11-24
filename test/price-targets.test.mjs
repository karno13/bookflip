import assert from 'node:assert/strict';
import test from 'node:test';

import { recordDealAlerts } from '../deal-alerts.mjs';
import { listDeals } from '../deals.mjs';
import { listPriceTargets, setPriceTarget, setPriceTargetActive } from '../price-targets.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const AT = Date.parse('2026-11-20T12:00:00Z');
const hoursAgo = (hours) => new Date(AT - hours * 3_600_000).toISOString();

/** A work with a Polish edition and an English one; no market at all (so no valuation). */
function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'epl', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  repository.createEdition({ id: 'een', workId: 'w', title: 'Mort', publisher: 'Gollancz' });
  repository.database.prepare("UPDATE editions SET language='en' WHERE id='een'").run();
  let n = 0;
  const add = (edition, price) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `Mort ${id}`,
      currentPrice: price,
      conditionClass: 'good',
      availability: 'available',
      firstSeenAt: hoursAgo(2),
    });
    repository.assignOfferToEdition(id, edition, {
      id: 'm' + id,
      method: 'manual',
      status: 'active',
    });
    return id;
  };
  return { repository, add };
}
const ids = (repository) => listDeals(repository, { at: AT }).items.map((item) => item.offerId);

test('an offer at or below the owner price is a deal even with no market valuation', () => {
  const { repository, add } = world();
  try {
    const cheap = add('epl', 1200);
    const dear = add('epl', 2600);
    assert.deepEqual(ids(repository), []);
    setPriceTarget(repository, { editionId: 'epl', maxPrice: 1500 });
    const items = listDeals(repository, { at: AT }).items;
    assert.deepEqual(
      items.map((item) => item.offerId),
      [cheap],
    );
    assert.equal(items[0].target.maxPrice, 1500);
    assert.equal(items[0].worth, 1500);
    assert.equal(items[0].saving, 300);
    assert.equal(items[0].confidenceLabel, 'Twoja cena (cel z ustawień)');
    assert.ok(!ids(repository).includes(dear));
    // The price exactly at the target counts.
    repository.database.prepare('UPDATE offers SET current_price=1500 WHERE id=?').run(dear);
    assert.ok(ids(repository).includes(dear));
  } finally {
    repository.close();
  }
});

test('a work target covers the Polish editions, never a foreign one; 10 000 zł and more never counts', () => {
  const { repository, add } = world();
  try {
    const polish = add('epl', 1000);
    const foreign = add('een', 1000);
    const huge = add('epl', 1_000_000);
    setPriceTarget(repository, { workId: 'w', maxPrice: 999_999 });
    assert.deepEqual(ids(repository), [polish]);
    assert.ok(!ids(repository).includes(foreign));
    assert.ok(!ids(repository).includes(huge));
    // An own target on the foreign edition does cover it.
    setPriceTarget(repository, { editionId: 'een', maxPrice: 1200 });
    assert.ok(ids(repository).includes(foreign));
  } finally {
    repository.close();
  }
});

test('a target deal is announced once; switching the target off keeps the alert and hides the deal', () => {
  const { repository, add } = world();
  try {
    const cheap = add('epl', 1200);
    setPriceTarget(repository, { editionId: 'epl', maxPrice: 1500 });
    assert.deepEqual(
      recordDealAlerts(repository, { at: AT }).map((item) => item.offerId),
      [cheap],
    );
    assert.deepEqual(recordDealAlerts(repository, { at: AT + 60_000 }), []);
    const [target] = listPriceTargets(repository);
    setPriceTargetActive(repository, target.id, false);
    assert.deepEqual(ids(repository), []);
    assert.equal(repository.database.prepare('SELECT count(*) AS n FROM deal_alerts').get().n, 1);
    // Changing the target (a lower one) is not a new announcement for the same offer.
    setPriceTarget(repository, { editionId: 'epl', maxPrice: 1300 });
    assert.deepEqual(recordDealAlerts(repository, { at: AT + 120_000 }), []);
  } finally {
    repository.close();
  }
});

test('targets validate their input and go with their edition', () => {
  const { repository } = world();
  try {
    assert.throws(() => setPriceTarget(repository, { maxPrice: 100 }), /EDITION_OR_WORK_REQUIRED/);
    assert.throws(
      () => setPriceTarget(repository, { editionId: 'epl', workId: 'w', maxPrice: 100 }),
      /EDITION_OR_WORK_REQUIRED/,
    );
    assert.throws(
      () => setPriceTarget(repository, { editionId: 'epl', maxPrice: 0 }),
      /INVALID_TARGET_PRICE/,
    );
    assert.throws(
      () => setPriceTarget(repository, { editionId: 'epl', maxPrice: 1_000_000 }),
      /INVALID_TARGET_PRICE/,
    );
    assert.throws(
      () => setPriceTarget(repository, { editionId: 'nope', maxPrice: 100 }),
      /EDITION_NOT_FOUND/,
    );
    setPriceTarget(repository, { editionId: 'epl', maxPrice: 1500 });
    setPriceTarget(repository, { editionId: 'epl', maxPrice: 1700 });
    assert.deepEqual(
      listPriceTargets(repository).map((row) => [row.title, row.maxPrice, row.active]),
      [['Mort', 1700, true]],
    );
    repository.database.prepare('DELETE FROM editions WHERE id=?').run('epl');
    assert.equal(listPriceTargets(repository).length, 0);
  } finally {
    repository.close();
  }
});

test('editing the price keeps a target switched off; the API keeps the state when "active" is absent', async () => {
  const { repository } = world();
  try {
    setPriceTarget(repository, { editionId: 'epl', maxPrice: 1500 });
    const [target] = listPriceTargets(repository);
    setPriceTargetActive(repository, target.id, false);
    // Only the price changes: the target stays off.
    const edited = setPriceTarget(repository, {
      editionId: 'epl',
      maxPrice: 1700,
      active: undefined,
    });
    assert.equal(edited.active, false);
    assert.deepEqual(
      listPriceTargets(repository).map((row) => [row.maxPrice, row.active]),
      [[1700, false]],
    );
    // An explicit "active" does switch it.
    assert.equal(
      setPriceTarget(repository, { editionId: 'epl', maxPrice: 1700, active: true }).active,
      true,
    );
    // A new target starts active.
    assert.equal(setPriceTarget(repository, { workId: 'w', maxPrice: 900 }).active, true);
  } finally {
    repository.close();
  }
});

test('an offer that is already a deal only gets the target mark and the order of the others is unchanged', () => {
  const { repository, add } = world();
  try {
    // A market around 40 zł makes the 18 zł copy a deal on its own.
    for (let i = 0; i < 5; i++) {
      const id = add('epl', 4000 + i * 100);
      if (i < 3)
        repository.database
          .prepare("UPDATE offers SET availability='sold', availability_changed_at=? WHERE id=?")
          .run(hoursAgo(24 * (10 - i)), id);
    }
    const deal = add('epl', 1800);
    const before = listDeals(repository, { at: AT }).items;
    const orderBefore = before.map((item) => item.offerId);
    assert.ok(orderBefore.includes(deal));
    setPriceTarget(repository, { editionId: 'epl', maxPrice: 2000 });
    const after = listDeals(repository, { at: AT }).items;
    assert.equal(after.find((item) => item.offerId === deal).target.maxPrice, 2000);
    assert.deepEqual(
      after.filter((item) => orderBefore.includes(item.offerId)).map((item) => item.offerId),
      orderBefore,
    );
  } finally {
    repository.close();
  }
});
