import assert from 'node:assert/strict';
import test from 'node:test';

import { dataHealth } from '../data-health.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-21T12:00:00Z');

test('data health counts new offers per week, missing ISBN and price, and flags a silent drop', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    let n = 0;
    const add = (source, daysAgo, { isbn = null, price = 2000 } = {}) =>
      repo.upsertOffer({
        id: `o${n++}`,
        source,
        normalizedUrl: `https://example.test/${n}`,
        originalTitle: 'Mort',
        currentPrice: price,
        observedIsbn: isbn,
        firstSeenAt: new Date(NOW - daysAgo * DAY).toISOString(),
      });
    // Vinted: 30 new offers the week before, only 5 this week.
    for (let i = 0; i < 30; i++) add('Vinted', 10, { isbn: i % 2 ? '9780306406157' : null });
    for (let i = 0; i < 5; i++) add('Vinted', 2, { price: null });
    // Empik: steady.
    for (let i = 0; i < 25; i++) add('Empik', 10);
    for (let i = 0; i < 24; i++) add('Empik', 3);
    const health = dataHealth(repo, { now: NOW });
    const vinted = health.sources.find((row) => row.source === 'Vinted');
    const empik = health.sources.find((row) => row.source === 'Empik');
    assert.equal(vinted?.total, 35);
    assert.equal(vinted?.newLast7d, 5);
    assert.equal(vinted?.newPrevious7d, 30);
    assert.equal(vinted?.suspectedDrop, true);
    assert.equal(vinted?.withoutPrice, Math.round((5 / 35) * 1000) / 1000);
    assert.equal(empik?.suspectedDrop, false);
    assert.equal(new Set(health.sources.map((row) => row.source)).size, 2);
  } finally {
    repo.close();
  }
});

test('a source with a small previous week is never flagged', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.upsertOffer({
      id: 'x',
      source: 'Lagano',
      normalizedUrl: 'https://example.test/x',
      originalTitle: 'Mort',
      firstSeenAt: new Date(NOW - 10 * DAY).toISOString(),
    });
    assert.equal(dataHealth(repo, { now: NOW }).sources[0].suspectedDrop, false);
  } finally {
    repo.close();
  }
});

test('GET /api/data-health and /api/deal-forecasts answer over HTTP on an empty catalogue', async () => {
  const { createLocalAppServer } = await import('../local-app.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await (await fetch(`${base}/api/data-health`)).json();
    assert.deepEqual(health.sources, []);
    const forecasts = await (await fetch(`${base}/api/deal-forecasts`)).json();
    assert.equal(forecasts.announced.n, 0);
    assert.equal(forecasts.brier, null);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repo.close();
  }
});
