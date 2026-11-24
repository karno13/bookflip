import test from 'node:test';
import assert from 'node:assert/strict';
import { booksLabel, bundleSummaryText, bundlesTitle, emptyBundlesText, bundleCardMarkup, bundlesMarkup } from './bundles.js';
import { escapeHtml, money } from '../core/formatters.js';

const tools = { escapeHtml, money };
const offer = (n, extra = {}) => ({ offerId: n, title: `Książka ${n}`, url: `https://www.vinted.pl/items/${n}`, price: 1000, worth: 2500, saving: 1500, ...extra });
const bundle = (count, extra = {}) => ({
  sellerId: 's1',
  sellerName: 'Anna',
  source: 'vinted',
  count,
  totalPrice: 8400,
  totalWorth: 19000,
  totalSaving: 10600,
  offers: Array.from({ length: count }, (_, i) => offer(i + 1)),
  ...extra,
});

test('booksLabel uses Polish plural forms', () => {
  assert.equal(booksLabel(1), '1 książka');
  assert.equal(booksLabel(3), '3 książki');
  assert.equal(booksLabel(5), '5 książek');
  assert.equal(booksLabel(12), '12 książek');
  assert.equal(booksLabel(22), '22 książki');
  assert.equal(booksLabel(112), '112 książek');
});

test('summary and titles', () => {
  const text = bundleSummaryText(bundle(7), money);
  assert.match(text, /^7 książek, razem /);
  assert.match(text, /wycena .*\(oszczędność /);
  assert.equal(bundlesTitle(4), 'Paczki sprzedawców (4)');
  assert.equal(emptyBundlesText(3), 'Brak sprzedawców z co najmniej 3 wycenionymi książkami.');
});

test('card shows three offers and a button for the rest', () => {
  const html = bundleCardMarkup(bundle(7), tools);
  assert.equal(html.match(/class="bundle-offer"/g).length, 3);
  assert.match(html, /Pokaż wszystkie \(7\)/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.equal(bundleCardMarkup(bundle(7), tools, true).match(/class="bundle-offer"/g).length, 7);
  assert.doesNotMatch(bundleCardMarkup(bundle(3), tools), /data-bundle-toggle/);
});

test('card escapes data and refuses non-http links', () => {
  const evil = bundle(3, { sellerName: '<img src=x>', offers: [offer(1, { title: '<b>x</b>', url: 'javascript:alert(1)' }), offer(2), offer(3)] });
  const html = bundleCardMarkup(evil, tools);
  assert.doesNotMatch(html, /<img|<b>x|javascript:/);
});

test('empty list gives one line', () => {
  const html = bundlesMarkup({ minBooks: 3, total: 0, items: [] }, tools);
  assert.match(html, /Brak sprzedawców z co najmniej 3 wycenionymi książkami\./);
});

test('a bundle dearer than its worth says so instead of a negative saving', () => {
  const money = (value) => (value / 100).toFixed(2) + ' zł';
  const text = bundleSummaryText({ count: 3, totalPrice: 3500, totalWorth: 3300, totalSaving: -200 }, money);
  assert.match(text, /(drożej o 2.00 zł)/);
  assert.doesNotMatch(text, /-/);
});

test('bundles dearer than their worth are folded behind a button', () => {
  const cheap = bundle(3, { sellerId: 'A', totalSaving: 500 });
  const dear = bundle(3, { sellerId: 'B', totalSaving: -200 });
  const data = { minBooks: 3, items: [cheap, dear] };
  const folded = bundlesMarkup(data, tools);
  assert.match(folded, /data-bundle="A"/);
  assert.doesNotMatch(folded, /data-bundle="B"/);
  assert.match(folded, /1 paczka jest droższa niż wycena/);
  assert.match(bundlesMarkup(data, tools, true), /data-bundle="B"/);
  assert.match(bundlesMarkup({ minBooks: 3, items: [dear] }, tools), /Żadna paczka nie jest tańsza niż wycena/);
});
