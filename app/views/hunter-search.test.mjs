import assert from 'node:assert/strict';
import test from 'node:test';

import { hunterPack } from '../../hunter-pack.mjs';
import { setPriceTarget } from '../../price-targets.mjs';
import { SqliteCatalogRepository } from '../../sqlite-catalog-repository.mjs';
import { packLookup } from './hunter-pack.js';
import { cheatSheet, cheatSheetMarkup, foldText, looksLikeIsbn, packSearch, searchMarkup, sortName } from './hunter-search.js';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();
const helpers = { escapeHtml: (value) => String(value).replace(/</g, '&lt;'), money: (grosze) => `${grosze / 100} zł` };

function pack() {
  const repository = new SqliteCatalogRepository(':memory:');
  let n = 0;
  const offer = (edition, price, { sold = false, isbn = null, title = 'x' } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({ id, source: 'Vinted', normalizedUrl: `https://example.test/${id}`, originalTitle: title, currentPrice: price, conditionClass: 'good', availability: sold ? 'sold' : 'available', firstSeenAt: daysAgo(20), observedIsbn: isbn, favouriteCount: 3 });
    if (sold) repository.database.prepare('UPDATE offers SET availability_changed_at=? WHERE id=?').run(daysAgo(5), id);
    if (edition) repository.assignOfferToEdition(id, edition, { id: 'm' + id, method: 'manual', status: 'active' });
  };
  repository.createWork({ id: 'smoki', title: 'Smoki jesiennego zmierzchu', authors: ['Weis, Margaret', 'Hickman, Tracy'] });
  const old = repository.createEditionForISBN({ workId: 'smoki', isbn: '9788370001230', title: 'Smoki jesiennego zmierzchu' });
  repository.database.prepare('UPDATE editions SET publisher=?, publication_year=? WHERE id=?').run('Zysk i S-ka', 1997, old.id);
  for (const price of [6000, 6400, 5800, 6200, 6100, 5900, 6300, 6000]) offer(old.id, price, { sold: price < 6100 });
  repository.database.prepare("INSERT INTO edition_series(edition_id, name, normalized_name, kind, source) VALUES (?,?,?,'universe','test')").run(old.id, 'Dragonlance', 'dragonlance');
  repository.database.prepare("INSERT INTO work_labels(work_id, label, normalized_label, created_at) VALUES ('smoki','Moje fantasy','moje fantasy',?)").run(daysAgo(1));
  const fresh = repository.createEditionForISBN({ workId: 'smoki', isbn: '9788375780307', title: 'Smoki jesiennego zmierzchu' });
  repository.database.prepare('UPDATE editions SET publisher=?, publication_year=? WHERE id=?').run('Insignis', 2021, fresh.id);
  repository.createWork({ id: 'mort', title: 'Mort', authors: ['Terry Pratchett'] });
  const mort = repository.createEditionForISBN({ workId: 'mort', isbn: '9788373196032', title: 'Mort' });
  setPriceTarget(repository, { workId: 'mort', maxPrice: 2500 });
  repository.createWork({ id: 'gone', title: 'Smocza lanca', authors: [] });
  repository.createEditionForISBN({ workId: 'gone', isbn: '9788324031511', title: 'Smocza lanca' });
  repository.database.prepare('INSERT INTO removed_works(work_id, title, removed_at) VALUES (?,?,?)').run('gone', 'Smocza lanca', daysAgo(1));
  for (const price of [3000, 3200, 3400]) offer(null, price, { isbn: '9780306406157', title: 'Hickman Smocze skrzydła' });
  return { built: hunterPack(repository, { at: AT }), mort };
}

test('foldText and looksLikeIsbn tell a title from an ISBN', () => {
  assert.equal(foldText('Łowca SMOKÓW: tom 1'), 'lowca smokow tom 1');
  assert.ok(looksLikeIsbn('978-83-7319-603-2'));
  assert.ok(looksLikeIsbn('ISBN 83-7319-603-X'));
  assert.ok(!looksLikeIsbn('smoki 1997'));
  assert.ok(!looksLikeIsbn('  '));
  // Titles made of digits are searched, not checked as an ISBN.
  assert.ok(!looksLikeIsbn('1984'));
  assert.ok(!looksLikeIsbn('451'));
  assert.ok(looksLikeIsbn('8373196032'));
  assert.equal(sortName('Weis, Margaret, Hickman, Tracy'), 'Weis');
  assert.equal(sortName('Terry Pratchett, Neil Gaiman'), 'Pratchett');
});

