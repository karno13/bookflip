import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoverOrder, coverOrderMarkup, coverOrderStatus, coverSections, coverSectionsMarkup, movedAfter, movedBefore, neighbour, swapped } from './cover-order.js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

test('swapping two covers exchanges their places; invalid pairs change nothing', () => {
  assert.deepEqual(swapped(['a', 'b', 'c', 'd'], 'a', 'c'), ['c', 'b', 'a', 'd']);
  assert.deepEqual(swapped(['a', 'b', 'c'], 'c', 'b'), ['a', 'c', 'b']);
  const ids = ['a', 'b'];
  assert.equal(swapped(ids, 'a', 'a'), ids);
  assert.equal(swapped(ids, 'a', 'x'), ids);
});

test('the neighbour of a cover; none at the ends', () => {
  assert.equal(neighbour(['a', 'b', 'c'], 'b', -1), 'a');
  assert.equal(neighbour(['a', 'b', 'c'], 'b', 1), 'c');
  assert.equal(neighbour(['a', 'b', 'c'], 'a', -1), null);
  assert.equal(neighbour(['a', 'b', 'c'], 'c', 1), null);
  assert.equal(neighbour(['a'], 'x', 1), null);
});

test('arranging is on only in the covers view with a real label in its own order and the whole label visible', () => {
  const base = { view: 'grid', filters: { label: 'Cykl', sort: 'label' }, loaded: 5, total: 5 };
  const on = coverOrderStatus(base);
  assert.equal(on.enabled, true);
  assert.equal(on.label, 'Cykl');
  assert.match(on.message, /Cykl/);
  for (const view of ['list', 'labels']) assert.deepEqual(coverOrderStatus({ ...base, view }), { show: false, enabled: false, label: '', message: '' });
  // Every reason to stay off says why in one sentence.
  const off = [
    { filters: { label: '', sort: 'title' } },
    { filters: { label: '__none__', sort: 'label' } },
    { filters: { label: 'Cykl', sort: 'title' } },
    { filters: { label: 'Cykl', sort: 'label', query: 'x' } },
    { filters: { label: 'Cykl', sort: 'label', gap: 'year' } },
    { incompleteOnly: true },
    { loaded: 3 },
    { loaded: 1, total: 1 },
  ];
  for (const change of off) {
    const result = coverOrderStatus({ ...base, ...change });
    assert.equal(result.enabled, false, JSON.stringify(change));
    assert.equal(result.show, true);
    assert.ok(result.message.length > 10 && (result.message.match(/\./g) || []).length === 1, 'one sentence');
  }
  assert.equal(coverOrderStatus({ ...base, loaded: 0, total: 0 }).show, false, 'an empty label has nothing to explain');
});

test('cover controls: place badge, ← → buttons with names, the ends disabled, text escaped', () => {
  const first = coverOrderMarkup({ id: 'a', title: '<Alfa>', place: 1, count: 3 }, escapeHtml);
  assert.match(first, /class="cover-place"[^>]*>.*1<\/span>/s);
  assert.match(first, /data-cover-move="-1" data-cover-id="a"[^>]*disabled/);
  assert.doesNotMatch(first, /data-cover-move="1"[^>]*disabled/);
  assert.match(first, /aria-label="Przesuń w prawo: &#60;Alfa&#62; \(miejsce 1 z 3\)"/);
  assert.doesNotMatch(first, /<Alfa>/);
  const last = coverOrderMarkup({ id: 'c', title: 'Gamma', place: 3, count: 3 }, escapeHtml);
  assert.match(last, /data-cover-move="1" data-cover-id="c"[^>]*disabled/);
});

