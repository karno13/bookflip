import assert from 'node:assert/strict';
import test from 'node:test';

import { huntLiquidityLabel, hunterResultMarkup, hunterUrl, shelfPriceParam, markSessionBought, sessionBuyMarkup, sessionToBuy } from './hunter.js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (grosze) => `${grosze / 100} zł`;
const render = (result) => hunterResultMarkup(result, { escapeHtml, money });
const found = (extra) => ({
  found: true,
  isbn: '9788373196032',
  edition: { id: 'e', title: 'Mort <1>', authors: ['Terry Pratchett'], publisher: 'Prószyński', year: 2001 },
  value: { estimate: 4000, low: 3500, high: 4500, confidence: 'medium', confidenceLabel: 'średnia' },
  liquidity: { chance: 0.28, medianDays: 57, level: 'fast', sales: 4, live: 3 },
  listed: { count: 3, cheapest: 2000 },
  price: 1500,
  verdict: { verdict: 'warto', label: 'Warto: wyraźnie poniżej wyceny', ratio: 0.38 },
  caution: null,
  ...extra,
});

test('shelf price and the request address', () => {
  assert.equal(shelfPriceParam('15.50'), '15,50');
  assert.equal(shelfPriceParam(' 15,00 '), '15,00');
  assert.equal(shelfPriceParam(''), null);
  assert.equal(shelfPriceParam('abc'), null);
  assert.equal(shelfPriceParam('0'), null);
  assert.equal(hunterUrl(' 978-83 ', '15,00'), '/api/hunter?isbn=978-83&price=15%2C00');
  assert.equal(hunterUrl('9788373196032', ''), '/api/hunter?isbn=9788373196032');
});

