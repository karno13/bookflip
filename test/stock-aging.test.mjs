import assert from 'node:assert/strict';
import test from 'node:test';

import { listingCard } from '../listing-card.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { listEdition, moveStock, undoStock } from '../stock.mjs';
import { agingReport, keepPrice, markRepriced, stockAging } from '../stock-aging.mjs';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-01T10:00:00Z');
const clock = (days) => () => new Date(T0 + days * DAY);
const tiers = { quick: 1700, middle: 2000 };
const listed = (extra = {}) => ({
  status: 'listed',
  listedAt: new Date(T0).toISOString(),
  ...extra,
});

test('no reminder for a copy not older than the median, or not listed', () => {
  assert.equal(stockAging(listed(), { medianDays: 20, tiers }, T0 + 20 * DAY), null);
  assert.equal(
    stockAging(listed({ status: 'sold' }), { medianDays: 20, tiers }, T0 + 40 * DAY),
    null,
  );
  assert.equal(stockAging(listed(), { medianDays: null, tiers }, T0 + 40 * DAY), null);
  const due = stockAging(listed(), { medianDays: 20, tiers }, T0 + 34 * DAY);
  assert.deepEqual(due, { daysListed: 34, expectedDays: 20, suggestion: 1700, reason: null });
});

test('suggestion is the quick tier; no valuation says so', () => {
  const now = T0 + 34 * DAY;
  assert.equal(stockAging(listed(), { medianDays: 20, tiers }, now).suggestion, 1700);
  const none = stockAging(listed(), { medianDays: 20, tiers: null }, now);
  assert.equal(none.suggestion, null);
  assert.equal(none.reason, 'za_malo_ofert');
});

test('after repricing the reminder is silent for 7 days; keep is silent until the market price changes', () => {
  const market = { medianDays: 20, tiers };
  const repricedAt = new Date(T0 + 30 * DAY).toISOString();
  assert.equal(stockAging(listed({ repricedAt }), market, T0 + 36 * DAY), null);
  assert.notEqual(stockAging(listed({ repricedAt }), market, T0 + 37 * DAY), null);
  const snoozed = { snoozedAt: new Date(T0 + 25 * DAY).toISOString(), snoozedMarket: 2000 };
  assert.equal(stockAging(listed(snoozed), market, T0 + 90 * DAY), null);
  const moved = { medianDays: 20, tiers: { quick: 1500, middle: 1800 } };
  assert.notEqual(stockAging(listed(snoozed), moved, T0 + 90 * DAY), null);
  const blind = { snoozedAt: snoozed.snoozedAt, snoozedMarket: null };
  assert.equal(stockAging(listed(blind), { medianDays: 20, tiers: null }, T0 + 90 * DAY), null);
  assert.notEqual(stockAging(listed(blind), market, T0 + 90 * DAY), null);
});

test('keep tolerates small market drift (under 1 zl and 5%) and a repricing date in the future is ignored', () => {
  const snoozed = { snoozedAt: new Date(T0 + 25 * DAY).toISOString(), snoozedMarket: 2000 };
  const now = T0 + 90 * DAY;
  const at = (middle) =>
    stockAging(listed(snoozed), { medianDays: 20, tiers: { quick: 1500, middle } }, now);
  assert.equal(at(2099), null);
  assert.equal(at(1901), null);
  assert.notEqual(at(2100), null);
  assert.notEqual(at(1900), null);
  // Cheap book: 1 zl floor beats 5%.
  const cheap = { snoozedAt: snoozed.snoozedAt, snoozedMarket: 500 };
  const cheapAt = (middle) =>
    stockAging(listed(cheap), { medianDays: 20, tiers: { quick: 400, middle } }, now);
  assert.equal(cheapAt(599), null);
  assert.notEqual(cheapAt(600), null);
  const future = new Date(now + 3 * DAY).toISOString();
  assert.notEqual(stockAging(listed({ repricedAt: future }), { medianDays: 20, tiers }, now), null);
});

function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  return repository;
}

test('report ignores hidden copies and gives no reminder without market data', () => {
  const repository = world();
  try {
    listEdition(repository, 'e', { now: clock(0) });
    const hidden = listEdition(repository, 'e', { now: clock(0) });
    undoStock(repository, hidden.id, { now: clock(1) });
    const report = agingReport(repository, { now: clock(200) });
    assert.deepEqual(report.reminders, []);
    assert.deepEqual(report.calibration, { enough: false });
  } finally {
    repository.database.close();
  }
});

