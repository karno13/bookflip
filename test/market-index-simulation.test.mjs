import assert from 'node:assert/strict';
import test from 'node:test';

import { editionLiquidity, HORIZON_DAYS, liquidityModel } from '../market-index.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');

/** Small seeded generator, so the simulated market is the same on every run. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A market with a known truth: every listing sells at a constant daily hazard. The scanner only
 * sees a sale at the next scan (every `scanHours`), so each sale time is rounded up to a scan.
 */
function simulate({ hazard, listings = 300, scanHours = 6, seed = 7 }) {
  const random = mulberry32(seed);
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort' });
  const scan = (scanHours * DAY) / 24;
  for (let i = 0; i < listings; i++) {
    const start = AT - random() * 150 * DAY;
    const saleAfter = -Math.log(1 - random()) / hazard;
    const saleAt = start + saleAfter * DAY;
    const sold = saleAt < AT;
    const id = `o${i}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: 'Mort',
      currentPrice: 2000,
      availability: sold ? 'sold' : 'available',
      firstSeenAt: new Date(start).toISOString(),
    });
    if (sold)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(new Date(Math.ceil(saleAt / scan) * scan).toISOString(), id);
    repository.assignOfferToEdition(id, 'e', { id: `m${id}`, method: 'manual', status: 'active' });
  }
  return repository;
}

for (const hazard of [0.01, 0.03, 0.08]) {
  test(`the 30-day sale chance recovers the true value for a daily hazard of ${hazard}`, () => {
    const repository = simulate({ hazard });
    try {
      const truth = 1 - Math.exp(-HORIZON_DAYS * hazard);
      const estimate = editionLiquidity(liquidityModel(repository.database, AT), 'e').chance;
      assert.ok(
        Math.abs(estimate - truth) < 0.08,
        `estimate ${estimate} against the true chance ${truth.toFixed(3)}`,
      );
    } finally {
      repository.close();
    }
  });
}

test('a coarse scan (a day) does not distort the estimate beyond the tolerance', () => {
  const repository = simulate({ hazard: 0.03, scanHours: 24, seed: 11 });
  try {
    const truth = 1 - Math.exp(-HORIZON_DAYS * 0.03);
    const estimate = editionLiquidity(liquidityModel(repository.database, AT), 'e').chance;
    assert.ok(Math.abs(estimate - truth) < 0.1, `${estimate} against ${truth.toFixed(3)}`);
  } finally {
    repository.close();
  }
});
