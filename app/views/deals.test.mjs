import assert from 'node:assert/strict';
import test from 'node:test';

import { dealMarkup, dealsCountLabel, demandLabel, triageCountsLabel, triageMarkup, visibleDeals } from './deals.js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (grosze) => `${grosze / 100} zł`;
const deal = (extra) => ({
  offerId: 'o1',
  title: 'Mort <Pratchett>',
  source: 'Vinted',
  url: 'https://example.test/o1',
  price: 2000,
  condition: 'good',
  firstSeenAt: '2026-11-10T10:00:00Z',
  workId: 'w',
  workTitle: 'Mort',
  worth: 4000,
  worthLow: 3500,
  worthHigh: 4500,
  saving: 2000,
  discount: 50,
  suspicious: false,
  confidence: 'medium',
  confidenceLabel: 'średnia',
  sold: 2,
  live: 3,
  reasons: ['2 potwierdzone sprzedaże.'],
  ...extra,
});

test('low-confidence deals are hidden unless asked for, and the order follows the choice', () => {
  const items = [
    deal({ offerId: 'a', saving: 1000, discount: 60 }),
    deal({ offerId: 'b', saving: 3000, discount: 30, confidence: 'low' }),
    deal({ offerId: 'c', saving: 2000, discount: 40 }),
  ];
  const ids = (options) => visibleDeals(items, options).map((item) => item.offerId);
  assert.deepEqual(ids(), ['c', 'a']);
  assert.deepEqual(ids({ includeLow: true }), ['b', 'c', 'a']);
  assert.deepEqual(ids({ sort: 'discount' }), ['a', 'c']);
  assert.equal(
    dealsCountLabel(items, visibleDeals(items)),
    '2 okazje · 1 ukryta (niska wiarygodność wyceny)',
  );
});