test('end to end: a long-listed copy of an edition with Vinted sales gets the quick tier of the listing card', () => {
  const AT = Date.parse('2026-11-20T12:00:00Z');
  const ago = (days) => new Date(AT - days * DAY).toISOString();
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'w2', title: 'Mort', authors: ['Pratchett, Terry'] });
    const edition = repository.createEditionForISBN({
      workId: 'w2',
      isbn: '9788373196032',
      title: 'Mort',
      publisher: 'Prószyński',
      publicationYear: 2003,
    });
    const add = (n, price, soldAfter = null) => {
      const id = `o${n}`;
      repository.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: 'Mort',
        currentPrice: price,
        conditionClass: 'good',
        availability: soldAfter == null ? 'available' : 'sold',
        firstSeenAt: ago(20),
        favouriteCount: 3,
      });
      if (soldAfter != null)
        repository.database
          .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
          .run(ago(20 - soldAfter), id);
      repository.assignOfferToEdition(id, edition.id, {
        id: 'm' + id,
        method: 'manual',
        status: 'active',
      });
    };
    for (let i = 0; i < 5; i++) add(i, 4000 + i * 100, 2 + i);
    add(5, 4500);
    add(6, 4200);
    const card = listingCard(repository, edition.id, { at: AT });
    const quick = card.tiers.find((t) => t.id === 'szybko').price;
    const item = listEdition(repository, edition.id, { now: () => new Date(AT - 60 * DAY) });
    const { reminders } = agingReport(repository, { now: () => new Date(AT) });
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].itemId, item.id);
    assert.equal(reminders[0].suggestion, quick);
    assert.equal(reminders[0].reason, null);
    assert.ok(reminders[0].daysListed > reminders[0].expectedDays);
  } finally {
    repository.database.close();
  }
});

test('repriced and keep write only dates; hidden or non-listed copies are 404', () => {
  const repository = world();
  try {
    const { id } = listEdition(repository, 'e', { now: clock(0) });
    const done = markRepriced(repository, id, { now: clock(40) });
    assert.equal(done.repricedAt, new Date(T0 + 40 * DAY).toISOString());
    const kept = keepPrice(repository, id, { now: clock(41) });
    const row = repository.database.prepare('SELECT * FROM stock_items WHERE id=?').get(id);
    assert.equal(row.aging_snoozed_at, kept.snoozedAt);
    assert.equal(row.aging_snoozed_market, null);
    markRepriced(repository, id, { now: clock(50) });
    const after = repository.database
      .prepare('SELECT aging_snoozed_at FROM stock_items WHERE id=?')
      .get(id);
    assert.equal(after.aging_snoozed_at, null);
    moveStock(repository, id, 'sold', { now: clock(51) });
    assert.throws(
      () => markRepriced(repository, id),
      (e) => e.statusCode === 404,
    );
    const other = listEdition(repository, 'e', { now: clock(52) });
    undoStock(repository, other.id, { now: clock(53) });
    assert.throws(
      () => keepPrice(repository, other.id),
      (e) => e.statusCode === 404,
    );
  } finally {
    repository.database.close();
  }
});

test('calibration needs 20 sold copies: 19 say only not enough data, 20 give a number with tries', () => {
  const repository = world();
  try {
    for (let i = 0; i < 19; i += 1) {
      const { id } = listEdition(repository, 'e', { now: clock(i) });
      moveStock(repository, id, 'sold', { now: clock(i + 5) });
    }
    assert.deepEqual(agingReport(repository, { now: clock(100) }).calibration, { enough: false });
    const { id } = listEdition(repository, 'e', { now: clock(30) });
    moveStock(repository, id, 'sold', { now: clock(70) });
    // Listed 100 days ago and still on sale: an unsuccessful try.
    listEdition(repository, 'e', { now: clock(0) });
    const calibration = agingReport(repository, { now: clock(100) }).calibration;
    assert.equal(calibration.enough, true);
    assert.equal(calibration.tries, 21);
    assert.equal(calibration.sold30, 19);
    assert.ok(calibration.low < calibration.own && calibration.own < calibration.high);
    assert.equal(typeof calibration.index, 'number');
  } finally {
    repository.database.close();
  }
});

test('routes: aging report, repriced and keep resolve without clashing with other stock routes', async () => {
  const { apiRoutes } = await import('../api-routes.mjs');
  const repository = world();
  try {
    const { id } = listEdition(repository, 'e');
    const call = (method, path) => {
      const found = apiRoutes.match(method, path);
      assert.ok(found?.handler, `${method} ${path}`);
      return found.handler({ repo: repository, method, input: {}, params: found.params });
    };
    assert.deepEqual(call('GET', '/api/stock/aging').calibration, { enough: false });
    assert.ok(call('POST', `/api/stock/${id}/repriced`).repricedAt);
    assert.ok(call('POST', `/api/stock/${id}/keep`).snoozedAt);
  } finally {
    repository.database.close();
  }
});
