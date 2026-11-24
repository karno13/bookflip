import assert from 'node:assert/strict';
import test from 'node:test';

import { hunterLookup, priceVerdict, worthUpTo } from '../hunter.mjs';
import { setPriceTarget } from '../price-targets.mjs';
import { addStock } from '../stock.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();
const ISBN13 = '9788373196032';

function shop() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  const edition = repository.createEditionForISBN({
    workId: 'w',
    isbn: ISBN13,
    title: 'Mort',
    publisher: 'Prószyński',
  });
  let n = 0;
  const add = (price, soldAfter = null) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: 'Mort',
      currentPrice: price,
      conditionClass: 'good',
      availability: soldAfter == null ? 'available' : 'sold',
      firstSeenAt: daysAgo(20),
      favouriteCount: 3,
    });
    if (soldAfter != null)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(20 - soldAfter), id);
    repository.assignOfferToEdition(id, edition.id, {
      id: 'm' + id,
      method: 'manual',
      status: 'active',
    });
  };
  for (let i = 0; i < 5; i++) add(4000 + i * 100, 2 + i);
  add(4500);
  add(4200);
  return repository;
}

test('verdict thresholds run from worth it to too dear', () => {
  assert.equal(priceVerdict(0.3).verdict, 'warto');
  assert.equal(priceVerdict(0.5).verdict, 'warto');
  assert.equal(priceVerdict(0.7).verdict, 'raczej_tak');
  assert.equal(priceVerdict(0.9).verdict, 'granica');
  assert.equal(priceVerdict(1.4).verdict, 'drogo');
});

test('an ISBN in any spelling finds the edition, its value, speed and listings; a price gets a verdict', () => {
  const repository = shop();
  try {
    const found = hunterLookup(repository, '978-83-7319-603-2', { price: 1500, at: AT });
    assert.equal(found.found, true);
    assert.equal(found.edition.title, 'Mort');
    assert.equal(found.isbn, ISBN13);
    assert.ok(found.value.estimate > 3000, String(found.value.estimate));
    assert.ok(found.liquidity.chance > 0);
    assert.equal(found.listed.count, 2);
    assert.equal(found.listed.cheapest, 4200);
    assert.equal(found.verdict.verdict, 'warto');
    // Without a price there is no verdict.
    assert.equal(hunterLookup(repository, ISBN13, { at: AT }).verdict, null);
    // A price above the valuation is too dear.
    assert.equal(
      hunterLookup(repository, ISBN13, { price: 9000, at: AT }).verdict.verdict,
      'drogo',
    );
  } finally {
    repository.close();
  }
});

test('unknown and invalid ISBNs say so, without a network request', () => {
  const repository = shop();
  try {
    assert.deepEqual(hunterLookup(repository, '9780306406157', { at: AT }), {
      found: false,
      reason: 'not_in_catalogue',
      isbn: '9780306406157',
    });
    assert.deepEqual(hunterLookup(repository, 'abc'), {
      found: false,
      reason: 'invalid_isbn',
      isbn: null,
    });
  } finally {
    repository.close();
  }
});

test('„opłaca się do” is the highest whole-złoty price still at most 75% of the valuation', () => {
  assert.equal(worthUpTo(4000), 3000);
  assert.equal(worthUpTo(4150), 3100);
  assert.equal(worthUpTo(100), null);
  assert.equal(worthUpTo(null), null);
});

