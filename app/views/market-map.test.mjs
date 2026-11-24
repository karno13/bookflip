import assert from 'node:assert/strict';
import test from 'node:test';

import { marketMapSvg } from './market-map.js';

const tools = { zl: (grosze) => `${Math.round(grosze / 100)} zł`, escapeHtml: (value) => String(value).replace(/</g, '&lt;') };
const item = (id, value, chance, turnover) => ({ workId: id, title: `Książka <${id}>`, value, turnover, liquidity: { chance } });

test('one clickable dot per valued edition, bigger for more turnover, titles escaped', () => {
  const svg = marketMapSvg([item('a', 5000, 0.3, 1500), item('b', 20000, 0.1, 2000), item('c', 3000, 0.2, 100)], tools);
  assert.equal((svg.match(/class="mm-dot"/g) || []).length, 3);
  assert.match(svg, /data-work="a"/);
  assert.match(svg, /Książka &lt;a>/);
  const radii = [...svg.matchAll(/data-work="(\w)"[^>]* r="([\d.]+)"/g)].reduce((all, m) => ({ ...all, [m[1]]: Number(m[2]) }), {});
  assert.ok(radii.b > radii.a && radii.a > radii.c, JSON.stringify(radii));
});

test('too few points or no chance draw nothing', () => {
  assert.equal(marketMapSvg([item('a', 5000, 0.3, 1), item('b', 5000, 0.2, 1)], tools), '');
  assert.equal(marketMapSvg([item('a', 5000, 0, 1), item('b', 5000, 0, 1), item('c', 5000, 0, 1)], tools), '');
});
