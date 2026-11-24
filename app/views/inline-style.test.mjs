import assert from 'node:assert/strict';
import test from 'node:test';

import { gaugeMarkup } from './deals.js';
import { marketMapSvg } from './market-map.js';
import { priceChartSvg } from './price-chart.js';
import { pulseHtml } from './pulse.js';

// The page is served with style-src 'self': a style="…" attribute is blocked (the first gauge showed
// only a dot at the left edge). Positions travel in data-* and attributes of the SVG.
const escapeHtml = (value) => String(value).replace(/</g, '&lt;');
const money = (value) => `${Math.round(value / 100)} zł`;

test('new chart and gauge markup carries no inline style attribute', () => {
  const days = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${10 + i}`, new: i, gone: i, alerts: 1 }));
  const outputs = [
    gaugeMarkup({ price: 1000, worth: 3000, worthLow: 2500, worthHigh: 3500 }, { escapeHtml, money }),
    pulseHtml({ days, totals: { new: 28, gone: 28, alerts: 8 } }, escapeHtml),
    marketMapSvg(
      [1, 2, 3, 4].map((n) => ({ workId: `w${n}`, title: `T${n}`, value: n * 1000, turnover: n * 100, liquidity: { chance: n / 10 } })),
      { zl: money, escapeHtml },
    ),
    priceChartSvg(
      [
        { offerId: 'a', title: 'a', price: 1000, observedAt: '2026-11-01T00:00:00Z' },
        { offerId: 'a', title: 'a', price: 900, observedAt: '2026-11-03T00:00:00Z' },
      ],
      { money, escapeHtml, formatDate: (at) => String(at) },
    ),
  ];
  for (const html of outputs) {
    assert.ok(html.length > 0);
    assert.doesNotMatch(html, /\sstyle\s*=/i);
  }
});

test('only the biggest dots of the market map are in the tab order', () => {
  const items = Array.from({ length: 40 }, (_, n) => ({ workId: `w${n}`, title: `T${n}`, value: 5000 + n * 100, turnover: 100 + n, liquidity: { chance: 0.1 + n / 200 } }));
  const svg = marketMapSvg(items, { zl: money, escapeHtml });
  assert.equal((svg.match(/tabindex="0"/g) || []).length, 20);
  assert.equal((svg.match(/class="mm-dot"/g) || []).length, 40);
});