/** Unassigned offers whose own listing carries `isbn` (sold ones sold `soldDaysAgo` days ago). */
function addIsbnOffers(repository, isbn, prices, { sold = 0, set = false } = {}) {
  prices.forEach((price, index) => {
    const id = `x${isbn}-${index}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: index % 2 ? 'Zabójca z sąsiedztwa pocket' : 'Zabójca z sąsiedztwa',
      currentPrice: price,
      conditionClass: 'good',
      availability: index < sold ? 'sold' : 'available',
      firstSeenAt: daysAgo(15),
      observedIsbn: index === 0 ? isbn.replace(/^(\d{3})(\d{2})/, '$1-$2-') : isbn,
    });
    if (index < sold)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(5), id);
    if (set)
      repository.database
        .prepare('INSERT INTO offer_sets(offer_id, created_at, updated_at) VALUES (?,?,?)')
        .run(id, daysAgo(1), daysAgo(1));
  });
}

test('an ISBN outside the catalogue is valued from the offers carrying it, without assigning them', () => {
  const repository = shop();
  try {
    const isbn = '9780306406157';
    addIsbnOffers(repository, isbn, [3000, 3200, 3400, 2800, 3100], { sold: 2 });
    const result = hunterLookup(repository, '0-306-40615-2', { price: 1000, at: AT });
    assert.equal(result.found, false);
    assert.equal(result.reason, 'not_in_catalogue');
    assert.equal(result.market.offers, 5);
    assert.equal(result.market.title, 'Zabójca z sąsiedztwa');
    assert.equal(result.market.listed.count, 3);
    assert.equal(result.market.listed.cheapest, 2800);
    assert.ok(result.market.value.estimate > 2000, String(result.market.value.estimate));
    assert.equal(result.verdict.verdict, 'warto');
    assert.equal(result.worthUpTo, worthUpTo(result.market.value.estimate));
    const matches = repository.database.prepare('SELECT count(*) AS n FROM offer_matches').get();
    assert.equal(matches.n, 7, 'only the catalogue edition’s own offers are assigned');
    // An offer with the ISBN that the owner assigned to another edition is not counted.
    const elsewhere = hunterLookup(repository, ISBN13, { at: AT }).edition.id;
    repository.assignOfferToEdition(`x${isbn}-4`, elsewhere, {
      id: 'elsewhere',
      method: 'manual',
      status: 'active',
    });
    assert.equal(hunterLookup(repository, isbn, { at: AT }).market.offers, 4);
    // The other way round: an offer listing the ISBN-10 is found by its ISBN-13.
    addIsbnOffers(repository, '0306406152', [2500]);
    assert.equal(hunterLookup(repository, isbn, { at: AT }).market.offers, 5);
    // A set's price is not one book's: a set alone gives no market.
    addIsbnOffers(repository, '9788375780307', [9000], { set: true });
    assert.deepEqual(hunterLookup(repository, '9788375780307', { at: AT }), {
      found: false,
      reason: 'not_in_catalogue',
      isbn: '9788375780307',
    });
  } finally {
    repository.close();
  }
});

test('a catalogue book says the owner’s target, copies in stock and a removal from the catalogue', () => {
  const repository = shop();
  try {
    const edition = hunterLookup(repository, ISBN13, { at: AT }).edition;
    assert.equal(hunterLookup(repository, ISBN13, { at: AT }).target, null);
    setPriceTarget(repository, { workId: 'w', maxPrice: 2500 });
    const under = hunterLookup(repository, ISBN13, { price: 2400, at: AT });
    assert.equal(under.target, 2500);
    assert.equal(under.targetMet, true);
    assert.equal(hunterLookup(repository, ISBN13, { price: 2600, at: AT }).targetMet, false);
    assert.equal(under.inStock, 0);
    addStock(repository, { editionId: edition.id });
    assert.equal(hunterLookup(repository, ISBN13, { at: AT }).inStock, 1);
    assert.equal(under.removed, false);
    assert.equal(under.valueBasis, 'edition');
    repository.database
      .prepare('INSERT INTO removed_works(work_id, title, removed_at) VALUES (?,?,?)')
      .run('w', 'Mort', daysAgo(1));
    assert.equal(hunterLookup(repository, ISBN13, { at: AT }).removed, true);
  } finally {
    repository.close();
  }
});

test('a catalogue edition without assigned prices is valued from offers with its ISBN', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'z', title: 'Zabójca z sąsiedztwa', authors: [] });
    repository.createEditionForISBN({ workId: 'z', isbn: '9780306406157', title: 'Zabójca' });
    addIsbnOffers(repository, '9780306406157', [3000, 3200, 3400]);
    const result = hunterLookup(repository, '9780306406157', { price: 1000, at: AT });
    assert.equal(result.found, true);
    assert.equal(result.valueBasis, 'isbn_offers');
    assert.ok(result.value.estimate > 2000);
    assert.equal(result.listed.count, 3);
    assert.equal(result.verdict.verdict, 'warto');
  } finally {
    repository.close();
  }
});

test('GET /api/hunter takes the shelf price in zł', async () => {
  const repository = shop();
  const server = createLocalAppServer({ catalogProvider: () => ({ repository }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const body = await (await fetch(`${base}/api/hunter?isbn=${ISBN13}&price=15,00`)).json();
    assert.equal(body.found, true);
    assert.equal(body.price, 1500);
    assert.equal(body.verdict.verdict, 'warto');
    assert.equal((await (await fetch(`${base}/api/hunter?isbn=x`)).json()).reason, 'invalid_isbn');
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repository.close();
  }
});
