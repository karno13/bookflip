import assert from 'node:assert/strict';
import test from 'node:test';

import { FLAG, hunterPack, isbn13, PACK_VERSION } from '../hunter-pack.mjs';
import { hunterLookup } from '../hunter.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { setPriceTarget } from '../price-targets.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

function catalogue() {
  const repository = new SqliteCatalogRepository(':memory:');
  let n = 0;
  const offer = (price, { isbn = null, edition = null, sold = false } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: isbn ? 'Zabójca z sąsiedztwa' : 'Mort',
      currentPrice: price,
      conditionClass: 'good',
      availability: sold ? 'sold' : 'available',
      firstSeenAt: daysAgo(20),
      observedIsbn: isbn,
    });
    if (sold)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(5), id);
    if (edition)
      repository.assignOfferToEdition(id, edition, {
        id: 'm' + id,
        method: 'manual',
        status: 'active',
      });
  };
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  const mort = repository.createEditionForISBN({
    workId: 'w',
    isbn: '9788373196032',
    title: 'Mort',
  });
  for (const price of [4000, 4200, 4400, 3900])
    offer(price, { edition: mort.id, sold: price === 3900 });
  // An edition with nothing to say: no prices, no target, no copy.
  repository.createWork({ id: 'q', title: 'Cisza', authors: [] });
  repository.createEditionForISBN({ workId: 'q', isbn: '9788324031511', title: 'Cisza' });
  // Outside the catalogue: only offers carrying the ISBN.
  for (const price of [3000, 3200, 3400]) offer(price, { isbn: '978-0-306-40615-7' });
  return { repository, mort };
}

test('isbn13 turns any valid spelling into the barcode form', () => {
  assert.equal(isbn13('0-306-40615-2'), '9780306406157');
  assert.equal(isbn13('9780306406157'), '9780306406157');
  assert.equal(isbn13('9791032305690'), '9791032305690');
  assert.equal(isbn13('123'), null);
});

test('the pack holds catalogue and outside ISBNs with what Łowca would say, and agrees with it', () => {
  const { repository } = catalogue();
  try {
    setPriceTarget(repository, { workId: 'w', maxPrice: 2500 });
    const pack = hunterPack(repository, { at: AT });
    assert.equal(pack.version, PACK_VERSION);
    assert.equal(pack.generatedAt, new Date(AT).toISOString());
    assert.deepEqual(pack.verdicts.at(-1), [null, 'drogo', 'Drogo: wycena jest niższa']);
    const byIsbn = new Map(pack.entries.map((entry) => [entry[0], entry]));
    // Every catalogue ISBN is kept, also one with nothing to say (Cisza).
    assert.deepEqual([...byIsbn.keys()].sort(), [
      '9780306406157',
      '9788324031511',
      '9788373196032',
    ]);
    assert.deepEqual(byIsbn.get('9788324031511').slice(1, 9), [
      'Cisza',
      null,
      null,
      null,
      null,
      null,
      0,
      0,
    ]);
    const mort = byIsbn.get('9788373196032');
    const live = hunterLookup(repository, '9788373196032', { at: AT });
    assert.equal(mort[1], 'Mort');
    assert.equal(mort[2], live.value.estimate);
    assert.equal(mort[5], live.value.confidence);
    assert.equal(mort[6], 2500, 'the owner’s target');
    assert.equal(mort[8], 0);
    assert.equal(mort[12], 3);
    assert.equal(mort[13], 4000);
    assert.equal(mort[14], null);
    const outside = byIsbn.get('9780306406157');
    const lookup = hunterLookup(repository, '9780306406157', { at: AT });
    assert.equal(outside[8], FLAG.outside);
    assert.equal(outside[1], 'Zabójca z sąsiedztwa');
    assert.equal(outside[2], lookup.market.value.estimate);
    assert.equal(outside[14], 3);
    assert.equal(outside[9], null, 'no sale chance without own listings');
  } finally {
    repository.close();
  }
});

test('a removed work valued from offers with its ISBN is flagged both ways', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'z', title: 'Zabójca', authors: [] });
    repository.createEditionForISBN({ workId: 'z', isbn: '9780306406157', title: 'Zabójca' });
    repository.database
      .prepare('INSERT INTO removed_works(work_id, title, removed_at) VALUES (?,?,?)')
      .run('z', 'Zabójca', daysAgo(1));
    for (const [index, price] of [3000, 3300].entries())
      repository.upsertOffer({
        id: `r${index}`,
        source: 'Vinted',
        normalizedUrl: `https://example.test/r${index}`,
        originalTitle: 'Zabójca',
        currentPrice: price,
        availability: 'available',
        firstSeenAt: daysAgo(3),
        observedIsbn: '9780306406157',
      });
    const [entry] = hunterPack(repository, { at: AT }).entries;
    assert.equal(entry[8], FLAG.removed | FLAG.isbnOffers);
    assert.equal(entry[1], 'Zabójca', 'the catalogue title, not the sellers’');
    assert.equal(entry[14], 2);
  } finally {
    repository.close();
  }
});

test('GET /api/hunter/pack answers the pack without a network request', async () => {
  const { repository } = catalogue();
  const server = createLocalAppServer({ catalogProvider: () => ({ repository }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/hunter/pack`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.entries.length, 3);
    assert.equal(body.worthUpToShare, 0.75);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repository.close();
  }
});
