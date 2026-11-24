import assert from 'node:assert/strict';
import test from 'node:test';

import { dayPlan } from '../day-plan.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { todaySummary } from '../today.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/** Two editions: "Mort" sells fast and has no live listing; "Eryk" has a deal listed now. */
function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  for (const [id, title] of [
    ['mort', 'Mort'],
    ['eryk', 'Eryk'],
  ]) {
    repository.createWork({ id: 'w_' + id, title, authors: ['Pratchett, Terry'] });
    repository.createEdition({ id: 'e_' + id, workId: 'w_' + id, title, publisher: 'Prószyński' });
  }
  let n = 0;
  const add = (edition, price, { soldAfter = null, age = 20 } = {}) => {
    const id = `${edition}_${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `${edition} ${id}`,
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
    repository.assignOfferToEdition(id, 'e_' + edition, {
      id: 'm_' + id,
      method: 'manual',
      status: 'active',
    });
    return id;
  };
  // Mort: six sold within days, none listed.
  for (let i = 0; i < 6; i++) add('mort', 4000 + i * 100, { soldAfter: 2 + i });
  // Eryk: ordinary listings around 40 zł plus one at 18 zł (the deal).
  for (let i = 0; i < 5; i++) add('eryk', 4000 + i * 100, { soldAfter: i < 2 ? 10 : null });
  add('eryk', 1800, { age: 1 });
  return repository;
}

test('the plan lists deals, fast markets without supply and leaves out what is empty', () => {
  const repository = world();
  try {
    const plan = dayPlan(repository, { at: AT });
    const ids = plan.cards.map((card) => card.id);
    assert.ok(ids.includes('deals'), ids.join());
    assert.ok(ids.includes('fast-markets'), ids.join());
    // Nothing waits in the review queue: no such card.
    assert.ok(!ids.includes('unlock'));
    const deals = plan.cards.find((card) => card.id === 'deals');
    assert.equal(deals.go.view, 'deals');
    assert.ok(deals.entries.length >= 1 && deals.entries.length <= 3);
    assert.equal(deals.entries[0].price, 1800);
    const markets = plan.cards.find((card) => card.id === 'fast-markets');
    assert.deepEqual(
      markets.entries.map((entry) => entry.title),
      ['Mort'],
    );
  } finally {
    repository.close();
  }
});

test('an empty catalogue has an empty plan, and Dziś carries it', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    assert.deepEqual(dayPlan(repository, { at: AT }).cards, []);
    const summary = todaySummary(repository, { since: null, sources: [] });
    assert.deepEqual(summary.plan.cards, []);
  } finally {
    repository.close();
  }
});

test('a catalogue with the sniper off gets one card to switch it on; switched on, the card is gone', async () => {
  const { saveSniper } = await import('../scan-schedule.mjs');
  const { planHtml } = await import('../app/views/today.js');
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'w', title: 'Mort', authors: [] });
    repository.createEditionForISBN({ workId: 'w', isbn: '9788373196032', title: 'Mort' });
    const cards = dayPlan(repository, { at: AT }).cards;
    assert.deepEqual(
      cards.map((card) => card.id),
      ['sniper-off'],
    );
    const html = planHtml(
      { cards },
      (value) => String(value),
      (value) => String(value),
    );
    assert.match(html, /data-plan-sniper-on/);
    assert.match(html, /Snajper jest wyłączony/);
    saveSniper(repository, { enabled: true });
    assert.deepEqual(dayPlan(repository, { at: AT }).cards, []);
    // A removed work alone is nothing to watch.
    saveSniper(repository, { enabled: false });
    repository.database
      .prepare('INSERT INTO removed_works(work_id, title, removed_at) VALUES (?,?,?)')
      .run('w', 'Mort', '2026-11-20T00:00:00Z');
    assert.deepEqual(dayPlan(repository, { at: AT }).cards, []);
  } finally {
    repository.close();
  }
});