test('the pack carries authors, publisher, year and work for every catalogue ISBN', () => {
  const { built } = pack();
  const entry = built.entries.find((row) => row[0] === '9788370001230');
  assert.deepEqual(entry.slice(15), ['Weis, Margaret, Hickman, Tracy', 'Zysk i S-ka', 1997, 'Smoki jesiennego zmierzchu', 'Dragonlance · Moje fantasy']);
  assert.deepEqual(built.entries.find((row) => row[0] === '9780306406157').slice(15), ['', null, null, null, '']);
  // The offline card now shows who wrote it and which edition it is.
  const offline = packLookup(built, '9788370001230');
  assert.deepEqual([offline.edition.authors, offline.edition.publisher, offline.edition.year], [['Weis, Margaret, Hickman, Tracy'], 'Zysk i S-ka', 1997]);
});

test('a title search lists every edition by every word, without diacritics, best first', () => {
  const { built } = pack();
  const { rows, more } = packSearch(built, 'smoki jesien', { price: 1500 });
  assert.equal(more, 0);
  assert.deepEqual(rows.map((row) => [row.isbn, row.publisher, row.year]), [
    ['9788370001230', 'Zysk i S-ka', 1997],
    ['9788375780307', 'Insignis', 2021],
  ]);
  // The valued edition gets a verdict on the shelf price and its „opłaca się do”.
  assert.equal(rows[0].verdict.verdict, 'warto');
  assert.ok(rows[0].worthUpTo > 0);
  assert.equal(rows[1].verdict, null);
  // Author and publisher words count too; the ISBN-less noise word does not match.
  assert.deepEqual(packSearch(built, 'hickman zysk').rows.map((row) => row.isbn), ['9788370001230']);
  assert.deepEqual(packSearch(built, 'smoki xyz').rows, []);
  // An author's catalogue book comes before a seller's title that carries the author's name.
  assert.deepEqual(packSearch(built, 'hickman').rows.map((row) => row.isbn), ['9788370001230', '9788375780307', '9780306406157']);
  // Too short to search.
  assert.deepEqual(packSearch(built, 'sm').rows, []);
});

test('catalogue books come before removed works and books seen only in offers', () => {
  const { built } = pack();
  const rows = packSearch(built, 'smo').rows;
  assert.deepEqual(rows.at(-1).outside, true);
  const removed = rows.find((row) => row.isbn === '9788324031511');
  assert.equal(removed.removed, true);
  assert.ok(rows.indexOf(removed) > rows.findIndex((row) => row.isbn === '9788370001230'));
  const html = searchMarkup({ rows, more: 0 }, 'smo', helpers);
  assert.match(html, /data-hunter-pick="9780306406157"/);
  assert.match(html, /Spoza katalogu/);
  assert.match(html, /Usunięte z katalogu/);
  assert.match(searchMarkup({ rows: [], more: 0 }, 'zzz <b>', helpers), /Nic nie pasuje do „zzz &lt;b>”/);
  assert.equal(searchMarkup({ rows: [], more: 0 }, 'ab', helpers), '');
});

test('the target counts in the search: a price under it is a buy', () => {
  const { built } = pack();
  const [mort] = packSearch(built, 'mort pratchett', { price: 2000 }).rows;
  assert.equal(mort.target, 2500);
  assert.equal(mort.targetMet, true);
  assert.match(searchMarkup({ rows: [mort], more: 0 }, 'mort', helpers), /W Twoim celu/);
});

test('the cheat sheet keeps sure valuations and targets, never removed or outside books', () => {
  const { built } = pack();
  const sheet = cheatSheet(built);
  assert.deepEqual(sheet.rows.map((row) => row.isbn), ['9788370001230', '9788373196032']);
  assert.equal(sheet.rows[1].limit, 2500);
  // By author: Pratchett before Weis.
  assert.deepEqual(cheatSheet(built, { sort: 'author' }).rows.map((row) => row.isbn), ['9788373196032', '9788370001230']);
  // The universe of the edition and the owner's label of the work are searched, not shown.
  assert.deepEqual(cheatSheet(built, { query: 'dragonlance' }).rows.map((row) => row.isbn), ['9788370001230']);
  assert.deepEqual(packSearch(built, 'moje fantasy').rows.map((row) => row.isbn), ['9788370001230', '9788375780307']);
  // Narrowed with the words of a title search.
  assert.deepEqual(cheatSheet(built, { query: 'pratch' }).rows.map((row) => row.isbn), ['9788373196032']);
  assert.deepEqual(cheatSheet(built, { query: 'nic takiego' }).rows, []);
  // A higher threshold leaves the target out when it is under it.
  assert.deepEqual(cheatSheet(built, { min: 3000 }).rows.map((row) => row.isbn), ['9788370001230']);
  const html = cheatSheetMarkup(sheet, helpers);
  assert.match(html, /cel 25 zł/);
  assert.match(html, /brak w ofertach/);
  assert.match(cheatSheetMarkup({ rows: [], more: 0 }, helpers), /Brak książek do ściągi/);
});
