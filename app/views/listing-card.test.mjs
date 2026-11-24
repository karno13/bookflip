import test from 'node:test';
import assert from 'node:assert/strict';
import { chanceLabel, competitionSentence, listingCardMarkup, listingUrl, copyField } from './listing-card.js';
import { escapeHtml, money } from '../core/formatters.js';

const tools = { money, escapeHtml };
const card = {
  tiers: [
    { id: 'szybko', label: 'Szybka sprzedaż', price: 2500, chance: 0.61 },
    { id: 'srodek', label: 'Środek', price: 3000, chance: 0.42 },
    { id: 'cierpliwie', label: 'Cierpliwie', price: 3600, chance: 0.2 },
  ],
  competition: { count: 4, cheapest: 2000, median: 3100 },
  text: { title: 'A <b>"x"</b>', description: 'Stan: [uzupełnij]' },
  note: 'Orientacyjnie.',
};

test('chance and competition sentences', () => {
  assert.equal(chanceLabel(0.424), 'orientacyjnie 42% szans na sprzedaż w 30 dni');
  assert.match(competitionSentence(card.competition, money), /^4 oferty teraz, najtańsza .*mediana /);
  assert.match(competitionSentence({ count: 0 }, money), /Brak ofert/);
});

test('markup shows three tiers, escapes text and keeps the note', () => {
  const html = listingCardMarkup(card, tools);
  assert.equal(html.match(/class="listing-tier[ "]/g).length, 3);
  assert.ok(html.includes('42% szans'));
  assert.ok(html.includes('A &lt;b&gt;&quot;x&quot;&lt;/b&gt;'));
  assert.ok(!html.includes('<b>"x"'));
  assert.ok(html.includes('Kopiuj tytuł') && html.includes('Kopiuj opis') && html.includes('Orientacyjnie.'));
});

test('null tiers give the too-few-offers message and no tiles', () => {
  const html = listingCardMarkup({ ...card, tiers: null, reason: 'za_malo_ofert' }, tools);
  assert.ok(html.includes('Za mało ofert tego wydania, żeby podać cenę'));
  assert.ok(!html.includes('listing-tier'));
});

test('url carries the condition only when chosen', () => {
  assert.equal(listingUrl('e/1', ''), '/api/editions/e%2F1/listing-card');
  assert.equal(listingUrl('e1', 'good'), '/api/editions/e1/listing-card?condition=good');
});

test('copy falls back to selecting the field when the clipboard fails', async () => {
  const calls = [];
  const field = { value: 'x', focus: () => calls.push('focus'), select: () => calls.push('select') };
  assert.equal(await copyField(field, { writeText: async () => {} }), 'copied');
  assert.equal(
    await copyField(field, {
      writeText: async () => {
        throw new Error('denied');
      },
    }),
    'selected',
  );
  assert.deepEqual(calls, ['focus', 'select']);
});
