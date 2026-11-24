// „Okazje” → „Rynek” (market-index.mjs, /api/market/index): every edition with what a used copy
// resells for, the chance a listed copy sells within 30 days, the usual time to a sale, the copies
// on sale now and the turnover (value × chance). The view the niche-or-broad question is read on.
import { coverMarkup, parseBnPeople } from '../core/bibliography.js';
import { zl } from '../core/valuation.js';
import { liquidityLabel } from './deals.js';

const PAGE = 50;

/** One edition of the index. Pure (tested). */
export function marketRowMarkup(item, { escapeHtml }) {
  // The catalogue's reading of BN author strings; three names at most (anthologies list dozens).
  const people = parseBnPeople((item.authors || []).join(' '), item.authors).slice(0, 3).join(', ');
  const supply = item.liquidity.live === 1 ? '1 egzemplarz w sprzedaży' : `${item.liquidity.live} w sprzedaży`;
  const record = item.liquidity.listings ? `sprzedane ${item.liquidity.sales} z ${item.liquidity.listings} na Vinted` : 'bez ofert na Vinted (średnia rynku)';
  return `<article class="market-row"><button type="button" class="market-open" data-market-work="${escapeHtml(item.workId)}" title="Strona książki">${coverMarkup(item.cover, item.title, { size: 'sm', escapeHtml })}<span class="market-copy"><b class="market-title">${escapeHtml(item.title)}</b><small>${escapeHtml([people, item.publisher, item.year].filter(Boolean).join(' · '))}</small><small class="deal-liquidity is-${escapeHtml(item.liquidity.level)}">${escapeHtml(liquidityLabel(item.liquidity))}</small><small>${escapeHtml(record)} · ${escapeHtml(supply)}</small></span></button><span class="market-numbers"><strong>~${zl(item.value)}</strong><small>${Math.round(item.low / 100)}–${zl(item.high)} · <span class="value-confidence is-${escapeHtml(item.confidence)}">${escapeHtml(item.confidenceLabel)}</span></small><span class="market-turnover" title="Wartość × szansa sprzedaży w 30 dni">obrót ~${zl(item.turnover)}</span></span></article>`;
}

/** "Rynek: 2 364 ofert Vinted, 151 sprzedanych — przeciętnie 18% szans na sprzedaż w 30 dni." */
export function marketSummary(data) {
  const m = data?.market;
  if (!m) return '';
  return `${data.total} wydań z wyceną. Na Vinted ${m.listings} ofert tych wydań, ${m.sales} sprzedanych — przeciętny egzemplarz ma ${Math.round((m.chance ?? 0) * 100)}% szans na sprzedaż w 30 dni.`;
}

/** „Jak trafne są wyceny”: last price of vanished (sold) offers against the valuation from before they vanished. Pure (tested). */
/** A second table of the backtest (by price, by sales behind the valuation); empty when the server sent none. */
function splitTable(title, groups, row) {
  if (!Array.isArray(groups) || !groups.length) return '';
  return `<table class="backtest-table"><thead><tr><th scope="col">${title}</th><th scope="col">Próby</th><th scope="col">Mediana</th><th scope="col">Środek (25–75%)</th><th scope="col">W pasie</th></tr></thead><tbody>${groups.map((group) => row(group.label, group)).join('')}</tbody></table>`;
}

export function backtestMarkup(data, { escapeHtml }) {
  if (!data?.overall) return '<p class="inline-note">Nie udało się odczytać sprawdzianu wycen.</p>';
  const pct = (value) => Math.round(value * 100) + '%';
  const ratio = (value) => String(value).replace('.', ',');
  const row = (label, group) =>
    group.enough
      ? `<tr><th scope="row">${escapeHtml(label)}</th><td>${group.samples}</td><td>${ratio(group.median)}</td><td>${ratio(group.p25)}–${ratio(group.p75)}</td><td>${pct(group.inBandShare)}</td></tr>`
      : `<tr><th scope="row">${escapeHtml(label)}</th><td>${group.samples}</td><td colspan="3">za mało danych (od ${data.minSamples} prób)</td></tr>`;
  return `<p class="inline-note">Ostatnia cena ofert sprzedanych w ostatnich ${data.days} dniach, podzielona przez wycenę ich wydania sprzed sprzedaży (bez danych z późniejszego czasu). 1,0 = wycena trafiła; pas ${ratio(data.band.low)}–${ratio(data.band.high)} = trafiona.</p><table class="backtest-table"><thead><tr><th scope="col">Pewność wyceny</th><th scope="col">Próby</th><th scope="col">Mediana</th><th scope="col">Środek (25–75%)</th><th scope="col">W pasie</th></tr></thead><tbody>${row('Wszystkie', data.overall)}${row('Wysoka', data.byConfidence.high)}${row('Średnia', data.byConfidence.medium)}${row('Niska', data.byConfidence.low)}</tbody></table>${splitTable('Wartość wyceny', data.byPrice, row)}${splitTable('Podstawa wyceny', data.bySales, row)}`;
}

