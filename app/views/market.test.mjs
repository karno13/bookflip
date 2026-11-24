import assert from 'node:assert/strict';
import test from 'node:test';

import { backtestMarkup } from './market.js';

const escapeHtml = (text) => String(text).replace(/</g, '&lt;');
const group = (samples, extra = {}) =>
  samples >= 20
    ? { samples, enough: true, median: 1.05, p25: 0.9, p75: 1.2, inBandShare: 0.62, ...extra }
    : { samples, enough: false, median: null };

test('backtest shows figures only for groups with enough samples', () => {
  const html = backtestMarkup(
    {
      days: 90,
      minSamples: 20,
      band: { low: 0.8, high: 1.2 },
      overall: group(40),
      byConfidence: { high: group(25), medium: group(7), low: group(0) },
    },
    { escapeHtml },
  );
  assert.match(html, /1,05/);
  assert.match(html, /62%/);
  assert.equal((html.match(/za mało danych/g) ?? []).length, 2);
  assert.match(backtestMarkup(null, { escapeHtml }), /Nie udało się/);
});

test('the backtest shows the price and sales tables when the server sends them', () => {
  const group = { samples: 3, enough: false };
  const data = { overall: group, byConfidence: { high: group, medium: group, low: group }, byPrice: [{ label: 'do 15 zł', ...group }], bySales: [{ label: 'bez potwierdzonej sprzedaży', ...group }], minSamples: 20, days: 90, band: { low: 0.8, high: 1.2 } };
  const html = backtestMarkup(data, { escapeHtml: (value) => String(value) });
  assert.match(html, /Wartość wyceny/);
  assert.match(html, /bez potwierdzonej sprzedaży/);
});