test('a price drop shows a badge with the old price in title and aria-label', () => {
  const none = dealMarkup(deal(), { escapeHtml, money });
  assert.doesNotMatch(none, /deal-price-drop/);
  const row = dealMarkup(deal({ priceDrop: { from: 2500, percent: 20 } }), { escapeHtml, money });
  assert.match(row, /class="deal-price-drop"/);
  assert.match(row, />obniżka −20%</);
  assert.match(row, /title="Sprzedawca obniżył cenę z 25 zł do 20 zł/);
  assert.match(row, /aria-label="Sprzedawca obniżył cenę z 25 zł do 20 zł/);
});

test('a deal row shows price, worth, saving and the links; a suspicious one warns', () => {
  const row = dealMarkup(deal(), { escapeHtml, money });
  assert.match(row, /warta ~40 zł/);
  assert.match(row, /class="deal-saving">−20 zł</);
  assert.match(row, /−50% · za <b>20 zł<\/b>/);
  assert.match(row, /wiarygodność średnia/);
  assert.match(row, /2 sprzedaże, 3 oferty/);
  assert.match(dealMarkup(deal({ sold: 0, live: 1 }), { escapeHtml, money }), /1 oferta</);
  assert.match(row, /data-deal-open="o1"/);
  assert.match(row, /data-deal-work="w"/);
  // The book link does not repeat a title the listing already names; another title is shown.
  assert.match(row, />strona książki</);
  assert.match(dealMarkup(deal({ workTitle: 'Straż nocna' }), { escapeHtml, money }), />Straż nocna</);
  assert.match(row, /href="https:\/\/example.test\/o1"/);
  assert.doesNotMatch(row, /<Pratchett>/);
  assert.doesNotMatch(row, /sprawdź, czy oferta/);
  assert.match(
    dealMarkup(deal({ suspicious: true }), { escapeHtml, money }),
    /sprawdź, czy oferta/,
  );
});

test('rated deals are hidden unless asked for or rated in this visit; the summary says how often the list was right', async () => {
  const { verdictSummaryLabel } = await import('./deals.js');
  const items = [deal({ offerId: 'a' }), deal({ offerId: 'b', verdict: 'good' }), deal({ offerId: 'c', verdict: 'wrong_match' })];
  const ids = (options) => visibleDeals(items, options).map((item) => item.offerId);
  assert.deepEqual(ids(), ['a']);
  assert.deepEqual(ids({ showRated: true }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ keep: new Set(['c']) }), ['a', 'c']);
  assert.equal(dealsCountLabel(items, visibleDeals(items)), '1 okazja · 2 ocenione ukryte');
  assert.match(dealMarkup(items[0], { escapeHtml, money }), /data-deal-rate="a" data-verdict="wrong_match"/);
  const rated = dealMarkup(items[1], { escapeHtml, money });
  assert.match(rated, /Ocena: <b>Trafna<\/b>/);
  assert.match(rated, /data-deal-unrate="b"/);
  assert.doesNotMatch(rated, /data-deal-rate=/);
  assert.match(verdictSummaryLabel(null), /^Ocenione: 0\./);
  assert.equal(
    verdictSummaryLabel({
      total: 4,
      counts: { good: 3, wrong_match: 1, condition: 0, overvalued: 0 },
      byConfidence: { medium: { total: 3, good: 2 }, high: { total: 1, good: 1 } },
    }),
    'Ocenione: 4 — trafna 3 (75%) · złe przypisanie 1. Przy wiarygodności wysokiej trafne 1 z 1; przy wiarygodności średniej trafne 2 z 3.',
  );
});

test('favourites and edition demand are shown and can order the list', () => {
  assert.equal(demandLabel(deal()), '');
  const hot = deal({ offerId: 'hot', favourites: 12, demand: { median: 9, offers: 5, level: 'high' } });
  assert.equal(demandLabel(hot), '♥ 12 · popyt wysoki (mediana 9 polubień w 5 ofertach Vinted)');
  assert.equal(demandLabel(deal({ favourites: 0 })), '♥ 0');
  assert.match(dealMarkup(hot, { escapeHtml, money }), /class="deal-demand is-high"/);
  const items = [deal({ offerId: 'none', saving: 5000 }), deal({ offerId: 'low', demand: { median: 1, offers: 2, level: 'low' } }), hot];
  assert.deepEqual(visibleDeals(items, { sort: 'demand' }).map((item) => item.offerId), ['hot', 'low', 'none']);
});

test('triage: hidden deals are left out unless asked for, with the count in the label', () => {
  const items = [deal({ offerId: 'a' }), deal({ offerId: 'b', hidden: true, triage: { state: 'snoozed', visible: false } }), deal({ offerId: 'c', hidden: false, triage: { state: 'dismissed', visible: true, returned: 'price_drop' } })];
  const ids = (options) => visibleDeals(items, options).map((item) => item.offerId).sort();
  assert.deepEqual(ids({}), ['a', 'c']);
  assert.deepEqual(ids({ showHidden: true }), ['a', 'b', 'c']);
  assert.equal(dealsCountLabel(items, visibleDeals(items)), '2 okazje · 1 odłożona lub odrzucona');
});

test('triage: counts label and buttons markup', () => {
  assert.equal(triageCountsLabel(null), '');
  assert.equal(triageCountsLabel({ counts: { new: 5, snoozed: 2, seen: 0, dismissed: 1 } }), '5 nowe, 2 odłożone, 1 odrzucona');
  const open = triageMarkup(deal({ offerId: 'x"y', hidden: false, triage: { state: 'seen', visible: true, returned: 'snooze_over' } }), escapeHtml);
  for (const label of ['Obejrzane', 'Odłóż do jutra', 'Nie dla mnie']) assert.match(open, new RegExp(label));
  assert.match(open, /data-deal-triage="x&#34;y"/);
  assert.match(open, /wróciła: koniec odłożenia/);
  const set = triageMarkup(deal({ hidden: true, triage: { state: 'dismissed', visible: false } }), escapeHtml);
  assert.match(set, /Odrzucona/);
  assert.match(set, /data-deal-untriage="o1"/);
  assert.doesNotMatch(set, /data-deal-triage=/);
});

test('the gauge puts the price against the valuation band on one scale', async () => {
  const { gaugeMarkup } = await import('./deals.js');
  const html = gaugeMarkup({ price: 10000, worth: 28400, worthLow: 24200, worthHigh: 32600 }, { escapeHtml, money });
  assert.match(html, /class="deal-gauge" role="img" aria-label="Cena /);
  assert.ok(html.includes('deal-gauge-price" data-left="27.9"'), html); // 100 of a max of 358.6
  assert.ok(html.includes('deal-gauge-band" data-left="67.5" data-width="23.4"'), html);
  assert.equal(gaugeMarkup({ price: 0, worth: 0 }, { escapeHtml, money }), '');
});

test('visibleDeals with onlyCheapest keeps only cheapest-live deals; the count label names them separately', () => {
  const items = [
    deal({ offerId: 'a', cheapestLive: true }),
    deal({ offerId: 'b', cheapestLive: false }),
    deal({ offerId: 'c', cheapestLive: false, verdict: 'good' }),
  ];
  const shown = visibleDeals(items, { onlyCheapest: true });
  assert.deepEqual(shown.map((item) => item.offerId), ['a']);
  const label = dealsCountLabel(items, shown, { onlyCheapest: true });
  assert.match(label, /2 ukryte przez „Tylko najtańsze w wydaniu”/);
  assert.doesNotMatch(label, /ocenion|niska wiarygodność/);
});

test('a low-confidence deal says „do sprawdzenia” with a range and a „Kupuję do…” shortcut; medium keeps the worth', () => {
  const low = dealMarkup(deal({ confidence: 'low', confidenceLabel: 'niska', editionId: 'e<1>' }), { escapeHtml, money });
  assert.match(low, /class="deal-check"[^>]*>do sprawdzenia</);
  assert.match(low, /wycena orientacyjnie <small>35–45 zł</);
  assert.match(low, /data-deal-target="e&#60;1&#62;"[^>]*>Kupuję do…</);
  assert.doesNotMatch(low, /warta ~/);
  const medium = dealMarkup(deal({ editionId: 'e1' }), { escapeHtml, money });
  assert.match(medium, /warta ~40 zł <small>\(35–45 zł\)<\/small>/);
  assert.doesNotMatch(medium, /do sprawdzenia|data-deal-target/);
});
