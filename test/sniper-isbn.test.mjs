import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import {
  createScanScheduler,
  getScanSchedule,
  saveSniper,
  SNIPER_BATCH,
} from '../scan-schedule.mjs';
import { isbnTargets } from '../market-index.mjs';
import { rejectionReason } from '../marketplaces.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');

test('ISBN targets: valuable editions with a sure enough valuation, highest first, as ISBN-13', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    let n = 0;
    const offers = (editionId, prices) => {
      for (const price of prices) {
        const id = `o${n++}`;
        repo.upsertOffer({
          id,
          source: 'Vinted',
          normalizedUrl: `https://www.vinted.pl/items/${n}-x`,
          originalTitle: 'x',
          currentPrice: price,
          conditionClass: 'good',
          availability: 'sold',
          firstSeenAt: new Date(AT - 30 * DAY).toISOString(),
        });
        repo.database
          .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
          .run(new Date(AT - 5 * DAY).toISOString(), id);
        repo.assignOfferToEdition(id, editionId, {
          id: 'm' + id,
          method: 'manual',
          status: 'active',
        });
      }
    };
    repo.createWork({ id: 'a', title: 'Mort', authors: ['Terry Pratchett'] });
    const dear = repo.createEditionForISBN({ workId: 'a', isbn: '9788373196032', title: 'Mort' });
    offers(dear.id, [20000, 21000, 19000, 20500, 19500, 20000, 20800, 19900]);
    repo.createWork({ id: 'b', title: 'Legion', authors: [] });
    const mid = repo.createEditionForISBN({ workId: 'b', isbn: '9788375780307', title: 'Legion' });
    offers(mid.id, [6000, 6100, 5900, 6200, 6000, 5800, 6100, 6000]);
    repo.createWork({ id: 'c', title: 'Tanie', authors: [] });
    const cheap = repo.createEditionForISBN({ workId: 'c', isbn: '9788324031511', title: 'Tanie' });
    offers(cheap.id, [1000, 1100, 900, 1000, 1050, 950, 1000, 1000]);
    const targets = isbnTargets(repo, { at: AT });
    assert.deepEqual(
      targets.map((target) => target.phrase),
      ['9788373196032', '9788375780307'],
    );
    assert.deepEqual(
      isbnTargets(repo, { at: AT, limit: 1 }).map((target) => target.phrase),
      ['9788373196032'],
    );
  } finally {
    repo.close();
  }
});

test('a search by ISBN keeps listings whose title does not carry the number', () => {
  const task = {
    source: 'Vinted',
    mode: 'discovery',
    title: '9788373196032',
    category: '9788373196032',
    searchQuery: '9788373196032',
    language: 'pl',
  };
  assert.equal(rejectionReason(task, 'Diablo. Wojna grzechów, stan bdb', {}), null);
  // Not a book is still left out, and a word phrase still needs its words.
  assert.equal(rejectionReason(task, 'Figurka Warhammer plastikowa', {}), 'product');
  assert.equal(
    rejectionReason(
      { ...task, title: 'Mort', category: 'Mort', searchQuery: 'Mort' },
      'Kuchnia polska',
      {},
    ),
    'topic',
  );
});

test('one batch slot asks the valuable editions by ISBN, in turn; the batch size stays', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    saveSniper(repo, { enabled: true, everyMinutes: 20 });
    const calls = [];
    let clock = Date.parse('2026-11-23T12:00:00Z');
    const scheduler = createScanScheduler({
      getRepository: () => repo,
      runScan: async (input) => (calls.push(input), 200),
      getTargets: () => Array.from({ length: 14 }, (_, i) => ({ phrase: `Tytuł ${i}` })),
      getBoostTargets: () => [],
      getPriorityPhrases: () => [],
      getYieldTargets: () => [],
      getIsbnTargets: () => ['9788373196032', '9788375780307'].map((phrase) => ({ phrase })),
      now: () => clock,
    });
    for (let run = 0; run < 3; run++) {
      await scheduler.tick();
      clock += 20 * 60_000;
    }
    assert.ok(calls.every((call) => call.queries.length === SNIPER_BATCH));
    assert.deepEqual(
      calls.map((call) => call.queries.at(-1)),
      ['9788373196032', '9788375780307', '9788373196032'],
    );
    assert.equal(getScanSchedule(repo).sniper.isbnCursor, 1);
  } finally {
    repo.close();
  }
});

