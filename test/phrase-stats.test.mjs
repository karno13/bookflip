import assert from 'node:assert/strict';
import test from 'node:test';

import {
  disabledPhrases,
  enabledPhrases,
  phraseStats,
  setPhraseDisabled,
} from '../phrase-stats.mjs';
import { createScanScheduler, saveSniper, SNIPER_BATCH } from '../scan-schedule.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

/** Offers found by phrases: [phrase, how many, first seen days ago, isbn]. */
function world(rows) {
  const repository = new SqliteCatalogRepository(':memory:');
  let n = 0;
  for (const [phrase, count, age, isbn = null] of rows)
    for (let i = 0; i < count; i++) {
      const id = `o${n++}`;
      repository.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: `${phrase} ${id}`,
        currentPrice: 2000,
        observedIsbn: isbn,
        firstSeenAt: daysAgo(age + (i % 4)),
        lastSeenAt: daysAgo(0),
        matchedQueries: [phrase],
      });
    }
  return repository;
}

test('statistics per phrase come out at known numbers, with noise and too-little-data verdicts', () => {
  const repository = world([
    ['Warhammer', 12, 1], // 12 new offers over 4 days, no deal: noise
    ['Pratchett', 4, 1], // few offers: ok
    ['Nowa fraza', 3, 1, '9780306406157'], // active for only 3 days... see below
    ['Stara', 5, 40], // nothing new in the window
  ]);
  try {
    const stats = phraseStats(repository, { at: AT });
    const by = Object.fromEntries(stats.items.map((item) => [item.phrase, item]));
    assert.equal(by.Warhammer.newOffers, 12);
    assert.equal(by.Warhammer.verdict, 'szum');
    assert.equal(by.Warhammer.withoutIsbnShare, 1);
    assert.equal(by.Pratchett.verdict, 'ok');
    assert.equal(by['Nowa fraza'].withoutIsbnShare, 0);
    assert.equal(by.Stara.newOffers, 0);
    assert.equal(by.Stara.offers, 5);
    assert.equal(by.Stara.verdict, 'za_malo_danych');
    // The noisy one is listed first.
    assert.equal(stats.items[0].phrase, 'Warhammer');
  } finally {
    repository.close();
  }
});

test('switching a phrase off is reversible, case- and accent-insensitive, and rejects an empty phrase', () => {
  const repository = world([['Warhammer', 1, 1]]);
  try {
    assert.deepEqual(enabledPhrases(repository, ['Warhammer', 'Pratchett']), [
      'Warhammer',
      'Pratchett',
    ]);
    setPhraseDisabled(repository, 'warhammer', true);
    assert.deepEqual(disabledPhrases(repository), ['warhammer']);
    assert.deepEqual(enabledPhrases(repository, ['Warhammer', 'Pratchett']), ['Pratchett']);
    assert.equal(phraseStats(repository, { at: AT }).items[0].disabled, true);
    setPhraseDisabled(repository, 'WARHAMMER', false);
    assert.deepEqual(enabledPhrases(repository, ['Warhammer']), ['Warhammer']);
    assert.throws(() => setPhraseDisabled(repository, '  ', true), /INVALID_PHRASE/);
  } finally {
    repository.close();
  }
});

test('the sniper skips switched-off phrases and still fills its batch', async () => {
  const repository = world([]);
  try {
    setPhraseDisabled(repository, 'Szum', true);
    const calls = [];
    saveSniper(repository, { enabled: true, everyMinutes: 20 });
    const targets = Array.from({ length: SNIPER_BATCH + 2 }, (_, i) => ({
      phrase: i === 0 ? 'Szum' : `Tytuł ${i}`,
    }));
    const scheduler = createScanScheduler({
      getRepository: () => repository,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => targets,
      now: () => AT,
    });
    await scheduler.tick();
    const sniper = calls.find((call) => call.mode === 'newest');
    assert.ok(sniper, JSON.stringify(calls));
    assert.ok(!sniper.queries.includes('Szum'));
    assert.equal(sniper.queries.length, SNIPER_BATCH);
  } finally {
    repository.close();
  }
});
