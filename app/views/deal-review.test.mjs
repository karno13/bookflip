import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIONS, actionsMarkup, counterLabel, installDealReview, previewMarkup, reviewAction } from './deal-review.js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (grosze) => `${grosze / 100} zł`;
const item = {
  offerId: 'o1',
  title: 'Mort <b>',
  source: 'Vinted',
  url: 'https://example.test/o1',
  price: 2000,
  workId: 'w',
  workTitle: 'Mort',
  worth: 4000,
  worthLow: 3500,
  worthHigh: 4500,
  saving: 2000,
  discount: 50,
  confidence: 'medium',
  confidenceLabel: 'średnia',
};

test('keys map to actions in either case and unknown keys to nothing', () => {
  assert.deepEqual(
    ['k', 'K', 'l', 'o', 'n', 's', 'z', 'Z', 'Escape', 'x', undefined].map(reviewAction),
    ['bought', 'bought', 'label', 'snooze', 'dismiss', 'skip', 'undo', 'undo', 'close', null, null],
  );
});

test('counter shows position, end and empty queue', () => {
  assert.equal(counterLabel(0, 12), '1 z 12');
  assert.equal(counterLabel(12, 12), 'Koniec: 12 z 12');
  assert.equal(counterLabel(0, 0), 'Brak okazji do przeglądu');
});

test('preview carries price, valuation, saving and the link, and escapes the title', () => {
  const html = previewMarkup(item, { escapeHtml, money });
  assert.match(html, /20 zł/);
  assert.match(html, /warta ~40 zł/);
  assert.match(html, /−20 zł/);
  assert.match(html, /href="https:\/\/example\.test\/o1"/);
  assert.doesNotMatch(html, /Mort <b>/);
  assert.match(html, /&#60;b&#62;/);
});

test('every action has a visible key and a shortcut hint for assistive tech', () => {
  const html = actionsMarkup(escapeHtml);
  for (const [action, key] of ACTIONS) {
    assert.match(html, new RegExp(`data-review="${action}"[^>]*aria-keyshortcuts="${key}"><kbd>${key}</kbd>`));
  }
});

/** Minimal DOM stand-in: enough for installDealReview to run and be driven by key presses. */
function harness({ json, deals = [item, { ...item, offerId: 'o2' }], drawerHidden = true }) {
  const listeners = {};
  const toasts = [];
  const nodes = {};
  const node = (extra = {}) => ({
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    offsetParent: {},
    focused: 0,
    focus() {
      this.focused += 1;
    },
    addEventListener(type, handler) {
      (this.handlers ??= {})[type] = handler;
    },
    querySelectorAll: () => [],
    ...extra,
  });
  for (const id of ['#dealReview', '#dealReviewCard', '#dealReviewCounter', '#dealReviewLive', '#dealReviewLabel', '#dealReviewActions', '#dealReviewClose'])
    nodes[id] = node();
  nodes['#offerDrawer'] = node({ hidden: drawerHidden });
  nodes['#dealReview'].hidden = true;
  globalThis.document = { addEventListener: (type, handler) => (listeners[type] = handler) };
  const api = installDealReview({
    $: (selector) => nodes[selector],
    json,
    escapeHtml,
    money,
    getDeals: () => deals,
    toast: (text) => toasts.push(text),
  });
  const press = (key, target = { closest: () => null }) => {
    let prevented = false;
    listeners.keydown({ key, target, preventDefault: () => (prevented = true) });
    return prevented;
  };
  return { api, nodes, toasts, press };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('a failed action stays visible: the card announcement does not overwrite it', async () => {
  const { api, nodes, toasts, press } = harness({
    json: async () => {
      throw Object.assign(new Error('BOOM'), { statusCode: 500 });
    },
  });
  api.open();
  press('n');
  await settle();
  assert.equal(nodes['#dealReviewLive'].textContent, 'Nie udało się zapisać.');
  assert.deepEqual(toasts, ['Nie udało się zapisać.']);
  assert.equal(nodes['#dealReviewCounter'].textContent, '1 z 2');
  press('z');
  assert.deepEqual(toasts.at(-1), 'Nie ma czego cofać.');
});

test('an action finishing after close and open does not touch the new queue', async () => {
  const pending = [];
  const { api, nodes, press } = harness({ json: (url) => (url.includes('triage') ? new Promise((resolve) => pending.push(resolve)) : Promise.resolve({ items: [] })) });
  api.open();
  press('n');
  api.close();
  api.open();
  pending[0]({});
  await settle();
  assert.equal(nodes['#dealReviewCounter'].textContent, '1 z 2');
  press('s'); // not blocked by the stale action
  await settle();
  assert.equal(nodes['#dealReviewCounter'].textContent, '2 z 2');
});

test('Escape closes from the label select, other keys there and all keys with the drawer open do nothing', () => {
  const inSelect = { closest: (selector) => (selector === 'select' ? {} : null) };
  const first = harness({ json: async () => ({}) });
  first.api.open();
  assert.equal(first.press('k', inSelect), false);
  assert.equal(first.press('Escape', inSelect), true);
  assert.equal(first.nodes['#dealReview'].hidden, true);
  const second = harness({ json: async () => ({}), drawerHidden: false });
  second.api.open();
  assert.equal(second.press('s'), false);
  assert.equal(second.nodes['#dealReviewCounter'].textContent, '1 z 2');
});

test('choosing a label returns focus to the panel', () => {
  const { api, nodes } = harness({ json: async () => ({ items: [] }) });
  api.open();
  const before = nodes['#dealReview'].focused;
  nodes['#dealReviewLabel'].handlers.change();
  assert.equal(nodes['#dealReview'].focused, before + 1);
});
