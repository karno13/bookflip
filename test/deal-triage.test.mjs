import assert from 'node:assert/strict';
import test from 'node:test';

import { dayPlan } from '../day-plan.mjs';
import { clearDealTriage, reactionMedianMinutes, setDealTriage } from '../deal-triage.mjs';
import { listDeals } from '../deals.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/** An edition with a market around 40 zł and two deals on it (18 zł and 19 zł). */
function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  let n = 0;
  const add = (price, { soldAfter = null, age = 20 } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `Mort ${id}`,
      currentPrice: price,
      conditionClass: 'good',
      availability: soldAfter == null ? 'available' : 'sold',
      firstSeenAt: daysAgo(age),
      favouriteCount: 3,
    });
    if (soldAfter != null)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(age - soldAfter), id);
    repository.assignOfferToEdition(id, 'e', { id: 'm' + id, method: 'manual', status: 'active' });
    return id;
  };
  for (let i = 0; i < 5; i++) add(4000 + i * 100, { soldAfter: i < 3 ? 3 + i : null });
  const cheap = add(1800, { age: 1 });
  const other = add(1900, { age: 1 });
  return { repository, cheap, other };
}
const ids = (result) => result.items.filter((item) => !item.hidden).map((item) => item.offerId);

test('a dismissed deal is hidden, the ranking of the others is untouched, and clearing brings it back', () => {
  const { repository, cheap, other } = world();
  try {
    const before = listDeals(repository, { at: AT });
    const order = before.items.map((item) => item.offerId);
    assert.deepEqual(ids(before).sort(), [cheap, other].sort());
    setDealTriage(repository, cheap, 'dismissed', { now: () => new Date(AT) });
    const after = listDeals(repository, { at: AT });
    // Same order for everything, only the visibility differs.
    assert.deepEqual(
      after.items.map((item) => item.offerId),
      order,
    );
    assert.deepEqual(ids(after), [other]);
    assert.deepEqual(after.triage.counts, { new: 1, snoozed: 0, seen: 0, dismissed: 1 });
    clearDealTriage(repository, cheap);
    assert.deepEqual(ids(listDeals(repository, { at: AT })).sort(), [cheap, other].sort());
    assert.throws(() => clearDealTriage(repository, cheap), /TRIAGE_NOT_FOUND/);
  } finally {
    repository.close();
  }
});

test('a deal that was set aside comes back when its price falls below the price it had then', () => {
  const { repository, cheap } = world();
  try {
    setDealTriage(repository, cheap, 'seen', { now: () => new Date(AT) });
    assert.equal(
      listDeals(repository, { at: AT }).items.find((i) => i.offerId === cheap).hidden,
      true,
    );
    repository.database.prepare('UPDATE offers SET current_price=1500 WHERE id=?').run(cheap);
    const back = listDeals(repository, { at: AT }).items.find((i) => i.offerId === cheap);
    assert.equal(back.hidden, false);
    assert.equal(back.triage.returned, 'price_drop');
  } finally {
    repository.close();
  }
});

test('a snoozed deal returns exactly at its time; a past or invalid time is refused', () => {
  const { repository, cheap } = world();
  try {
    const until = new Date(AT + DAY).toISOString();
    setDealTriage(repository, cheap, 'snoozed', { until, now: () => new Date(AT) });
    const state = (at) => listDeals(repository, { at }).items.find((i) => i.offerId === cheap);
    assert.equal(state(AT + DAY - 1).hidden, true);
    const back = state(AT + DAY);
    assert.equal(back.hidden, false);
    assert.equal(back.triage.returned, 'snooze_over');
    assert.throws(
      () =>
        setDealTriage(repository, cheap, 'snoozed', {
          until: new Date(AT - 1).toISOString(),
          now: () => new Date(AT),
        }),
      /INVALID_SNOOZE_TIME/,
    );
    assert.throws(() => setDealTriage(repository, cheap, 'nope'), /INVALID_TRIAGE_STATE/);
    assert.throws(() => setDealTriage(repository, 'missing', 'seen'), /OFFER_NOT_FOUND/);
  } finally {
    repository.close();
  }
});

test('the day plan leaves out hidden deals, and the reaction time is the median alerted → seen', () => {
  const { repository, cheap, other } = world();
  try {
    const alert = (offerId, minutesAgo) =>
      repository.database
        .prepare(
          'INSERT INTO deal_alerts(offer_id, price, worth, saving, chance, alerted_at) VALUES (?,?,?,?,?,?)',
        )
        .run(offerId, 1800, 4000, 2200, 0.5, new Date(AT - minutesAgo * 60_000).toISOString());
    alert(cheap, 30);
    alert(other, 10);
    assert.equal(reactionMedianMinutes(repository), null);
    setDealTriage(repository, cheap, 'seen', { now: () => new Date(AT) });
    assert.equal(reactionMedianMinutes(repository), 30);
    setDealTriage(repository, other, 'dismissed', { now: () => new Date(AT) });
    // Two looks: 30 and 10 minutes; the median of the sorted pair is the lower middle (10).
    assert.equal(reactionMedianMinutes(repository), 10);
    const deals = dayPlan(repository, { at: AT }).cards.find((card) => card.id === 'deals');
    assert.equal(deals, undefined);
  } finally {
    repository.close();
  }
});

test('the state goes with the offer', () => {
  const { repository, cheap } = world();
  try {
    setDealTriage(repository, cheap, 'seen', { now: () => new Date(AT) });
    repository.database.prepare('DELETE FROM offers WHERE id=?').run(cheap);
    assert.equal(repository.database.prepare('SELECT count(*) AS n FROM deal_triage').get().n, 0);
  } finally {
    repository.close();
  }
});
