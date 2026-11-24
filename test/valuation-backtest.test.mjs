import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { MIN_SAMPLES, summarizeRatios, valuationBacktest } from '../valuation-backtest.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/** One edition; `sales` offers of the given price sold on consecutive days 80, 79, ... days ago. */
function setup(sales, price = 1000) {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  let n = 0;
  const add = (offerPrice, { first = 120, sold = null } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: id,
      currentPrice: offerPrice,
      conditionClass: 'good',
      availability: sold == null ? 'available' : 'sold',
      firstSeenAt: daysAgo(first),
    });
    repository.database
      .prepare(
        'INSERT OR IGNORE INTO offer_price_history(offer_id,price,observed_at) VALUES(?,?,?)',
      )
      .run(id, offerPrice, daysAgo(first));
    if (sold != null)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(sold), id);
    repository.assignOfferToEdition(id, 'e', { id: 'm_' + id, method: 'manual', status: 'active' });
    return id;
  };
  for (let i = 0; i < sales; i++) add(price, { sold: 80 - i });
  return { repository, add };
}

test('below 20 samples there are no figures, only "za mało danych"', () => {
  const { repository } = setup(MIN_SAMPLES - 1);
  try {
    const result = valuationBacktest(repository, { at: AT });
    assert.equal(result.overall.samples, MIN_SAMPLES - 1);
    assert.equal(result.overall.enough, false);
    assert.equal(result.overall.message, 'Za mało danych');
    assert.equal(result.overall.median, null);
    assert.equal(result.overall.inBandShare, undefined);
  } finally {
    repository.close();
  }
});

test('a market priced consistently gives ratios near 1 and every sale inside the band', () => {
  const { repository } = setup(25);
  try {
    const result = valuationBacktest(repository, { at: AT });
    assert.equal(result.overall.samples, 25);
    assert.ok(
      result.overall.median >= 0.9 && result.overall.median <= 1.2,
      String(result.overall.median),
    );
    assert.equal(result.overall.inBandShare, 1);
    assert.equal(
      result.overall.buckets.reduce((sum, b) => sum + b.count, 0),
      25,
    );
  } finally {
    repository.close();
  }
});

test('nothing from after a sale leaks into its valuation, and an offer never prices itself', () => {
  const base = setup(25);
  const withFuture = setup(25);
  try {
    // Listed and sold only after every sale above (the latest was 56 days ago): the future.
    for (let i = 0; i < 6; i++) withFuture.add(9000, { first: 30, sold: 20 - i });
    withFuture.add(9500, { first: 10 });
    const a = valuationBacktest(base.repository, { at: AT, days: 90 });
    const b = valuationBacktest(withFuture.repository, { at: AT, days: 90 });
    // Same 25 early sales (window 60 days still covers them): their ratios are unchanged.
    assert.equal(a.overall.samples, 25);
    const early = valuationBacktest(withFuture.repository, { at: AT - 40 * DAY, days: 90 });
    assert.deepEqual(early.overall, a.overall);
    assert.ok(b.overall.samples > a.overall.samples);
    // A lone sale has nothing to be compared with: its own price must not be its valuation.
    const lone = setup(1);
    assert.equal(valuationBacktest(lone.repository, { at: AT }).overall.samples, 0);
    lone.repository.close();
  } finally {
    base.repository.close();
    withFuture.repository.close();
  }
});

test('a systematic error is reproduced and split by confidence', () => {
  // Valuation base: 6 old sales at 1000. 20 later sales at 2000 are 2x the valuation.
  const { repository, add } = setup(0);
  try {
    for (let i = 0; i < 6; i++) add(1000, { first: 200, sold: 150 - i });
    for (let i = 0; i < 20; i++) add(2000, { first: 30, sold: 30 });
    const result = valuationBacktest(repository, { at: AT, days: 60 });
    assert.equal(result.overall.samples, 20);
    assert.ok(
      result.overall.median > 1.7 && result.overall.median < 2.3,
      String(result.overall.median),
    );
    assert.equal(result.overall.inBandShare, 0);
    const groups = Object.values(result.byConfidence).reduce((sum, g) => sum + g.samples, 0);
    assert.equal(groups, 20);
  } finally {
    repository.close();
  }
});

test('summarizeRatios counts band edges inclusively', () => {
  const ratios = Array.from({ length: 20 }, (_, i) => (i < 10 ? 0.8 : 1.2));
  assert.equal(summarizeRatios(ratios).inBandShare, 1);
});

