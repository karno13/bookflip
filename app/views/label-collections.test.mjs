import assert from 'node:assert/strict';
import test from 'node:test';

import {
  booksWord,
  bookRowMarkup,
  candidateMarkup,
  collectionMarkup,
  collectionsMarkup,
  idsByVolume,
} from './label-collections.js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

test('Polish plural of books', () => {
  assert.deepEqual([0, 1, 2, 5, 12, 22, 25].map(booksWord), ['książek', 'książka', 'książki', 'książek', 'książek', 'książki', 'książek']);
});

test('ordering by volume: numbered first, the rest keep their order', () => {
  assert.deepEqual(
    idsByVolume([
      { id: 'x', volume: null },
      { id: 'b', volume: 2 },
      { id: 'y', volume: null },
      { id: 'a', volume: 1 },
    ]),
    ['a', 'b', 'x', 'y'],
  );
});

test('the list of labels: names escaped, counts, „Nowa etykieta”, the empty state', () => {
  const markup = collectionsMarkup([{ label: '<Gaunt>', works: 2 }], escapeHtml);
  assert.match(markup, /data-label-new/);
  assert.match(markup, /data-label-open="&#60;Gaunt&#62;"/);
  assert.match(markup, /2 książki/);
  assert.doesNotMatch(markup, /<Gaunt>/);
  assert.match(collectionsMarkup([], escapeHtml), /Nie ma jeszcze etykiet/);
});

test('the list of labels offers „Układaj okładki” for a label with at least two books', () => {
  const markup = collectionsMarkup([{ label: 'Duo', works: 2 }, { label: 'Solo', works: 1 }], escapeHtml);
  assert.match(markup, /data-label-arrange="Duo"/);
  assert.doesNotMatch(markup, /data-label-arrange="Solo"/);
});