test('a found book shows the verdict in text and icon, the valuation, sales chance and listings', () => {
  const html = render(found());
  assert.match(html, /hunter-verdict is-good/);
  assert.match(html, /Warto brać/);
  assert.match(html, /cena to 38% wyceny/);
  assert.match(html, /aria-hidden="true">✔</);
  assert.match(html, /Mort &#60;1&#62;/);
  assert.match(html, /Terry Pratchett · Prószyński · 2001/);
  assert.match(html, /<b>40 zł<\/b>[\s\S]*35–45 zł[\s\S]*wiarygodność średnia/);
  assert.match(html, /28% szans na sprzedaż w 30 dni · schodzi szybko · zwykle ~57 dni/);
  assert.match(html, /3 oferty, najtańsza 20 zł/);
});

test('verdict tones: expensive is bad, borderline is a warning, no price asks for one', () => {
  const tone = (verdict) => render(found({ verdict: { verdict, label: 'x', ratio: 1.2 } }));
  assert.match(tone('drogo'), /is-bad/);
  assert.match(tone('drogo'), />Drogo</);
  assert.match(tone('granica'), /is-warn/);
  assert.match(tone('raczej_tak'), /is-good/);
  assert.match(render(found({ price: null, verdict: null })), /Wpisz cenę z półki/);
});

test('caution, empty valuation and no listings are said in Polish', () => {
  assert.match(render(found({ caution: 'low_confidence' })), /Wycena jest niepewna/);
  const none = render(found({ value: null, verdict: null, caution: 'no_valuation', listed: { count: 0, cheapest: null } }));
  assert.match(none, /Brak wiarygodnej wyceny/);
  assert.match(none, /<b>brak<\/b>/);
  assert.match(none, /brak ofert/);
});

test('unknown and invalid ISBN, and outside strings are escaped', () => {
  assert.match(render({ found: false, reason: 'not_in_catalogue', isbn: '9780306406157' }), /Tej książki nie ma w katalogu ani w zapisanych ofertach/);
  assert.match(render({ found: false, reason: 'invalid_isbn', isbn: null }), /To nie wygląda na ISBN\./);
  assert.doesNotMatch(render(found({ edition: { title: '<img onerror=x>', authors: ['<b>'], publisher: null, year: null } })), /<img|<b>(?!4)/);
  assert.equal(render(null), '');
  assert.equal(huntLiquidityLabel(null), '');
  assert.match(huntLiquidityLabel({ chance: 0.1, medianDays: 400, level: 'slow' }), /schodzi wolno · zwykle ponad rok/);
});

import { scanFeedback, scanStripMarkup } from './hunter.js';

test('the strip under the camera: verdict, title and „opłaca się do” in one line, escaped', () => {
  const strip = (result) => scanStripMarkup(result, { escapeHtml, money });
  assert.equal(strip(found({ worthUpTo: 3000 })), '<p class="hunter-strip is-good"><b>✔ Warto brać</b> · Mort &#60;1&#62; · opłaca się do 30 zł · półka 15 zł</p>');
  assert.match(strip(found({ verdict: { verdict: 'drogo' }, targetMet: true, worthUpTo: null })), /is-good"><b>✔ W Twoim celu<\/b> · Mort &#60;1&#62; · bez wyceny/);
  assert.match(strip(found({ verdict: { verdict: 'drogo' } })), /is-bad"><b>✖ Drogo/);
  assert.match(strip(found({ verdict: null, price: null })), /is-neutral"><b>Bez werdyktu/);
  assert.match(strip({ found: false, reason: 'not_in_catalogue', isbn: '9780306406157' }), /9780306406157: brak w katalogu i w ofertach/);
  assert.equal(strip(null), '');
});

const outside = (extra) => ({
  found: false,
  reason: 'not_in_catalogue',
  isbn: '9780306406157',
  market: { title: 'Zabójca <z> sąsiedztwa', offers: 5, value: { estimate: 3000, low: 2600, high: 3400, confidence: 'medium', confidenceLabel: 'średnia' }, listed: { count: 3, cheapest: 2800 } },
  price: 1000,
  verdict: { verdict: 'warto', label: 'Warto: wyraźnie poniżej wyceny', ratio: 0.33 },
  worthUpTo: 2200,
  caution: null,
  ...extra,
});

test('a book outside the catalogue with offers of its ISBN gets a valuation from them, marked as such', () => {
  const html = render(outside());
  assert.match(html, /hunter-card is-outside/);
  assert.match(html, /Wycena z 5 ofert z tym samym ISBN \(tytuł z ogłoszeń, nie z katalogu\)/);
  assert.match(html, /Zabójca &#60;z&#62; sąsiedztwa/);
  assert.match(html, /Wycena z ofert<\/span><b>30 zł<\/b>/);
  assert.match(html, /Opłaca się do<\/span><b>22 zł<\/b>/);
  assert.match(html, /3 oferty, najtańsza 28 zł/);
  assert.match(html, /Warto brać/);
});

test('owner’s target, „opłaca się do”, copies in stock and a removed work are on the card', () => {
  const html = render(found({ target: 2500, targetMet: true, worthUpTo: 3000, inStock: 2, removed: true, valueBasis: 'isbn_offers' }));
  assert.match(html, /hunter-target is-met[\s\S]*Twój cel „Kupuję do”<\/span><b>25 zł<\/b>[\s\S]*bierz/);
  assert.match(html, /Opłaca się do<\/span><b>30 zł<\/b>/);
  assert.match(html, /Masz już 2 sztuki w zapasie\./);
  assert.match(html, /Usunąłeś to dzieło z katalogu\./);
  assert.match(html, /Wycena z ofert z tym ISBN/);
  const plain = render(found());
  assert.doesNotMatch(plain, /Twój cel|Opłaca się do|w zapasie|Usunąłeś/);
});

test('scan feedback: worth it or within the target is good, a known book is known, nothing is unknown', () => {
  assert.equal(scanFeedback(found()), 'good');
  assert.equal(scanFeedback(found({ verdict: { verdict: 'drogo' } })), 'known');
  assert.equal(scanFeedback(found({ verdict: { verdict: 'drogo' }, targetMet: true })), 'good');
  assert.equal(scanFeedback(outside({ verdict: null })), 'known');
  assert.equal(scanFeedback({ found: false, reason: 'not_in_catalogue', isbn: '1' }), 'unknown');
  assert.equal(scanFeedback(null), 'unknown');
});

test('a session row of a book outside the catalogue keeps the sellers’ title and cannot be bought into stock', () => {
  const item = sessionItemFromResult(outside(), '', '10');
  assert.deepEqual(item, { isbn: '9780306406157', title: 'Zabójca <z> sąsiedztwa', shelf: 1000, estimate: 3000, verdict: 'warto', take: false, outside: true });
  const taken = { ...item, take: true };
  assert.deepEqual(sessionToBuy([taken]), []);
  assert.deepEqual(parseSession(serializeSession([taken]))[0].outside, true);
  const html = sessionListMarkup([taken], deps);
  assert.match(html, /Spoza katalogu/);
  assert.doesNotMatch(html, /data-hunter-bought/);
});

import {
  SESSION_LIMIT,
  parseSession,
  removeSessionItem,
  serializeSession,
  sessionBarMarkup,
  sessionItemFromResult,
  sessionListMarkup,
  sessionTotals,
  shelfGrosze,
  toggleSessionTake,
  upsertSessionItem,
} from './hunter.js';

const row = (isbn, extra) => ({ isbn, title: `T ${isbn}`, shelf: 1500, estimate: 4000, verdict: 'warto', take: false, ...extra });
const deps = { escapeHtml, money };

test('a lookup becomes a session row; invalid ISBN is not kept; unknown book keeps the typed ISBN and price', () => {
  assert.deepEqual(sessionItemFromResult(found(), 'x', '15'), { isbn: '9788373196032', title: 'Mort <1>', shelf: 1500, estimate: 4000, verdict: 'warto', take: false });
  assert.equal(sessionItemFromResult({ found: false, reason: 'invalid_isbn' }, 'abc', '5'), null);
  assert.deepEqual(sessionItemFromResult({ found: false, reason: 'not_in_catalogue', isbn: '9780306406157' }, '', '12,5'), {
    isbn: '9780306406157', title: null, shelf: 1250, estimate: null, verdict: null, take: false,
  });
  assert.equal(shelfGrosze('15,50'), 1550);
  assert.equal(shelfGrosze(''), null);
});

test('same ISBN updates the row in place and keeps "Biorę"; add, remove, toggle; limit', () => {
  let items = upsertSessionItem([], row('1'));
  items = upsertSessionItem(items, row('2'));
  items = toggleSessionTake(items, '1');
  items = upsertSessionItem(items, row('1', { shelf: 900 }));
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].isbn, items[0].shelf, items[0].take], ['1', 900, true]);
  assert.deepEqual(removeSessionItem(items, '1').map((entry) => entry.isbn), ['2']);
  assert.equal(toggleSessionTake(items, '2')[1].take, true);
  let many = [];
  for (let i = 0; i < SESSION_LIMIT + 5; i += 1) many = upsertSessionItem(many, row(String(i)));
  assert.equal(many.length, SESSION_LIMIT);
  assert.equal(many.at(-1).isbn, String(SESSION_LIMIT + 4));
});

test('totals count only picked rows; valuation sum skips rows without one and says how many', () => {
  const items = [row('1', { take: true }), row('2', { take: true, estimate: null }), row('3', { shelf: 100 })];
  assert.deepEqual(sessionTotals(items), { count: 3, picked: 2, shelfTotal: 3000, estimateTotal: 4000, withoutEstimate: 1 });
  assert.deepEqual(sessionTotals(null), { count: 0, picked: 0, shelfTotal: 0, estimateTotal: 0, withoutEstimate: 0 });
  const bar = sessionBarMarkup(items, deps);
  assert.match(bar, /3 książki/);
  assert.match(bar, /Biorę: <b>2<\/b>/);
  assert.match(bar, /Półka: <b>30 zł<\/b>/);
  assert.match(bar, /Wycena: <b>40 zł<\/b>[\s\S]*1 książka bez wyceny/);
});

test('session survives a round trip and broken storage', () => {
  const items = [row('1', { take: true }), row('2')];
  assert.deepEqual(parseSession(serializeSession(items)), items);
  assert.deepEqual(parseSession('{broken'), []);
  assert.deepEqual(parseSession(null), []);
  assert.deepEqual(parseSession('{"a":1}'), []);
  assert.deepEqual(parseSession(JSON.stringify([null, 5, { isbn: 7 }, { isbn: '9' }, { isbn: '9' }])).map((entry) => entry.isbn), ['9']);
});

test('session list shows title or ISBN, verdict text with icon, an aria-pressed toggle, and escapes', () => {
  const html = sessionListMarkup([row('1', { title: '<b>x</b>', take: true }), row('2', { title: null, estimate: null, verdict: null })], deps);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /Warto brać/);
  assert.match(html, /Brak w katalogu/);
  assert.match(html, /<strong>2<\/strong>/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /data-hunter-remove="1"/);
});

test('session: picked rows not yet bought are offered for purchase; bought rows are marked and survive storage', () => {
  const rows = [
    { isbn: '1', title: 'A', shelf: 1000, estimate: 3000, verdict: 'warto', take: true, bought: false },
    { isbn: '2', title: 'B', shelf: 1000, estimate: null, verdict: null, take: false, bought: false },
    { isbn: '3', title: 'C', shelf: 1000, estimate: null, verdict: null, take: true, bought: false },
  ];
  assert.deepEqual(sessionToBuy(rows), ['1', '3']);
  assert.ok(sessionBuyMarkup(rows).includes('Kupiłem zaznaczone (2)'));
  const html = sessionListMarkup(rows, { escapeHtml, money });
  assert.match(html, /data-hunter-bought="1"/);
  assert.doesNotMatch(html, /data-hunter-bought="2"/);
  const done = markSessionBought(rows, ['1']);
  assert.deepEqual(sessionToBuy(done), ['3']);
  assert.match(sessionListMarkup(done, { escapeHtml, money }), /W zapasie/);
  assert.equal(parseSession(serializeSession(done))[0].bought, true);
  assert.equal(upsertSessionItem(done, { ...rows[0], take: false, bought: false })[0].bought, true);
  assert.equal(sessionToBuy(markSessionBought(done, ['1'], false)).length, 2);
  assert.equal(sessionBuyMarkup([rows[1]]), '');
});
