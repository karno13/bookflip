import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_GROUPS, NAV_VIEWS, MOBILE_PRIMARY, MOBILE_MORE, groupOf, tabsOf, defaultTab, rememberTab, tabForView } from './nav-groups.js';
import { VIEWS } from './view-history.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = String(value); }, data };
};

test('every view the app can show belongs to exactly one group', () => {
  // VIEWS is the list the address bar accepts; "queue" there is the alias of the queue group.
  assert.deepEqual([...NAV_VIEWS].sort(), VIEWS.filter((view) => view !== 'queue').sort());
  for (const view of NAV_VIEWS) assert.equal(NAV_GROUPS.filter((group) => group.tabs.some((tab) => tab.view === view)).length, 1, view);
  assert.equal(groupOf('market'), null);
  assert.equal(groupOf('deals'), 'deals');
});

test('groups hold the agreed sub-views and keep their labels', () => {
  assert.deepEqual(NAV_GROUPS.map((group) => group.label), ['Dziś', 'Okazje', 'Łowca', 'Kolejka', 'Książki', 'Skan', 'Ustawienia']);
  assert.deepEqual(tabsOf('deals').map((tab) => tab.label), ['Okazje', 'Paczki', 'Kupuję do', 'Indeks rynku', 'Snajper']);
  assert.deepEqual(tabsOf('hunter').map((tab) => tab.label), ['Łowca', 'Zapas']);
  assert.equal(groupOf('stock'), 'hunter');
  assert.deepEqual(tabsOf('scanner').map((tab) => tab.label), ['Źródła', 'Frazy']);
  assert.deepEqual(tabsOf('catalog').map((tab) => tab.view), ['catalog', 'offers']);
  assert.deepEqual(tabsOf('queue').map((tab) => tab.view), ['review', 'sets', 'checks']);
  for (const view of ['phrases', 'offers', 'sets', 'checks']) assert.ok(groupOf(view), view);
});

test('tab ids are unique and the phone bar plus "Więcej" cover every group once', () => {
  const ids = NAV_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...MOBILE_PRIMARY, ...MOBILE_MORE].sort(), NAV_GROUPS.map((group) => group.id).sort());
  assert.equal(MOBILE_PRIMARY.length + 1, 5);
});

test('a group opens its first tab until another is used, then the last one', () => {
  const storage = memory();
  assert.equal(defaultTab('deals', storage).id, 'deals');
  assert.equal(rememberTab('market', storage), true);
  assert.equal(storage.data['bookflip.navLast.deals'], 'market');
  assert.equal(defaultTab('deals', storage).id, 'market');
  assert.equal(tabForView('deals', storage).pane, 'market');
  rememberTab('offers', storage);
  assert.equal(defaultTab('catalog', storage).view, 'offers');
});

test('storage trouble or a stale value never breaks navigation', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(defaultTab('scanner', broken).id, 'scanner');
  assert.equal(rememberTab('phrases', broken), false);
  assert.equal(defaultTab('scanner', null).id, 'scanner');
  assert.equal(defaultTab('deals', memory({ 'bookflip.navLast.deals': 'removed-tab' })).id, 'deals');
  assert.equal(rememberTab('nope', memory()), false);
  assert.equal(defaultTab('nope'), null);
  // A tab of another view never answers for this view.
  assert.equal(tabForView('deals', memory({ 'bookflip.navLast.deals': 'phrases' })).id, 'deals');
});
