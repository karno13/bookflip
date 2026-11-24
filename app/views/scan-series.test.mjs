import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCWORLD_PHRASES, scanSeriesOptions, installScanSeries, labelPhrases } from './scan-series.js';
import { MAX_SCAN_QUERIES } from '../core/scan-limits.js';

const NL = String.fromCharCode(10);

test('Discworld is available without catalogue data and contains every main novel', () => {
  const series = scanSeriesOptions()[0];
  assert.equal(series.titles.length, 41);
  assert.equal(new Set(series.titles).size, 41);
  assert.equal(series.titles[0], 'Kolor magii');
  assert.equal(series.titles.at(-1), 'Pasterska korona');
});

test('catalogue data cannot add series to the agreed lists', () => {
  const options = scanSeriesOptions({ universes: [
    { name: 'Świat Dysku', cycles: [] },
    { name: 'Poza seriami', cycles: [{ works: [{ title: 'Niepowiązana' }] }] },
    { name: 'Diuna', cycles: [{ name: 'Kroniki', works: [
      { title: 'Diuna / Dune' }, { title: 'diuna / Dune' },
    ], missingTitles: { 2: 'Mesjasz Diuny' } }] },
  ] });
  assert.deepEqual(options.map((option) => option.name), ['Świat Dysku', 'Herezja Horusa', 'Gotrek i Felix', 'Warhammer — wszystko', 'Warhammer 40 000', 'Warhammer Fantasy i Age of Sigmar', 'Forgotten Realms', 'Dragonlance']);
});

test('labelPhrases: title and first author in order, no duplicates, author not repeated', () => {
  assert.deepEqual(labelPhrases([
    { title: 'Eisenhorn', authors: ['Dan Abnett'] },
    { title: 'Legion Abnett', authors: ['Dan Abnett'] },
    { title: 'eisenhorn', authors: ['Dan Abnett'] },
    { title: 'Bez autora', authors: [] },
    { title: '' },
  ]), ['Eisenhorn Dan Abnett', 'Legion Abnett', 'Bez autora']);
  assert.deepEqual(labelPhrases(undefined), []);
});

test('picker offers own labels first and ready series second; both fill the editable form', async (t) => {
  class Element extends EventTarget {
    value = '';
    textContent = '';
    children = [];
    replaceChildren(...children) { this.children = children; }
    add(child) { this.children.push(child); }
    appendChild(child) { this.children.push(child); }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const elements = new Map(['#scanSeries', '#queries', '#scanSeriesNote'].map((id) => [id, new Element()]));
  const input = elements.get('#queries');
  const picker = elements.get('#scanSeries');
  input.value = 'Stara fraza';
  let inputs = 0;
  input.addEventListener('input', () => inputs++);
  const calls = [];
  const toasts = [];
  const json = async (path) => {
    calls.push(path);
    if (path === '/api/catalog/labels') return { items: [{ label: 'Moja półka', works: 2 }, { label: 'Pusta', works: 0 }] };
    if (path === '/api/catalog/labels/Moja%20p%C3%B3%C5%82ka/works') {
      return { label: 'Moja półka', works: [{ title: 'Mort', authors: ['Terry Pratchett'] }, { title: 'Eryk', authors: [] }] };
    }
    throw new Error('unexpected ' + path);
  };
  installScanSeries({ $: (id) => elements.get(id), toast: (text) => toasts.push(text), json });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const [mine, ready] = picker.children.slice(1);
  assert.equal(mine.label, 'Moje etykiety');
  assert.deepEqual(mine.children.map((node) => node.value), ['label:Moja półka']);
  assert.equal(ready.label, 'Gotowe serie');
  assert.equal(ready.children.length, scanSeriesOptions().length);

  picker.value = 'label:Moja półka';
  picker.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(input.value.split(NL), ['Mort Terry Pratchett', 'Eryk']);
  assert.match(elements.get('#scanSeriesNote').textContent, /Wstawiono 2 tytułów: Moja półka/);

  picker.value = 'series:discworld';
  picker.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(input.value.split(NL), DISCWORLD_PHRASES);
  for (const series of scanSeriesOptions().slice(1)) {
    picker.value = 'series:' + series.id;
    picker.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(input.value.split(NL), series.titles);
    assert.match(elements.get('#scanSeriesNote').textContent, new RegExp(series.name));
  }
  assert.equal(inputs, 1 + scanSeriesOptions().length);
  assert.deepEqual(toasts, []);
});

test('picker without labels still offers ready series', async (t) => {
  class Element extends EventTarget {
    value = '';
    textContent = '';
    children = [];
    replaceChildren(...children) { this.children = children; }
    add(child) { this.children.push(child); }
    appendChild(child) { this.children.push(child); }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const elements = new Map(['#scanSeries', '#queries', '#scanSeriesNote'].map((id) => [id, new Element()]));
  installScanSeries({ $: (id) => elements.get(id), toast: assert.fail, json: async () => { throw new Error('offline'); } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const groups = elements.get('#scanSeries').children.slice(1);
  assert.deepEqual(groups.map((group) => group.label), ['Gotowe serie']);
});

test('whole universes: every list fits one scan, has no duplicates and no bare common words', () => {
  const universes = scanSeriesOptions().slice(3);
  // Bare words the phrase report showed as noise, and common words that must carry an author.
  const bare = new Set(['zabójca', 'ojczyzna', 'wygnanie', 'upadek', 'zagłada', 'smoki', 'legion', 'dominium', 'krieg', 'xenos']);
  for (const series of universes) {
    assert.ok(series.titles.length > 40 && series.titles.length <= MAX_SCAN_QUERIES, series.name);
    const keys = series.titles.map((title) => title.toLowerCase());
    assert.equal(new Set(keys).size, keys.length, `${series.name}: duplicates`);
    for (const key of keys) assert.ok(!bare.has(key), `${series.name}: bare "${key}"`);
  }
  const all = universes.find((series) => series.id === 'warhammer-all');
  for (const id of ['warhammer-40k', 'warhammer-fantasy'])
    for (const title of universes.find((series) => series.id === id).titles) assert.ok(all.titles.includes(title), title);
  assert.ok(all.titles.includes('Wywyższenie Horusa'), 'the Horus Heresy is part of the whole of Warhammer');
  assert.ok(all.titles.includes('Legion Abnett') && !all.titles.includes('Legion'));
});

test('single-series lists: common-word titles carry the author, well-identified titles stay bare', () => {
  const [discworld, heresy, gotrek] = scanSeriesOptions();
  const bare = new Set(['mort', 'piramidy', 'eryk', 'maskarada', 'ruchome obrazki', 'legion', 'zdrajca', 'nemezis', 'stara ziemia', 'zabójca']);
  for (const series of [discworld, heresy, gotrek])
    for (const title of series.titles) assert.ok(!bare.has(title.toLowerCase()), `${series.name}: bare "${title}"`);
  assert.ok(discworld.titles.includes('Eryk Pratchett') && discworld.titles.includes('Kolor magii'));
  assert.ok(heresy.titles.includes('Legion Abnett') && heresy.titles.includes('Fulgrim'));
  assert.ok(gotrek.titles.includes('Zabójca Gotrek') && gotrek.titles.includes('Zabójca trolli'));
  assert.equal(heresy.titles.length, 48);
});