test('inside a label: arranging moved to the covers, the rest stays (rename, volumes, remove, add, market)', () => {
  const data = {
    label: 'Cykl',
    works: [
      { id: 'a', title: 'Alfa', authors: ['Autor'], position: 1, volume: 1 },
      { id: 'b', title: 'Beta', authors: [], position: 2, volume: null },
    ],
  };
  const markup = collectionMarkup(data, escapeHtml);
  assert.match(markup, /data-label-arrange="Cykl"/, 'opens the covers view');
  assert.doesNotMatch(markup, /data-label-move|label-drag|draggable/, 'no ↑ ↓ or dragging in the list any more');
  assert.match(markup, /data-label-rename/);
  assert.match(markup, /data-label-delete/);
  assert.match(markup, /data-label-by-volume/);
  assert.match(markup, /data-label-search/);
  assert.match(markup, /data-label-market-toggle/);
  assert.match(markup, /<details class="label-books-folded" data-label-books-details>/, 'the book list is folded');
  assert.match(collectionMarkup(data, escapeHtml, null, { listOpen: true }), /data-label-books-details open>/);
  assert.match(markup, /value="1" data-label-volume="a"/);
  assert.match(markup, /value="" data-label-volume="b"/);
  assert.match(markup, /data-label-remove="b"/);
  assert.match(collectionMarkup({ label: 'Pusta', works: [] }, escapeHtml), /Ta etykieta jest pusta/);
  assert.doesNotMatch(collectionMarkup({ label: 'Pusta', works: [] }, escapeHtml), /data-label-by-volume|data-label-arrange/);
  assert.match(bookRowMarkup({ id: '<x>', title: '<b>', volume: null }, 0, escapeHtml), /&#60;b&#62;/);
});

test('a found book offers „Dodaj” unless it is already in the label', () => {
  assert.match(candidateMarkup({ id: 'w', title: 'Mort', authors: ['Pratchett'] }, false, escapeHtml), /data-label-add="w">Dodaj</);
  assert.match(candidateMarkup({ id: 'w', title: 'Mort' }, true, escapeHtml), /już w tej etykiecie/);
});

test('market panel: cheapest offer, no offers, gaps, escaped text, empty label', async () => {
  const { marketMarkup, marketRowMarkup, missingBooks, collectionMarkup: inside } = await import('./label-collections.js');
  const books = [
    { workId: 'a', title: 'Tom <1>', volume: 1, liveOffers: 2, target: 1200, cheapest: { price: 1500, source: 'Vinted', url: 'https://vinted.pl/x', worth: 3000, saving: 1500, confidenceLabel: 'średnia' } },
    { workId: 'b', title: 'Tom 2', volume: 2, liveOffers: 0, cheapest: null, target: null },
  ];
  const html = marketMarkup({ books, gaps: [3, 4], more: 2, withoutOffers: 1 }, escapeHtml);
  assert.match(html, /brak ofert/);
  assert.match(html, /brakuje tomów: 3, 4 i 2 kolejnych/);
  assert.match(html, /Skanuj brakujące \(1\)/);
  assert.match(html, /cel ≤/);
  assert.match(html, /taniej o/);
  assert.doesNotMatch(html, /<1>/);
  assert.match(marketRowMarkup(books[0], escapeHtml), /href="https:\/\/vinted\.pl\/x"/);
  assert.doesNotMatch(marketMarkup({ books, gaps: [], withoutOffers: 0 }, escapeHtml), /data-label-gaps|data-label-scan-missing/);
  assert.match(marketMarkup({ books: [], gaps: [] }, escapeHtml), /nie ma czego szukać/);
  assert.match(marketMarkup({ error: 'X' }, escapeHtml), /Nie udało się wczytać rynku: X/);
  assert.deepEqual(missingBooks([{ id: 'a' }, { id: 'b' }], books).map((work) => work.id), ['b']);
  const data = { label: 'L', works: [{ id: 'a', title: 'A', authors: [], position: 1, volume: 1 }] };
  assert.doesNotMatch(inside(data, escapeHtml), /label-market"/);
  assert.match(inside(data, escapeHtml, { books }), /Ukryj rynek/);
  assert.match(inside(data, escapeHtml), />Rynek</);
});

test('sub-labels: headings with counts, collapsible, a picker per book, escaped names', async () => {
  const { booksMarkup } = await import('./label-collections.js');
  const data = {
    label: 'Cykl',
    groups: [{ id: 3, name: '<Część>', works: 1 }, { id: 4, name: 'Pusta', works: 0 }],
    works: [
      { id: 'a', title: 'Alfa', authors: [], position: 1, volume: 1, groupId: 3 },
      { id: 'b', title: 'Beta', authors: [], position: 2, volume: null, groupId: null },
    ],
  };
  const markup = booksMarkup(data, escapeHtml);
  assert.match(markup, /<details class="label-group" data-label-group-section="3" open>/);
  assert.match(markup, /&#60;Część&#62; \(1\)/);
  assert.doesNotMatch(markup, /<Część>/);
  assert.match(markup, /Bez podetykiety \(1\)/);
  assert.match(markup, /<option value="3" selected>/);
  assert.match(markup, /Pusta podetykieta/);
  assert.doesNotMatch(booksMarkup(data, escapeHtml, new Set([3])).split('data-label-group-section="3"')[1].slice(0, 5), /open/);
  assert.doesNotMatch(booksMarkup({ ...data, groups: [] }, escapeHtml), /label-group|data-label-assign/);
  assert.match(collectionMarkup(data, escapeHtml), /data-label-group-form/);
});

test('sub-labels: an unknown groupId is treated as none; the form also exists in an empty label', async () => {
  const { booksMarkup } = await import('./label-collections.js');
  const data = {
    label: 'Cykl',
    groups: [{ id: 3, name: 'Jeden', works: 0 }],
    works: [{ id: 'a', title: 'Alfa', authors: [], position: 1, volume: null, groupId: 99 }],
  };
  assert.match(booksMarkup(data, escapeHtml), /Bez podetykiety \(1\)/);
  const empty = collectionMarkup({ label: 'Pusta', groups: [], works: [] }, escapeHtml);
  assert.match(empty, /data-label-group-form/);
  assert.match(empty, /data-label-group-rename-form hidden/);
  assert.doesNotMatch(collectionMarkup(data, escapeHtml).split('</details>')[0], /data-label-group-form/);
});