const span = (minutes) => (minutes < 120 ? `${minutes} min` : `${Math.round(minutes / 60)} h`);
/** „Okno przewagi”: delay between listing and announcement, and how long a deal lives. Pure (tested). */
export function lifetimeMarkup(data) {
  if (!data || data.deals == null) return '<p class="inline-note">Nie udało się odczytać okna przewagi.</p>';
  const tail = `Okazje z ostatnich ${data.days} dni: ${data.deals}; bez czasu wystawienia ${data.noListingTime}; wciąż aktywne ${data.alive}.`;
  if (!data.enough) return `<p class="inline-note">Za mało danych (od ${data.minDeals} okazji z czasem wystawienia). ${tail}</p>`;
  const life = data.lifeMinutes
    ? ` Połowa okazji, które zniknęły, żyła do ${span(data.lifeMinutes.p50)}, 75% do ${span(data.lifeMinutes.p75)} (${data.gone} zniknęło).`
    : ' Żadna okazja jeszcze nie zniknęła.';
  return `<p class="inline-note">Okazję zauważasz mediana ${span(data.medianDelayMinutes)} po wystawieniu.${life} ${tail}</p>`;
}

import { marketMapSvg } from './market-map.js';

export function installMarket({ $, json, escapeHtml, openWork }) {
  const list = $('#marketList');
  if (!list) return { refresh: async () => {} };
  let items = [];
  let total = 0;
  let serial = 0;
  let timer = null;
  const params = (offset) =>
    new URLSearchParams({
      sort: $('#marketSort').value,
      limit: String(PAGE),
      offset: String(offset),
      ...($('#marketSearch').value.trim() ? { q: $('#marketSearch').value.trim() } : {}),
      ...($('#marketReliable').checked ? { confidence: 'medium' } : {}),
    });
  // The map shows the reliable valuations (up to 200 by turnover), whatever the list below is filtered to.
  let mapLoaded = false;
  async function loadMap() {
    const box = $('#marketMap');
    if (!box || mapLoaded) return;
    mapLoaded = true;
    try {
      const data = await json('/api/market/index?' + new URLSearchParams({ sort: 'turnover', limit: '200', confidence: 'medium' }));
      const svg = marketMapSvg(data.items || [], { zl: (grosze) => `${Math.round(grosze / 100)} zł`, escapeHtml });
      box.hidden = !svg;
      box.innerHTML = svg ? `<h3>Mapa rynku</h3><p class="inline-note">Każda kropka to wydanie z wiarygodną wyceną; wielkość = obrót (wycena × szansa). Prawy górny róg: warte sporo i szybko schodzą. Kliknij kropkę, żeby otworzyć książkę.</p>${svg}` : '';
    } catch {
      mapLoaded = false;
    }
  }
  $('#marketMap')?.addEventListener('click', (event) => {
    const dot = event.target.closest?.('[data-work]');
    if (dot) openWork(dot.dataset.work);
  });
  $('#marketMap')?.addEventListener('keydown', (event) => {
    const dot = event.target.closest?.('[data-work]');
    if (dot && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openWork(dot.dataset.work);
    }
  });
  function render(data) {
    void loadMap();
    $('#marketSummary').textContent = marketSummary(data);
    list.innerHTML = items.length
      ? items.map((item) => marketRowMarkup(item, { escapeHtml })).join('') + (items.length < total ? `<button type="button" class="button secondary compact market-more" data-market-more>Pokaż więcej (${items.length} z ${total})</button>` : '')
      : '<p class="inline-note">Brak wydań z wyceną dla tych ustawień.</p>';
    list.querySelectorAll('[data-market-work]').forEach((button) => button.addEventListener('click', () => openWork(button.dataset.marketWork)));
    list.querySelector('[data-market-more]')?.addEventListener('click', () => void load(items.length));
  }
  async function load(offset = 0) {
    const request = ++serial;
    let data;
    try {
      data = await json('/api/market/index?' + params(offset));
    } catch {
      if (request === serial) list.innerHTML = '<p class="inline-note">Nie udało się odczytać indeksu rynku.</p>';
      return;
    }
    if (request !== serial) return;
    items = offset ? [...items, ...data.items] : data.items;
    total = data.total;
    render(data);
  }
  $('#backtestPanel')?.addEventListener('toggle', async (event) => {
    const panel = event.target;
    if (!panel.open || panel.dataset.loaded) return;
    panel.dataset.loaded = '1';
    let data = null;
    try {
      data = await json('/api/valuation/backtest');
    } catch {
      panel.dataset.loaded = '';
    }
    $('#backtestBody').innerHTML = backtestMarkup(data, { escapeHtml });
  });
  $('#lifetimePanel')?.addEventListener('toggle', async (event) => {
    const panel = event.target;
    if (!panel.open || panel.dataset.loaded) return;
    panel.dataset.loaded = '1';
    let data = null;
    try {
      data = await json('/api/deals/lifetime');
    } catch {
      panel.dataset.loaded = '';
    }
    $('#lifetimeBody').innerHTML = lifetimeMarkup(data);
  });
  $('#marketSort').addEventListener('change', () => void load());
  $('#marketReliable').addEventListener('change', () => void load());
  $('#marketSearch').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 250);
  });
  return { refresh: () => load() };
}
