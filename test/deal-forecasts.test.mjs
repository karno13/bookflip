import assert from 'node:assert/strict';
import test from 'node:test';

import { dealForecasts } from '../deal-forecasts.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-21T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * DAY).toISOString();

test('settled deals are compared with never-announced offers of the same weeks', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
    repo.createEdition({ id: 'e', workId: 'w', title: 'Mort' });
    let n = 0;
    const add = (
      age,
      { soldAfterDays = null, alert = undefined, checked = true, active = true } = {},
    ) => {
      const id = `o${n++}`;
      repo.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: 'Mort',
        currentPrice: 2000,
        availability: soldAfterDays == null ? 'available' : 'sold',
        firstSeenAt: daysAgo(age),
      });
      if (soldAfterDays != null)
        repo.database
          .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
          .run(daysAgo(age - soldAfterDays), id);
      if (checked && soldAfterDays == null)
        repo.database
          .prepare('UPDATE offers SET availability_checked_at=? WHERE id=?')
          .run(daysAgo(age - 36), id);
      repo.assignOfferToEdition(id, 'e', {
        id: `m${id}`,
        method: 'manual',
        status: active ? 'active' : 'superseded',
      });
      if (alert !== undefined)
        repo.database
          .prepare(
            'INSERT INTO deal_alerts(offer_id, price, worth, saving, chance, alerted_at) VALUES (?,?,?,?,?,?)',
          )
          .run(id, 2000, 4000, 2000, alert, daysAgo(age));
      return id;
    };
    // Four deals announced 40 days ago: three sold within a week, one still listed.
    add(40, { soldAfterDays: 3, alert: 0.6 });
    add(40, { soldAfterDays: 5, alert: 0.6 });
    add(40, { soldAfterDays: 7, alert: 0.6 });
    add(40, { alert: 0.6 });
    // Ten ordinary offers of the same weeks: two sold within the horizon, one only after 35 days.
    for (let i = 0; i < 7; i++) add(40);
    add(40, { soldAfterDays: 10 });
    add(40, { soldAfterDays: 20 });
    add(40, { soldAfterDays: 35 });
    // A deal announced yesterday is not settled yet and is left out.
    add(1, { alert: 0.5 });
    // Edge cases: a sale on day 31 does not count; an offer never re-checked is unresolved; a deal
    // whose assignment was withdrawn and a deal without a forecast chance behave as documented.
    add(40, { soldAfterDays: 31, alert: 0.6 });
    add(40, { alert: 0.6, checked: false });
    add(40, { soldAfterDays: 2, alert: 0.6, active: false });
    add(40, { soldAfterDays: 2, alert: null });
    const report = dealForecasts(repo, { at: NOW });
    // 4 first deals + day 31 + unchecked + chance=null (the withdrawn one is left out).
    assert.deepEqual(report.announced, { n: 7, sold: 4, unresolved: 1, soldRate: 0.571 });
    assert.deepEqual(report.control, { n: 10, sold: 2, unresolved: 0, soldRate: 0.2 });
    assert.equal(report.caveat, 'price_correlated_control');
    // Six forecasts of 0.6: three sold, one sold on day 31 and one unchecked count as not sold.
    assert.equal(report.meanForecast, 0.6);
    assert.equal(report.brier, Math.round(((3 * 0.16 + 3 * 0.36) / 6 + 0) * 1000) / 1000);
  } finally {
    repo.close();
  }
});

test('with no settled deals the report is empty, not an error', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const report = dealForecasts(repo, { at: NOW });
    assert.equal(report.announced.n, 0);
    assert.equal(report.control.n, 0);
    assert.equal(report.brier, null);
  } finally {
    repo.close();
  }
});
