import assert from 'node:assert/strict';
import test from 'node:test';

import { createLatest, deviationText, entityResultsMarkup, sellerCardMarkup } from './entity-search.js';

test('latest wins: an older answer and a cancelled one are dropped', () => {
  const latest = createLatest();
  const first = latest.next();
  const second = latest.next();
  assert.equal(latest.isCurrent(first), false);
  assert.equal(latest.isCurrent(second), true);
  latest.cancel(); // panel closed (Esc, fewer than two characters) while the request is in flight
  assert.equal(latest.isCurrent(second), false);
  assert.equal(latest.isCurrent(latest.next()), true);
});

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (grosze) => `${Math.round(grosze / 100)} zł`;
const tools = { escapeHtml, money };

test('names and titles are escaped, javascript links are not clickable', () => {
  const html = sellerCardMarkup(
    {
      sellerId: 'x',
      sellerName: '<img src=x onerror=alert(1)>',
      source: 'Vinted',
      activeCount: 1,
      valuedCount: 0,
      goneIn30Days: 0,
      soldIn30Days: 0,
      medianDeviation: null,
      offers: [
        { title: '<b>t</b>', url: 'javascript:alert(1)', price: 1000, worth: null, deviation: null },
      ],
    },
    tools,
  );
  assert.ok(!html.includes('<img') && !html.includes('<b>') && !html.includes('href='));
  assert.ok(html.includes('bez wiarygodnej wyceny'));
});

test('a seller without a name is shown by its number', () => {
  const card = { sellerId: '12345', sellerName: null, source: 'Vinted', activeCount: 1, valuedCount: 0, goneIn30Days: 0, soldIn30Days: 0, medianDeviation: null, offers: [] };
  assert.ok(sellerCardMarkup(card, tools).includes('Sprzedawca #12345'));
  assert.ok(sellerCardMarkup({ ...card, sellerName: 'Anna' }, tools).includes('Sprzedawca Anna'));
});

test('deviation and empty results are worded in Polish', () => {
  assert.equal(deviationText({ medianDeviation: -0.12 }), 'mediana odchylenia od wyceny: −12%');
  assert.equal(deviationText({ medianDeviation: null }), 'brak wiarygodnych wycen');
  assert.ok(entityResultsMarkup({ sellers: [], authors: [], series: [] }, tools).includes('Brak'));
});
