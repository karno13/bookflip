import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { backtestValuations, formatReport } from '../scripts/valuation-backtest.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

test('backtest predicts the latest sales from earlier ones, per confidence level', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
    repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Proszynski' });
    for (let i = 0; i < 6; i++) {
      const id = `o${i}`;
      repository.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: id,
        currentPrice: 1000,
        conditionClass: 'good',
        availability: 'sold',
        firstSeenAt: daysAgo(100 - i),
      });
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(50 - i), id);
      repository.assignOfferToEdition(id, 'e', {
        id: 'm_' + id,
        method: 'manual',
        status: 'active',
      });
    }
    const report = backtestValuations(repository.database, { minSales: 4, latest: 2 });
    assert.equal(report.editions, 1);
    assert.equal(report.cases, 2);
    const current = report.variants.current;
    assert.equal(current.high.n, 2);
    assert.ok(current.high.medianError < 0.05, String(current.high.medianError));
    assert.equal(current.low.n, 0);
    assert.equal(current.low.medianError, null);
    assert.match(formatReport(report), /\[current\]/);
    assert.equal(backtestValuations(repository.database, { minSales: 7 }).cases, 0);
  } finally {
    repository.close();
  }
});
