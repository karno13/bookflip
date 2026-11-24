import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrationLabel, daysLabel, stockBoardMarkup, stockSummaryLabel, stockErrorMessage, recordPurchase, recordSessionPurchase, purchaseSummary } from './stock.js';
import { escapeHtml } from '../core/formatters.js';

const item = (extra = {}) => ({ id: 'i1', editionId: 'e1', editionTitle: 'Mort', workTitle: 'Mort', status: 'bought', boughtAt: '2026-11-01T10:00:00Z', listedAt: null, soldAt: null, droppedAt: null, ageDays: 3, next: ['listed', 'dropped'], canUndo: true, ...extra });

test('no data is "-", never 0', () => {
  assert.equal(daysLabel(null), '-');
  assert.equal(daysLabel(undefined), '-');
  assert.equal(daysLabel(1), '1 dzień');
  assert.equal(daysLabel(12), '12 dni');
  const empty = stockSummaryLabel({ counts: {}, medians: { boughtToListed: null, listedToSold: null }, soldIn30: { sold: 0, of: 0 } });
  assert.match(empty, /kupno → wystawienie: -/);
  assert.match(empty, /sprzedane w 30 dni: -$/);
  assert.match(stockSummaryLabel({ counts: { sold: 2 }, medians: { listedToSold: 30 }, soldIn30: { sold: 1, of: 4 } }), /wystawienie → sprzedaż: 30 dni · sprzedane w 30 dni: 1 z 4/);
});

test('the board has three columns with the moves a state allows, and escapes titles', () => {
  const html = stockBoardMarkup({ items: [item({ workTitle: '<b>x</b>' }), item({ id: 'i2', status: 'listed', next: ['sold', 'dropped'] }), item({ id: 'i3', status: 'dropped', next: [] })] }, escapeHtml);
  assert.match(html, /Kupione <small>1<\/small>/);
  assert.match(html, /Wystawione <small>1<\/small>/);
  assert.match(html, /data-stock-move="i1" data-to="listed"[^>]*>Wystawiłem/);
  assert.match(html, /data-stock-move="i2" data-to="sold"[^>]*>Sprzedałem/);
  assert.match(html, /Odpuszczone \(1\)/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(stockBoardMarkup({ items: [] }, escapeHtml), /Zapas jest pusty/);
});

test('a purchase of an unassigned offer tells the owner to verify it first', async () => {
  const messages = [];
  const failing = async () => { throw Error('OFFER_NOT_IDENTIFIED'); };
  assert.equal(await recordPurchase({ json: failing, toast: (m) => messages.push(m), body: { offerId: 'o' } }), null);
  assert.match(messages[0], /Kolejce/);
  assert.match(stockErrorMessage(Error('x')), /Nie udało się/);
  const ok = await recordPurchase({ json: async () => ({ id: 'n' }), toast: (m, a) => messages.push(a?.label), body: { offerId: 'o' } });
  assert.equal(ok.id, 'n');
  assert.equal(messages[1], 'Cofnij');
});

test('the toast undo sends the event id, a 409 gives a message; the card carries the last event', async () => {
  const calls = [];
  const messages = [];
  const json = async (url, options) => { calls.push([url, options?.body]); return { id: 'n', eventId: 7, created: true }; };
  const { recordListing } = await import('./stock.js');
  let action;
  await recordListing({ json, toast: (m, a) => { messages.push(m); action = a || action; }, editionId: 'e' });
  await action.onClick();
  assert.deepEqual(calls.at(-1), ['/api/stock/n/undo', JSON.stringify({ expectedEventId: 7 })]);
  action.onError(Error('STOCK_CHANGED'));
  assert.match(messages.at(-1), /zmieniła się/);
  assert.match(stockBoardMarkup({ items: [item({ lastEventId: 9 })] }, escapeHtml), /data-stock-undo="i1" data-event="9"/);
  assert.doesNotMatch(stockBoardMarkup({ items: [item({ boughtKnown: false, listedAt: '2026-11-02T10:00:00Z', status: 'listed' })] }, escapeHtml), /kupiona/);
});

test('reminder marker shows days, expected days and the suggested price; calibration hides numbers below 20 sold', () => {
  const reminder = { itemId: 'i1', daysListed: 34, expectedDays: 20, suggestion: 1700, reason: null };
  const html = stockBoardMarkup({ items: [item({ status: 'listed', listedAt: '2026-10-01T10:00:00Z', next: ['sold', 'dropped'] })] }, escapeHtml, { i1: reminder });
  assert.match(html, /leży 34 dni, przewidywane 20 dni; sugerowana obniżka do 17 zł/);
  assert.match(html, /data-stock-repriced="i1"/);
  assert.match(html, /data-stock-keep="i1"/);
  const none = stockBoardMarkup({ items: [item({ status: 'listed', next: ['sold'] })] }, escapeHtml, {});
  assert.doesNotMatch(none, /stock-aging/);
  const blind = stockBoardMarkup({ items: [item({ status: 'listed', next: ['sold'] })] }, escapeHtml, { i1: { ...reminder, suggestion: null, reason: 'za_malo_ofert' } });
  assert.match(blind, /za mało ofert/);
  assert.match(calibrationLabel({ enough: false }), /za mało danych$/);
  assert.doesNotMatch(calibrationLabel({ enough: false }), /%|prób/);
  assert.match(calibrationLabel({ enough: true, own: 0.4, low: 0.2, high: 0.6, tries: 25, index: 0.3 }), /40%.*20%–60%, 25 prób.*30%/);
});

test('session purchase: skipped ISBNs get a reason, the toast undo sends one event id per copy', async () => {
  const calls = [];
  const messages = [];
  const result = { created: [{ isbn: '1', id: 'a', eventId: 5 }, { isbn: '2', id: 'b', eventId: 6 }], skipped: [{ isbn: '3', reason: 'not_in_catalogue' }] };
  const json = async (url, options) => { calls.push([url, options?.body]); return url === '/api/stock/batch' ? result : {}; };
  let action;
  const undone = [];
  await recordSessionPurchase({ json, toast: (m, a) => { messages.push(m); action = a || action; }, isbns: ['1', '2', '3'], onUndone: (list) => undone.push(...list) });
  assert.equal(calls[0][0], '/api/stock/batch');
  assert.match(messages[0], /Dodano do zapasu: 2 książki/);
  assert.ok(messages[0].includes('3 (brak wydania w katalogu — dodaj ISBN w Kolejce'));
  await action.onClick();
  assert.deepEqual(calls.slice(1).map((call) => call[1]), [JSON.stringify({ expectedEventId: 5 }), JSON.stringify({ expectedEventId: 6 })]);
  assert.deepEqual(undone, ['1', '2']);
  assert.match(purchaseSummary({ created: [], skipped: [{ isbn: 'x', reason: 'invalid_isbn' }] }), /nie wygląda na ISBN/);
  const none = [];
  assert.equal(await recordSessionPurchase({ json: async () => { throw Error('TOO_MANY_ITEMS'); }, toast: (m) => none.push(m), isbns: ['1'] }), null);
  assert.match(none[0], /Za dużo/);
});
