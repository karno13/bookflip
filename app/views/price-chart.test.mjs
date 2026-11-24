import assert from 'node:assert/strict';
import test from 'node:test';

import { priceChartSvg } from './price-chart.js';

const tools = {
  money: (value) => `${(value / 100).toFixed(0)} zł`,
  escapeHtml: (value) => String(value).replace(/</g, '&lt;'),
  formatDate: (at) => new Date(at).toISOString().slice(5, 10),
};
const rows = [
  { offerId: 'a', title: 'Mort <A>', price: 3000, observedAt: '2026-11-01T10:00:00Z' },
  { offerId: 'a', title: 'Mort <A>', price: 2500, observedAt: '2026-11-10T10:00:00Z' },
  { offerId: 'b', title: 'Mort B', price: 4000, observedAt: '2026-11-05T10:00:00Z' },
];

test('a dot per observation, a line only for an offer seen more than once, titles escaped', () => {
  const svg = priceChartSvg(rows, tools);
  assert.equal((svg.match(/class="pc-dot"/g) || []).length, 3);
  assert.equal((svg.match(/class="pc-line"/g) || []).length, 1);
  assert.match(svg, /Mort &lt;A>/);
  assert.match(svg, /role="img" aria-label="Ceny ofertowe w czasie: 3 odczytów, od 11-01 do 11-10"/);
});

test('fewer than two usable observations draw nothing', () => {
  assert.equal(priceChartSvg(rows.slice(0, 1), tools), '');
  assert.equal(priceChartSvg([{ offerId: 'x', title: 'x', price: 0, observedAt: 'bad' }], tools), '');
});