test('moving a cover before or after another keeps one list; invalid moves change nothing', () => {
  assert.deepEqual(movedBefore(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(movedBefore(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'a', 'c', 'd']);
  assert.deepEqual(movedAfter(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(movedAfter(['a', 'b', 'c', 'd'], 'd', 'a'), ['a', 'd', 'b', 'c']);
  const ids = ['a', 'b'];
  assert.equal(movedBefore(ids, 'a', 'a'), ids);
  assert.equal(movedBefore(ids, 'a', 'x'), ids);
  assert.equal(movedAfter(ids, 'x', 'a'), ids);
});

test('sections: „Bez podetykiety” first, then the sub-labels; global order kept, unknown group counts as none', () => {
  const groups = [{ id: 3, name: 'Część <1>' }, { id: 4, name: 'Pusta' }];
  const of = { a: 3, b: null, c: 3, d: 99 };
  const sections = coverSections(groups, (id) => of[id], ['a', 'b', 'c', 'd']);
  assert.deepEqual(sections.map((s) => [s.key, s.groupId, s.ids]), [
    ['none', null, ['b', 'd']],
    ['3', 3, ['a', 'c']],
    ['4', 4, []],
  ]);
  const html = coverSectionsMarkup(sections, (id) => `<i>${id}</i>`, escapeHtml);
  assert.match(html, /data-cover-group="none"[^>]*>.*Bez podetykiety <span>\(2\)<\/span>.*<i>b<\/i><i>d<\/i>/s);
  assert.match(html, /data-cover-group="4"[^>]*>.*Pusta <span>\(0\)<\/span>.*Upuść tu okładkę/s);
  assert.equal((html.match(/Upuść tu okładkę/g) || []).length, 1, 'only the empty section is a drop zone');
  assert.match(html, /Część &#60;1&#62;/);
  assert.doesNotMatch(html, /<1>/);
});

test('cover controls with sub-labels: a select for moving, the current one selected, edges from the section', () => {
  const groups = [{ id: 3, name: '<Część>' }, { id: 4, name: 'Druga' }];
  const html = coverOrderMarkup({ id: 'a', title: 'Alfa', place: 2, count: 5, groups, groupId: 4, first: true, last: true }, escapeHtml);
  assert.match(html, /<select class="cover-group-pick" data-cover-group-pick data-cover-id="a"/);
  assert.match(html, /<option value="">Bez podetykiety<\/option>/);
  assert.match(html, /<option value="4" selected>Druga<\/option>/);
  assert.doesNotMatch(html, /<option value="3" selected/);
  assert.match(html, /&#60;Część&#62;/);
  assert.match(html, /data-cover-move="-1"[^>]*disabled/);
  assert.match(html, /data-cover-move="1"[^>]*disabled/);
  assert.doesNotMatch(coverOrderMarkup({ id: 'a', title: 'Alfa', place: 2, count: 5 }, escapeHtml), /cover-group-pick/);
});

/** A fake list and state to drive createCoverOrder without a DOM. */
function harness(json) {
  const handlers = {};
  const list = { addEventListener: (type, fn) => (handlers[type] = fn), querySelectorAll: () => [] };
  globalThis.document = { body: { dataset: { catalogView: 'grid' } }, querySelectorAll: () => [] };
  const state = {
    catalogWorks: ['a', 'b', 'c'].map((id) => ({ id, title: id })),
    catalogPages: { works: { filters: { label: 'Cykl', sort: 'label' }, total: 3 } },
  };
  const calls = { render: 0, reload: 0, toasts: [] };
  createCoverOrder({
    state,
    $: (selector) => (selector === '#catalogList' ? list : null),
    json,
    toast: (message) => calls.toasts.push(message),
    render: () => calls.render++,
    reload: () => calls.reload++,
  });
  const move = (id, delta) =>
    handlers.click({ target: { closest: (selector) => (selector === '[data-cover-move]' ? { dataset: { coverMove: String(delta), coverId: id } } : null) } });
  const wrapTarget = (id) => ({ closest: (selector) => (selector === '[data-cover-wrap]' ? { dataset: { coverWrap: id }, classList: { add() {}, remove() {} } } : null) });
  return { handlers, state, calls, move, wrapTarget };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('a failed save drops the move queued behind it and reloads once, after the queue is drained', async () => {
  const puts = [];
  const { state, calls, move } = harness((path, options) => {
    puts.push(JSON.parse(options.body).workIds);
    return Promise.reject(new Error('offline'));
  });
  move('a', 1);
  move('a', 1); // built on the optimistic state of the first move
  assert.deepEqual(state.catalogWorks.map((work) => work.id), ['b', 'c', 'a']);
  await settle();
  assert.equal(puts.length, 1, 'the second PUT is never sent');
  assert.deepEqual(state.catalogWorks.map((work) => work.id), ['a', 'b', 'c'], 'the list is back to the saved order');
  assert.equal(calls.reload, 1);
  assert.equal(calls.toasts.length, 2, 'both moves report the failure');
});

test('a redraw asked for during a drag waits for dragend', async () => {
  const { handlers, calls, move, wrapTarget } = harness(() => Promise.resolve({}));
  handlers.dragstart({ target: wrapTarget('a'), dataTransfer: { setData() {} } });
  move('b', 1);
  await settle();
  assert.equal(calls.render, 0, 'nothing is redrawn under the dragged cover');
  handlers.dragend();
  assert.equal(calls.render, 1);
});