test('the backtest only reads', () => {
  const { repository } = setup(25);
  try {
    const before = repository.database.prepare('PRAGMA data_version').get();
    valuationBacktest(repository, { at: AT });
    assert.deepEqual(repository.database.prepare('PRAGMA data_version').get(), before);
  } finally {
    repository.close();
  }
});

/** Deterministic dataset: `editions` editions, `perEdition` offers each, mixed states and price changes. */
function bigSetup(editions, perEdition) {
  const repository = new SqliteCatalogRepository(':memory:');
  let seed = 12345;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const insertHistory = repository.database.prepare(
    'INSERT OR IGNORE INTO offer_price_history(offer_id,price,observed_at) VALUES(?,?,?)',
  );
  const setChanged = repository.database.prepare(
    'UPDATE offers SET availability_changed_at=? WHERE id=?',
  );
  for (let e = 0; e < editions; e++) {
    repository.createWork({ id: `w${e}`, title: `Książka ${e}`, authors: ['Autor'] });
    repository.createEdition({
      id: `e${e}`,
      workId: `w${e}`,
      title: `Książka ${e}`,
      publisher: 'P',
    });
    const base = 1500 + Math.floor(random() * 3000);
    for (let i = 0; i < perEdition; i++) {
      const id = `o${e}_${i}`;
      const first = 100 + Math.floor(random() * 150);
      const roll = random();
      const sold = roll < 0.45 ? Math.floor(random() * 85) : null;
      const price = Math.round(base * (0.6 + random() * 0.9));
      repository.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: id,
        currentPrice: price,
        conditionClass: 'good',
        availability: sold != null ? 'sold' : roll < 0.6 ? 'unavailable' : 'available',
        firstSeenAt: daysAgo(first),
      });
      insertHistory.run(id, Math.round(price * 1.2), daysAgo(first));
      insertHistory.run(id, price, daysAgo(first - 20));
      if (sold != null) setChanged.run(daysAgo(sold), id);
      else if (roll < 0.6) setChanged.run(daysAgo(90 + Math.floor(random() * 30)), id);
      repository.assignOfferToEdition(id, `e${e}`, {
        id: `m_${id}`,
        method: 'manual',
        status: 'active',
      });
    }
  }
  return repository;
}

test('a few thousand offers are backtested in reasonable time, and the second call is cached', () => {
  const repository = bigSetup(100, 30);
  try {
    const started = Date.now();
    const first = valuationBacktest(repository, { at: AT });
    const took = Date.now() - started;
    // Figures of the pre-optimisation implementation (full history scan, filter per pair) on this dataset.
    assert.equal(first.overall.samples, 1362);
    assert.equal(first.byConfidence.high.samples, 681);
    assert.deepEqual(
      [first.overall.median, first.overall.p25, first.overall.p75, first.overall.inBandShare],
      [1.152, 0.897, 1.422, 0.399],
    );
    assert.ok(took < 15_000, `${took} ms`);
    const again = Date.now();
    assert.deepEqual(valuationBacktest(repository, { at: AT + 1000 }), first);
    assert.ok(Date.now() - again < Math.max(200, took / 5));
    // New data invalidates the cache.
    repository.database
      .prepare("UPDATE offers SET current_price=current_price+1 WHERE id='o0_0'")
      .run();
    assert.equal(valuationBacktest(repository, { at: AT }).at, new Date(AT).toISOString());
  } finally {
    repository.close();
  }
});

test('an offer gone with no usable time never counts as a live price', () => {
  const { repository, add } = setup(25);
  try {
    const before = valuationBacktest(repository, { at: AT });
    for (const [availability, changed] of [
      ['sold', null],
      ['unavailable', 'not a date'],
      ['reserved', null],
    ]) {
      const id = add(50_000, { first: 130 });
      repository.database
        .prepare('UPDATE offers SET availability=?, availability_changed_at=? WHERE id=?')
        .run(availability, changed, id);
    }
    const after = valuationBacktest(repository, { at: AT + 120_000 });
    assert.deepEqual(after.overall, before.overall);
  } finally {
    repository.close();
  }
});

test('the result also splits by the size of the valuation and by sales behind the valuation', () => {
  const result = valuationBacktest(new SqliteCatalogRepository(':memory:'));
  assert.deepEqual(
    result.byPrice.map((group) => group.label),
    ['do 15 zł', '15–30 zł', '30–60 zł', 'od 60 zł'],
  );
  assert.deepEqual(
    result.bySales.map((group) => group.samples),
    [0, 0],
  );
});
