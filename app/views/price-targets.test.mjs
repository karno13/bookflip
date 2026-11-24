import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePriceInput,
  priceInputValue,
  findTarget,
  targetStatusLabel,
  targetBody,
  targetBadgeMarkup,
  targetPanelMarkup,
  targetsListMarkup,
  saveTarget,
  switchTarget,
} from './price-targets.js';
import { escapeHtml, money } from '../core/formatters.js';

const tools = { escapeHtml, money };

test('parsePriceInput turns złoty with comma or dot into grosze', () => {
  assert.equal(parsePriceInput('15'), 1500);
  assert.equal(parsePriceInput('15,5'), 1550);
  assert.equal(parsePriceInput('15.50'), 1550);
  assert.equal(parsePriceInput(' 15,05 zł '), 1505);
  assert.equal(parsePriceInput('0,01'), 1);
  assert.equal(parsePriceInput('9999,99'), 999999);
});

test('parsePriceInput refuses what the server would refuse', () => {
  for (const bad of ['', '  ', 'abc', '0', '0,00', '-5', '15,123', '10000', '1 000 000', '1,2,3', null, undefined]) {
    assert.equal(parsePriceInput(bad), null, String(bad));
  }
});

test('priceInputValue and status labels', () => {
  assert.equal(priceInputValue(1500), '15,00');
  assert.equal(priceInputValue(1505), '15,05');
  assert.equal(priceInputValue(null), '');
  const target = { id: 't1', scope: 'edition', editionId: 'e1', workId: null, maxPrice: 1500, active: true };
  assert.match(targetStatusLabel(target, money), /^Cel: 15,00\s*zł — aktywny$/);
  assert.match(targetStatusLabel({ ...target, active: false }, money), /wyłączony$/);
  assert.equal(targetStatusLabel(null, money), 'Brak celu');
});

test('findTarget matches scope and id', () => {
  const items = [
    { id: 'a', scope: 'edition', editionId: 'x', workId: null },
    { id: 'b', scope: 'work', editionId: null, workId: 'x' },
  ];
  assert.equal(findTarget(items, 'work', 'x').id, 'b');
  assert.equal(findTarget(items, 'edition', 'x').id, 'a');
  assert.equal(findTarget(items, 'edition', 'y'), null);
});

test('targetBody picks the field by scope', () => {
  assert.deepEqual(targetBody('edition', 'e1', '15,5'), { editionId: 'e1', maxPrice: 1550, active: true });
  assert.deepEqual(targetBody('work', 'w1', '20'), { workId: 'w1', maxPrice: 2000, active: true });
  assert.equal(targetBody('work', 'w1', 'nic'), null);
});

test('badge is text and only for deals with a target', () => {
  assert.equal(targetBadgeMarkup({}, tools), '');
  assert.match(targetBadgeMarkup({ target: { maxPrice: 1500 } }, tools), /Twoja cena ≤ 15,00\s*zł/);
});

test('panel markup shows the state, escapes ids and offers switch only with a target', () => {
  const empty = targetPanelMarkup({ scope: 'edition', id: 'a"b', target: null }, tools);
  assert.match(empty, /Brak celu\. Dla tego wydania\./);
  assert.doesNotMatch(empty, /data-target-toggle/);
  assert.doesNotMatch(empty, /a"b/);
  const set = targetPanelMarkup({ scope: 'work', id: 'w1', target: { id: 't', maxPrice: 1500, active: false } }, tools);
  assert.match(set, /value="15,00"/);
  assert.match(set, /inputmode="decimal"/);
  assert.match(set, /data-target-toggle>Włącz</);
  assert.match(set, /polskich wydań/);
});

test('list markup escapes titles and offers the opposite switch', () => {
  assert.match(targetsListMarkup([], tools), /Brak celów/);
  const html = targetsListMarkup(
    [
      { id: 'i1', scope: 'edition', maxPrice: 1500, active: true, title: '<b>X</b>' },
      { id: 'i2', scope: 'work', maxPrice: 900, active: false, title: 'Y' },
    ],
    tools,
  );
  assert.doesNotMatch(html, /<b>X<\/b>/);
  assert.match(html, /data-target-active="i1" data-active="0">Wyłącz/);
  assert.match(html, /data-target-active="i2" data-active="1">Włącz/);
});

test('writes are JSON PUTs', async () => {
  const calls = [];
  const json = async (url, options) => (calls.push({ url, options }), {});
  await saveTarget(json, { editionId: 'e1', maxPrice: 1500, active: true });
  await switchTarget(json, 'a/b', false);
  assert.equal(calls[0].url, '/api/price-targets');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body), { editionId: 'e1', maxPrice: 1500, active: true });
  assert.equal(calls[1].url, '/api/price-targets/a%2Fb/active');
  assert.deepEqual(JSON.parse(calls[1].options.body), { active: false });
});
