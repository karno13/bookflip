import assert from 'node:assert/strict';
import test from 'node:test';

import { listDeals } from '../deals.mjs';
import { MIN_VOTES, rejectionHabits, wilsonLower } from '../triage-learning.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/** A market around 40 zł; `deal` lists an offer at 15 zł of a given publisher, dismissed or not. */
function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  let n = 0;
  const edition = (publisher) => {
    const id = `e${n++}`;
    repository.createEdition({ id, workId: 'w', title: 'Mort', publisher });
    return id;
  };
  const offer = (editionId, price, availability, soldDaysAgo = null) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: id,
      currentPrice: price,
      conditionClass: 'good',
      availability,
      firstSeenAt: daysAgo(30),
    });
    if (soldDaysAgo != null)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(soldDaysAgo), id);
    repository.assignOfferToEdition(id, editionId, {
      id: 'm' + id,
      method: 'manual',
      status: 'active',
    });
    return id;
  };
  const dismiss = (offerId) =>
    repository.database
      .prepare(
        "INSERT INTO deal_triage(offer_id, state, until, price_at, created_at, updated_at) VALUES (?, 'dismissed', NULL, 1500, ?, ?)",
      )
      .run(offerId, daysAgo(5), daysAgo(5));
  return { repository, edition, offer, dismiss };
}

test('Wilson: 3 of 3 is not enough, 12 of 14 is', () => {
  assert.ok(wilsonLower(3, 3) < 0.6);
  assert.ok(wilsonLower(12, 14) >= 0.6);
});

test('a publisher dismissed often enough is a habit; too few votes or mixed votes are not', () => {
  const { repository, edition, offer, dismiss } = world();
  const bad = edition('Zły Wydawca');
  const fine = edition('Dobry Wydawca');
  for (let i = 0; i < MIN_VOTES + 2; i++) dismiss(offer(bad, 1500, 'available'));
  for (let i = 0; i < 3; i++) dismiss(offer(fine, 1500, 'available')); // too few votes
  const habits = rejectionHabits(repository, { at: AT });
  assert.deepEqual(
    habits.map((habit) => habit.value),
    ['Zły Wydawca'],
  );
  assert.equal(habits[0].dismissed, MIN_VOTES + 2);
});

test('the mark never changes the list, and a watched seller is exempt', () => {
  const { repository, edition, offer, dismiss } = world();
  const bad = edition('Zły Wydawca');
  for (let i = 0; i < 4; i++) offer(bad, 4000 + i * 100, 'sold', 10 + i); // market ~40 zł
  for (let i = 0; i < MIN_VOTES + 2; i++) dismiss(offer(bad, 4000, 'sold', 3));
  const live = offer(bad, 1500, 'available');
  const items = listDeals(repository, { at: AT }).items;
  assert.equal(items.find((item) => item.offerId === live).habit?.label, 'Zły Wydawca');
  const order = items.map((item) => item.offerId);
  rejectionHabits(repository, { at: AT });
  assert.deepEqual(
    listDeals(repository, { at: AT }).items.map((item) => item.offerId),
    order,
  );
  repository.database.prepare("UPDATE offers SET seller_id='S' WHERE id=?").run(live);
  repository.database
    .prepare("INSERT INTO watched_sellers(source, seller_id, created_at) VALUES ('Vinted','S',?)")
    .run(daysAgo(1));
  assert.equal(
    listDeals(repository, { at: AT }).items.find((item) => item.offerId === live).habit,
    null,
  );
});

test('an old verdict is not a vote; a dismissed offer later bought counts once, as kept', () => {
  const { repository, edition, offer, dismiss } = world();
  const bad = edition('Zły Wydawca');
  for (let i = 0; i < MIN_VOTES + 2; i++) dismiss(offer(bad, 4000, 'sold', 3));
  const old = offer(bad, 4000, 'sold', 3);
  repository.database
    .prepare("INSERT INTO deal_verdicts(offer_id, verdict, created_at) VALUES (?, 'good', ?)")
    .run(old, daysAgo(200));
  assert.equal(rejectionHabits(repository, { at: AT })[0].kept, 0);
  const changed = offer(bad, 4000, 'sold', 3);
  dismiss(changed);
  repository.database
    .prepare("INSERT INTO deal_verdicts(offer_id, verdict, created_at) VALUES (?, 'good', ?)")
    .run(changed, daysAgo(1));
  const [habit] = rejectionHabits(repository, { at: AT });
  assert.equal(habit.dismissed, MIN_VOTES + 2);
  assert.equal(habit.kept, 1);
});
