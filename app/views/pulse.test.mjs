import assert from 'node:assert/strict';
import test from 'node:test';

import { PULSE_SERIES, pulseChartSvg, pulseHtml, shortDate } from './pulse.js';

const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const days = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-11-${String(i + 10).padStart(2, '0')}`,
  new: i === 3 ? 50 : i,
  gone: 0,
  alerts: i % 2,
}));
const data = {
  days,
  totals: { new: days.reduce((s, d) => s + d.new, 0), gone: 0, alerts: 5 },
};

test('short dates and one slot per day with the value on it', () => {
  assert.equal(shortDate('2026-11-05'), '05.11');
  const svg = pulseChartSvg(days, PULSE_SERIES[0]);
  assert.equal((svg.match(/class="pulse-slot"/g) || []).length, 10);
  assert.match(svg, /data-day="2026-11-13" data-value="50"/);
  assert.match(svg, /role="img" aria-label="Nowe oferty w skanach: 92 w 10 dniach"/);
});

test('a day with zero draws no bar and the tallest bar reaches the top of the scale', () => {
  const svg = pulseChartSvg(days, PULSE_SERIES[0]);
  assert.equal((svg.match(/class="pulse-bar/g) || []).length, 9); // day 0 has no bar
  assert.match(svg, />50<\/text>/); // the axis names the maximum
  assert.equal((pulseChartSvg(days, PULSE_SERIES[1]).match(/class="pulse-bar/g) || []).length, 0);
});

test('three cards with totals, a tooltip slot and the table fallback', () => {
  const html = pulseHtml(data, escapeHtml);
  assert.equal((html.match(/<figure class="pulse-card"/g) || []).length, 3);
  assert.match(html, /<strong>92<\/strong>/);
  assert.match(html, /<details class="pulse-table">/);
  assert.match(html, /class="pulse-tip"/);
  assert.match(pulseHtml({ days: [] }, escapeHtml), /Brak danych/);
});
