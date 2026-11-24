import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPhrases,
  phraseCounts,
  phraseSwitchBody,
  phrasesSummaryText,
  phrasesTableMarkup,
  sharePercent,
} from './phrases.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dateText = (value) => (value ? `<time>${value}</time>` : '-');
const row = (extra) => ({
  phrase: 'harry potter',
  offers: 20,
  newOffers: 12,
  deals: 0,
  withoutIsbnShare: 0.375,
  activeDays: 5,
  lastSeenAt: '2026-11-20T10:00:00Z',
  verdict: 'szum',
  disabled: false,
  ...extra,
});
const items = [
  row(),
  row({ phrase: 'mort', verdict: 'ok', deals: 2 }),
  row({ phrase: 'nowa', verdict: 'za_malo_danych', lastSeenAt: null }),
  row({ phrase: 'stara', disabled: true }),
];

test('filters: all, noise only (not yet disabled), disabled', () => {
  assert.equal(filterPhrases(items, 'all').length, 4);
  assert.deepEqual(filterPhrases(items, 'noise').map((item) => item.phrase), ['harry potter']);
  assert.deepEqual(filterPhrases(items, 'disabled').map((item) => item.phrase), ['stara']);
  assert.equal(filterPhrases(items, 'weird').length, 4);
  assert.deepEqual(filterPhrases(null, 'all'), []);
});

test('summary counts phrases, noisy and disabled with Polish plurals', () => {
  assert.deepEqual(phraseCounts(items), { total: 4, noise: 1, disabled: 1 });
  assert.equal(phrasesSummaryText(items), '4 frazy, 1 szumiąca, 1 wyłączona');
  assert.equal(phrasesSummaryText([]), '0 fraz, 0 szumiących, 0 wyłączonych');
});

test('share is a rounded percent, unknown is a dash', () => {
  assert.equal(sharePercent(0.375), '38%');
  assert.equal(sharePercent(null), '—');
});

test('switch body carries the phrase and a strict boolean', () => {
  assert.deepEqual(JSON.parse(phraseSwitchBody('mort', true)), { phrase: 'mort', disabled: true });
  assert.deepEqual(JSON.parse(phraseSwitchBody('mort', 'yes')), { phrase: 'mort', disabled: false });
});

test('table shows the verdict as text and icon, and a labelled switch per row', () => {
  const html = phrasesTableMarkup(items, { escapeHtml, dateText });
  assert.match(html, /Szum/);
  assert.match(html, /Za mało danych/);
  assert.match(html, /aria-label="Wyłącz frazę: harry potter"/);
  assert.match(html, /aria-label="Włącz frazę: stara"[^>]*>Włącz</);
  assert.match(html, /38%/);
  assert.match(html, /Wyłączona/);
});

test('outside strings are escaped and an empty list says so', () => {
  const html = phrasesTableMarkup([row({ phrase: '<b>"x"</b>' })], { escapeHtml, dateText });
  assert.doesNotMatch(html, /<b>"x"/);
  assert.match(html, /&#60;b&#62;/);
  assert.match(phrasesTableMarkup([], { escapeHtml, dateText }), /Brak fraz/);
});