test('a one-word title takes its universe instead of the surname when its listings say so', async () => {
  const { learnedPhrases } = await import('../market-index.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const work = (id, title, authors, isbn, universe, listings) => {
      repo.createWork({ id, title, authors });
      const edition = repo.createEditionForISBN({ workId: id, isbn, title });
      if (universe)
        repo.database
          .prepare(
            "INSERT INTO edition_series(edition_id, name, normalized_name, kind, source) VALUES (?,?,?,'universe','test')",
          )
          .run(edition.id, universe, universe.toLowerCase());
      listings.forEach((listing, index) => {
        const offerId = `${id}-${index}`;
        repo.upsertOffer({
          id: offerId,
          source: 'Vinted',
          normalizedUrl: `https://www.vinted.pl/items/${id.length}${index}${isbn.slice(-3)}-x`,
          originalTitle: listing,
          currentPrice: 3000,
        });
        repo.assignOfferToEdition(offerId, edition.id, {
          id: 'm' + offerId,
          method: 'manual',
          status: 'active',
        });
      });
    };
    work(
      'durotan',
      'Durotan : oficjalny prequel filmu',
      ['Christie Golden'],
      '9788375780307',
      'Warcraft',
      [
        'Warcraft Durotan',
        'Durotan Warcraft książka',
        'World of Warcraft Durotan',
        'Durotan - Christie Golden',
        'Warcraft: Durotan',
      ],
    );
    // Sellers of this one write the author: the surname stays.
    work('mort', 'Mort', ['Terry Pratchett'], '9788373196032', 'Świat Dysku', [
      'Mort Pratchett',
      'Terry Pratchett Mort',
      'Mort - Pratchett',
      'Mort Terry Pratchett',
      'Pratchett Mort Świat Dysku',
    ]);
    // Too few listings to learn from.
    work('illidan', 'Illidan', ['William King'], '9788324031511', 'Warcraft', [
      'Warcraft Illidan',
      'Illidan Warcraft',
    ]);
    assert.deepEqual([...learnedPhrases(repo)], [['durotan', 'Durotan Warcraft']]);
  } finally {
    repo.close();
  }
});

test('with several universes the one the listings use wins, not the first by name', async () => {
  const { learnedPhrases } = await import('../market-index.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    repo.createWork({ id: 'arthas', title: 'Arthas', authors: ['Christie Golden'] });
    const edition = repo.createEditionForISBN({
      workId: 'arthas',
      isbn: '9788375780307',
      title: 'Arthas',
    });
    for (const name of ['Blizzard Legends', 'Warcraft'])
      repo.database
        .prepare(
          "INSERT INTO edition_series(edition_id, name, normalized_name, kind, source) VALUES (?,?,?,'universe','test')",
        )
        .run(edition.id, name, name.toLowerCase());
    [
      'Warcraft Arthas',
      'Arthas World of Warcraft',
      'Arthas warcraft',
      'Arthas przebudzenie Warcraft',
      'Arthas',
    ].forEach((title, index) => {
      repo.upsertOffer({
        id: `a${index}`,
        source: 'Vinted',
        normalizedUrl: `https://www.vinted.pl/items/7${index}-x`,
        originalTitle: title,
        currentPrice: 3000,
      });
      repo.assignOfferToEdition(`a${index}`, edition.id, {
        id: `ma${index}`,
        method: 'manual',
        status: 'active',
      });
    });
    assert.deepEqual([...learnedPhrases(repo)], [['arthas', 'Arthas Warcraft']]);
  } finally {
    repo.close();
  }
});
