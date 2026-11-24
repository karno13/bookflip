import { mountOfferAssignment } from './offer-assignment.js';
import { mountEditionHistory } from './edition-history.js';
import { mountListingCard } from './listing-card.js';
import { mountPriceTarget } from './price-targets.js';
import { mountWorkPrices, editionVariantSelect, wireEditionVariantSelects } from './work-prices.js';
import { mountEditionBuyback, annotateEditionLines, isbn13Of, buybackQuotes, checkBuyback } from './buyback.js';
import { bookTilesMarkup, bookOffersMarkup, bookActionsMarkup, bestBuyback, toggleBookPane } from './book-page.js';
import { openDetailView } from '../core/detail-navigation.js';
import { valuationLineMarkup, valuationPanelMarkup } from '../core/valuation.js';
import {markDirty,statusLabel,confirmDiscard,watchForm} from '../core/ux.js';
import { safeOfferHref , availabilityLabel, isPurchasable } from '../core/formatters.js';
import { urlForView } from '../core/view-history.js';
import { mountSeriesEditor, readSeries, seriesSummary } from './series.js';
import { confirmDialog } from '../core/dialogs.js';
import { labelChipsMarkup, mountWorkLabels, fillNameLists, installRowLabels } from './labels.js';
import { createLabelCollections } from './label-collections.js';
import { createCoverOrder, coverOrderMarkup } from './cover-order.js';
import { mountWorkRemoval, removeWork } from './removed-works.js';
import { coverMarkup, isbnCover, tidyWorkTitle, parseBnPeople, splitBnTitle, cleanPublisher } from '../core/bibliography.js';

const firstIsbn = (editions = []) =>
  editions.flatMap((edition) => edition.identifiers || []).find((item) => String(item.scheme).startsWith('isbn'))?.value;
const workCover = (work) => work.cover || (work.editions || []).find((edition) => edition.cover)?.cover || isbnCover(firstIsbn(work.editions));
const workAuthors = (work) => parseBnPeople((work.authors || []).join(' '), work.authors).join(', ');
// What is still missing in a work record — shown as chips and used by the "incomplete" filter.
function missingFacts(work) {
  const editions = work.editions || [];
  const missing = [];
  if (editions.some((edition) => !edition.publicationYear)) missing.push('rok');
  if (editions.some((edition) => !edition.publisher)) missing.push('wydawca');
  if (!firstIsbn(editions)) missing.push('ISBN');
  return missing;
}
// catalog workspace, preserving existing behavior while isolating its implementation.
export function createCatalogView({ state, $, $$, json, money, escapeHtml, visibleCatalogRows, openOfferDrawer, loadCatalogData, toast, showView, arrangeCovers, reloadWorks }) {
function catalogRows() {
  // Preserve the ordering and full-dataset filters returned by the server.
  return [...state.catalogWorks];
}

function validCoverIsbn(value) {
  const isbn = String(value || '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();
  if (/^\d{13}$/.test(isbn))
    return [...isbn].reduce((sum, d, i) => sum + Number(d) * (i % 2 ? 3 : 1), 0) % 10 === 0
      ? isbn
      : null;
  if (/^\d{9}[0-9X]$/.test(isbn))
    return [...isbn].reduce((sum, d, i) => sum + (10 - i) * (d === 'X' ? 10 : Number(d)), 0) %
      11 ===
      0
      ? isbn
      : null;
  return null;
}
function pluralForm(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (n === 1) return 'one';
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'few' : 'many';
}

function coverPreviewMarkup(identifiers = []) {
  const isbn = identifiers.map((item) => validCoverIsbn(item.value)).find(Boolean);
  const cover = isbn
    ? `<img class="cover-preview-image" src="${isbnCover(isbn)}" alt="" loading="lazy" decoding="async">`
    : '';
  return `<span class="cover-preview"><span class="book-spine" aria-hidden="true">▤</span>${cover}</span>`;
}
document.addEventListener(
  'load',
  (event) => {
    if (
      event.target instanceof HTMLImageElement &&
      event.target.classList.contains('cover-preview-image') &&
      event.target.naturalWidth > 1
    )
      event.target.closest('.cover-preview')?.classList.add('has-cover');
  },
  true,
);

let detailRequest = 0;
let sqliteAnnotations = null;
let seriesRequest = null;
async function loadSeries() {
  if (seriesRequest) return seriesRequest;
  seriesRequest = json('/api/catalog/series').then(response => {
    sqliteAnnotations = Object.fromEntries((response.items || []).map(item => [item.workId, { series: item.series, volume: item.volume }]));
    renderSeriesSummary();
  }).finally(() => { seriesRequest = null; });
  return seriesRequest;
}
async function saveSeries(workId, entry) {
  const saved = await json('/api/catalog/series/' + encodeURIComponent(workId), {
    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(entry)
  });
  if (!sqliteAnnotations) sqliteAnnotations = {};
  if (!saved.series) delete sqliteAnnotations[workId];
  else sqliteAnnotations[workId] = {series: saved.series, volume: saved.volume};
  return saved;
}
// The book page (review 11.2026, stage 3): on a computer the list gives way to one full-width page
// of the book — editions, offers of all editions, prices over time, sets with it, data origin. Opening
// it adds a history entry, so Back returns to the list.
const desktop = () => window.matchMedia('(min-width: 901px)').matches;
function setBookPage(open, { id = null, fromHistory = false } = {}) {
  const view = $('#view-catalog');
  const wasOpen = view.classList.contains('is-book-page');
  if (open && !wasOpen && !fromHistory && desktop())
    history.pushState({ ...(history.state || {}), view: 'catalog', book: id }, '', urlForView('catalog', id));
  view.classList.toggle('is-book-page', open);
}
function closeBookPage({ fromHistory = false } = {}) {
  const view = $('#view-catalog');
  if (!view.classList.contains('is-book-page')) return;
  // Opened from the list: Back is the way out (and the history stays one entry per page).
  if (!fromHistory && history.state?.book) {
    history.back();
    return;
  }
  view.classList.remove('is-book-page');
  state.selectedCatalogId = null;
  renderCatalog();
}

// A click on the dimmed list behind the book panel closes it (the ::after of the view is the dim layer).
document.addEventListener('click', (event) => {
  const view = $('#view-catalog');
  if (event.target === view && view.classList.contains('is-book-page') && desktop()) closeBookPage();
});

// Escape closes the book panel, unless the offer drawer, a dialog or a form field has the key.
document.addEventListener('keydown', (event) => {
  const view = $('#view-catalog');
  if (event.key !== 'Escape' || event.defaultPrevented || !desktop()) return;
  if (!view.classList.contains('is-book-page') || view.hidden) return;
  if ($('#offerDrawer') && !$('#offerDrawer').hidden) return;
  if (document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
  closeBookPage();
});

function queryEmptyMarkup() {
  const filtered=['#catalogSearch','#catalogAuthor','#catalogLabel','#catalogLanguage','#catalogPublisher','#catalogYear','#catalogBinding'].some(id=>$(id)?.value.trim())||Boolean(state.catalogGap);
  return filtered ? '<div class="empty-detail"><h3>Brak pasujących książek</h3><p>Zmień frazę lub usuń filtry wydań.</p></div>' : '<div class="empty-detail"><h3>Katalog jest pusty</h3><p>Zeskanuj oferty lub dodaj pierwszą książkę.</p></div>';
}
// "Braki w katalogu": what the empty detail panel used to be. Counts come from SQL (/api/catalog/gaps);
// a click filters the works list by that gap (server side, so the list total equals the count).
const GAP_LABELS = { publisher: 'bez wydawcy', year: 'bez roku', unknown: 'wydanie nieustalone' };
let gapsRequest = null;
let gapsAt = 0;
async function refreshGaps(force = false) {
  const mount = $('#catalogGaps');
  if (!mount || (!force && Date.now() - gapsAt < 10_000)) return;
  gapsAt = Date.now();
  gapsRequest ??= json('/api/catalog/gaps').finally(() => { gapsRequest = null; });
  try {
    const gaps = await gapsRequest;
    const counts = { publisher: gaps.withoutPublisher, year: gaps.withoutYear, unknown: gaps.unknown };
    mount.innerHTML = '<b>Braki:</b> ' + Object.entries(GAP_LABELS)
      .map(([key, label]) => `<button type="button" class="link-button${state.catalogGap === key ? ' is-active' : ''}" data-catalog-gap="${key}" aria-pressed="${state.catalogGap === key}">${counts[key]} ${label}</button>`)
      .join('') + (state.catalogGap ? ' <button type="button" class="link-button" data-catalog-gap="">Pokaż wszystkie</button>' : '') +
      ` <span class="gaps-complete" title="Wydania z wydawcą i rokiem (bez „Wydanie nieustalone”)">${gaps.completePct.toLocaleString('pl-PL')}% kompletnych wydań</span>`;
  } catch {
    mount.textContent = '';
  }
}
$('#catalogGaps')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-catalog-gap]');
  if (!button) return;
  state.catalogGap = button.dataset.catalogGap === state.catalogGap ? '' : button.dataset.catalogGap;
  void refreshGaps(true);
  // The same path as typing in the search field: reloads the works list from the server.
  $('#catalogSort').dispatchEvent(new Event('change'));
});
const labelCollections = createLabelCollections({ json, toast, escapeHtml, openBook: (id) => openCatalogDetail(id), arrange: arrangeCovers });
const coverOrder = createCoverOrder({ state, $, json, toast, render: () => renderCatalog(), reload: reloadWorks });
installRowLabels({ list: $('#catalogList'), json, toast, escapeHtml, findRow: (id) => state.catalogWorks?.find((row) => row.id === id) });
function renderCatalog() {
  if (!state.history) return;
  void refreshGaps();
  renderSeriesSummary();
  if (sqliteAnnotations === null && !seriesRequest) void loadSeries().catch(() => {});
  const labelsMode = document.body.dataset.catalogView === 'labels';
  $('#catalogList').classList.toggle('is-labels', labelsMode);
  if (labelsMode) {
    coverOrder.sync();
    coverOrder.forget(); // sub-labels may change here; the covers read them again
    $('#catalogList').classList.remove('is-grid');
    void labelCollections.render($('#catalogList'), { background: true });
    return;
  }
  // An open label drop-down is not swept away by a refresh in the background; closing it is a click away.
  if ($('#catalogList .row-label-menu')) return;
  const onlyIncomplete = $('#catalogIncompleteOnly')?.checked;
  const rows = catalogRows().filter((row) => !onlyIncomplete || missingFacts(row).length);
  $('#catalogList').classList.toggle('is-grid', document.body.dataset.catalogView === 'grid');
  // Covers of a label in its own order: each gets its place and the ← → buttons (cover-order.js).
  const arranging = coverOrder.sync().enabled;
  // With sub-labels the covers stand in sections („Bez podetykiety” + one per sub-label), still one global order.
  $('#catalogList').innerHTML = rows.length
    ? arranging
      ? coverOrder.coversHtml(visibleCatalogRows('works', rows), rows, catalogRowMarkup)
      : visibleCatalogRows('works', rows).map((row) => catalogRowMarkup(row)).join('')
    : queryEmptyMarkup();
  $$('[data-catalog-id]').forEach((button) =>
    button.addEventListener('click', () => openCatalogDetail(button.dataset.catalogId)),
  );
  $$('#catalogList [data-remove-work]').forEach((button) =>
    button.addEventListener('click', async () => {
      const wrap = button.closest('.catalog-row-wrap');
      button.disabled = true;
      wrap?.classList.add('is-removing');
      try {
        await removeWork(button.dataset.removeWork, { json, toast, loadCatalogData });
      } catch (error) {
        toast('Nie usunięto: ' + error.message);
        wrap?.classList.remove('is-removing');
        button.disabled = false;
      }
    }),
  );
}

const editionsLabel = (n) => `${n} ${n === 1 ? 'wydanie' : pluralForm(n) === 'few' ? 'wydania' : 'wydań'}`;

function catalogRowMarkup(row, order = null) {
  const title = tidyWorkTitle(row.title);
  const parts = splitBnTitle(row.title);
  const single = row.editionCount === 1 ? row.editions[0] : null;
  const meta = single
    ? [cleanPublisher(single.publisher), single.publicationYear].filter(Boolean).join(' · ') || 'Brak danych wydania'
    : editionsLabel(row.editionCount);
  const missing = missingFacts(row);
  // „×” removes the book straight from the list (no confirmation; „Cofnij” in the toast restores it).
  const orderAttrs = order ? ` data-cover-wrap="${escapeHtml(row.id)}" draggable="true"` : '';
  return `<div class="catalog-row-wrap${order ? ' is-orderable' : ''}"${orderAttrs}><button type="button" class="catalog-row-remove" data-remove-work="${escapeHtml(row.id)}" title="Usuń z katalogu (cofniesz w powiadomieniu)" aria-label="Usuń z katalogu: ${escapeHtml(title)}">×</button><button type="button" class="catalog-row-labels${row.labels?.length ? ' has-labels' : ''}" data-row-labels="${escapeHtml(row.id)}" title="Etykiety" aria-label="Etykiety: ${escapeHtml(title)}" aria-haspopup="dialog"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg></button><button class="catalog-row work-row ${row.id === state.selectedCatalogId ? 'active' : ''}" type="button" data-catalog-id="${escapeHtml(row.id)}" title="${escapeHtml(row.title)}"><span class="catalog-book-title">${coverMarkup(workCover(row), title, { size: 'md', escapeHtml })}<span class="catalog-book-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(workAuthors(row) || 'Autor nieznany')}</small><small class="work-meta">${escapeHtml(meta)}${parts.series ? ` · ${escapeHtml(parts.series)}${parts.volume ? ' ' + parts.volume : ''}` : ''}</small>${valuationLineMarkup(row.valuation, escapeHtml)}${missing.length ? `<small class="missing-facts">${missing.map((item) => `<span>brak: ${escapeHtml(item)}</span>`).join('')}</small>` : ''}${labelChipsMarkup(row.labels, escapeHtml)}</span></span><span>${row.editionCount}</span><span data-plural="${pluralForm(row.offerCount)}">${row.offerCount}</span><span>${['manual', 'verified'].includes(row.verificationStatus) ? '' : `<span class="status-pill warning">${escapeHtml(statusLabel(row.verificationStatus))}</span>`}</span></button>${order ? coverOrderMarkup({ id: row.id, title, ...order }, escapeHtml) : ''}</div>`;
}

function renderSeriesSummary() {
  const anchor = $('#catalogList');
  if (!anchor) return;
  let panel = $('#catalogSeriesSummary');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'catalogSeriesSummary';
    panel.className = 'series-summary panel';
    document.querySelector('#legacyImportActions').append(panel);
  }
  const groups = seriesSummary(state.catalogWorks, sqliteAnnotations || {});
  panel.replaceChildren();
  const label = document.createElement('strong');
  label.textContent = 'Import oznaczeń serii ze starszej wersji';
  panel.append(label);
  const info = document.createElement('p');
  info.textContent = sqliteAnnotations === null ? 'Ładowanie serii z SQLite…' : groups.length ? groups.map(group => `${group.name}: tomy ${group.volumes.join(', ')}`).join(' | ') : 'Wybierz dzieło, aby przypisać serię i numer tomu.';
  panel.append(info);
  const legacy = readSeries();
  const pending = Object.entries(legacy).filter(([workId, entry]) =>
    entry && typeof entry.series === 'string' && entry.series.trim() &&
    Number.isSafeInteger(entry.volume) && entry.volume > 0 && entry.volume <= 10000 &&
    sqliteAnnotations && !Object.hasOwn(sqliteAnnotations, workId));
  panel.hidden = pending.length === 0;
  if (sqliteAnnotations !== null && pending.length) {
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'button secondary compact';
    importButton.textContent = 'Importuj lokalne oznaczenia (' + pending.length + ')';
    const result = document.createElement('small');
    result.setAttribute('role', 'status');
    importButton.addEventListener('click', async () => {
      if (!(await confirmDialog('Importować ' + pending.length + ' lokalnych oznaczeń do SQLite? Istniejące wpisy zostaną pominięte.', { title: 'Import oznaczeń', confirmLabel: 'Importuj' }))) return;
      importButton.disabled = true;
      let imported = 0, skipped = 0, errors = 0;
      for (const [workId, entry] of pending) {
        try {
          const current = await json('/api/catalog/series');
          const existing = new Set((current.items || []).map(row => row.workId));
          if (existing.has(workId)) { skipped++; continue; }
          await saveSeries(workId, { series: entry.series.trim(), volume: entry.volume });
          imported++;
        } catch { errors++; }
      }
      result.textContent = 'Zaimportowano: ' + imported + ', pominięto: ' + skipped + ', błędy: ' + errors + '. Dane lokalne zachowano.';
      renderSeriesSummary();
    });
    panel.append(importButton, result);
  }
}

// Offers assigned to the book without a named edition; opening it lets the operator name them.
function unknownEditionLine(row) {
  const unknown = row.unknownEdition;
  if (!unknown?.activeOfferCount) return '';
  const n = unknown.activeOfferCount;
  return `<div class="edition-line-wrap is-unknown"><button type="button" class="link-button edition-line" data-edition-detail="${escapeHtml(unknown.id)}"><span class="book-spine" aria-hidden="true">?</span><span><strong>Wydanie nieustalone</strong><small>${n} ${n === 1 ? 'oferta' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'oferty' : 'ofert'} przypisane do książki bez wskazania wydania — otwórz, aby wskazać wydanie</small></span><b>${n}</b></button></div>`;
}

async function openCatalogDetail(id, { fromHistory = false } = {}) {
  if(!await confirmDiscard()) return;
  const request = ++detailRequest;
  setBookPage(true, { id, fromHistory });
  state.selectedCatalogId = id;
  openDetailView('catalog');
  renderCatalog();
  const detail = $('#catalogDetail');
  delete detail.dataset.editionId;
  detail.innerHTML = '<div class="empty-detail"><p>Wczytywanie rekordu...</p></div>';
  try {
    const row = await json(`/api/catalog/works/${encodeURIComponent(id)}`);
    if (request !== detailRequest) return;
    detail.scrollTop = 0;
    const isbns = [...new Set(row.editions.map((edition) => isbn13Of(edition.identifiers)).filter(Boolean))];
    const facts = [editionsLabel(row.editions.length), isbns.length ? '' : 'bez ISBN-13'].filter(Boolean).join(' · ');
    detail.innerHTML = `<button type="button" class="link-button book-back" data-book-back>← Wszystkie książki</button><header class="bp-head">${coverMarkup(workCover(row), tidyWorkTitle(row.title), { size: 'md', escapeHtml })}<div><h3 title="${escapeHtml(row.title)}">${escapeHtml(tidyWorkTitle(row.title))}</h3><p>${escapeHtml(workAuthors(row) || 'Autor nieznany')}</p><small><span class="status-pill ${['manual', 'verified'].includes(row.verificationStatus) ? 'success' : 'warning'}">${escapeHtml(statusLabel(row.verificationStatus))}</span> ${escapeHtml(facts)}</small></div></header><div class="bp-labels-slot"></div><div class="bp-actions" role="toolbar" aria-label="Akcje książki">${bookActionsMarkup(escapeHtml)}</div><div class="bp-panes"></div><section class="detail-section bp-value" aria-live="polite"></section><div class="bp-tiles" aria-live="polite">${bookTilesMarkup(null, null, { money, escapeHtml, isbns: isbns.length })}</div><section class="detail-section work-offers" aria-live="polite"><h4>Oferty</h4><p class="inline-note">Wczytywanie ofert…</p></section><section class="detail-section bp-editions"><h4>Wydania · ${row.editions.length} <small>wybierz, aby zobaczyć szczegóły</small></h4><div class="price-list">${unknownEditionLine(row)}${row.editions.map((edition) => `<div class="edition-line-wrap"><button type="button" class="link-button edition-line" data-edition-detail="${escapeHtml(edition.id)}">${coverMarkup(edition.cover || isbnCover(firstIsbn([edition])), edition.title, { size: 'xs', escapeHtml })}<span><strong>${escapeHtml(edition.title)}</strong><small>${escapeHtml([edition.publisher, edition.publicationYear, edition.language, edition.binding, (edition.contributors || []).filter((person) => person.role === 'translator').map((person) => 'tł. ' + person.name).join(', '), edition.originalTitle ? 'oryg. ' + edition.originalTitle : ''].filter(Boolean).join(' / ') || 'Brak szczegółów')}</small></span><b>${escapeHtml(edition.identifiers.find((item) => item.scheme.startsWith('isbn'))?.value || 'bez ISBN')}</b></button><span class="edition-value" data-edition-value="${escapeHtml(edition.id)}"></span>${row.editions.length > 1 ? editionVariantSelect(edition, row.variants || [], escapeHtml) : ''}</div>`).join('') || '<p>Brak wydań.</p>'}</div></section><details class="detail-section bp-more"><summary>Szczegóły cen i pochodzenie danych</summary><p class="inline-note">Pochodzenie danych: ${row.externalRecords.length ? row.externalRecords.map((record) => `${escapeHtml(record.provider)}: ${escapeHtml(record.externalId)}`).join(', ') : 'brak zewnętrznych rekordów bibliograficznych.'}</p></details>`;
    detail.querySelector('[data-book-back]').addEventListener('click', () => closeBookPage());
    mountWorkLabels({ json, escapeHtml, toast, workId: row.id, target: detail.querySelector('.bp-labels-slot') });
    mountPriceTarget({ after: detail.querySelector('.bp-actions'), scope: 'work', id: row.id, json, toast, escapeHtml, money });
    void loadWorkOffers(row, detail, request);
    void loadWorkSets(row, detail, request);
    const reloadWork = () => { if (state.selectedCatalogId === row.id) void openCatalogDetail(row.id); };
    const tiles = mountBookTiles(row, detail, request, isbns, reloadWork);
    wireBookActions(row, detail, isbns, tiles);
    // Edition navigation is usable as soon as the buttons appear, even while series load.
    detail.querySelectorAll('[data-edition-detail]').forEach((button) =>
      button.addEventListener('click', () => openEditionDetail(button.dataset.editionDetail)),
    );
    try { await loadSeries(); } catch (error) { /* The editor reports a save error if storage is unavailable. */ }
    if (request !== detailRequest) return;
    const panes = detail.querySelector('.bp-panes');
    mountWorkActions(row, panes);
    wireEditionVariantSelects(detail, { json, toast, reload: reloadWork });
    mountSeriesEditor(row, panes, renderSeriesSummary, { annotations: sqliteAnnotations || {}, save: saveSeries });
    asPane(panes.querySelector('.series-editor'), 'series');
    void annotateEditionLines(row, detail);
  } catch (error) {
    if (request !== detailRequest) return;
    detail.innerHTML = `<div class="empty-detail"><h3>Nie udalo sie wczytac rekordu</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

/** Offers of all editions, cheapest first: a row opens the offer, „Ogłoszenie ↗” the listing. */
async function loadWorkOffers(row, detail, request) {
  const section = detail.querySelector('.work-offers');
  let data;
  try {
    data = await json('/api/offers?' + new URLSearchParams({ workId: row.id, limit: '100', sort: 'price-asc' }));
  } catch {
    if (section?.isConnected) section.querySelector('.inline-note').textContent = 'Nie udało się wczytać ofert.';
    return;
  }
  if (request !== detailRequest || !section?.isConnected) return;
  const render = (showAll) => {
    section.innerHTML = bookOffersMarkup(data, row, { money, escapeHtml, showAll });
    section.querySelectorAll('[data-work-offer]').forEach((button) => button.addEventListener('click', () => openOfferDrawer(button.dataset.workOffer)));
    section.querySelector('[data-bp-all-offers]')?.addEventListener('click', () => render(true));
  };
  render(false);
}

/** A section mounted under the action bar becomes a pane, shown by its action button. */
function asPane(node, key) {
  if (!node) return;
  node.dataset.bpPane = key;
  node.hidden = true;
}

/** Market value of the book and, next to each edition line, of that edition. */
function renderValuation(detail, overview) {
  const box = detail.querySelector('.bp-value');
  if (box) box.innerHTML = valuationPanelMarkup(overview.valuation, escapeHtml);
  detail.querySelectorAll('[data-edition-value]').forEach((slot) => {
    slot.innerHTML = valuationLineMarkup(overview.editionValuations?.[slot.dataset.editionValue], escapeHtml);
  });
}

/** Price tiles: offers statistics and the best buyback quote; also fills „Szczegóły cen”. */
function mountBookTiles(row, detail, request, isbns, reloadWork) {
  const view = { overview: null, buyback: null, busy: false };
  const box = detail.querySelector('.bp-tiles');
  const render = () => {
    if (box.isConnected) box.innerHTML = bookTilesMarkup(view.overview, view.buyback, { money, escapeHtml, isbns: isbns.length, buybackBusy: view.busy });
  };
  const current = () => request === detailRequest && detail.isConnected;
  json('/api/catalog/works/' + encodeURIComponent(row.id) + '/prices')
    .then((overview) => {
      if (!current()) return;
      view.overview = overview;
      render();
      renderValuation(detail, overview);
      mountWorkPrices({ row, overview, mount: detail.querySelector('.bp-more'), json, money, escapeHtml, toast, reload: reloadWork });
    })
    .catch(() => {});
  buybackQuotes(isbns)
    .then((quotes) => {
      if (!current()) return;
      view.buyback = bestBuyback(quotes);
      render();
    })
    .catch(() => {});
  return { view, render };
}

function wireBookActions(row, detail, isbns, tiles) {
  const bar = detail.querySelector('.bp-actions');
  mountWorkRemoval({ row, button: bar.querySelector('[data-bp-action="remove"]'), json, toast, loadCatalogData, onRemoved: () => closeBookPage() });
  bar.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-bp-action]');
    if (!button) return;
    const action = button.dataset.bpAction;
    if (action === 'remove') return;
    if (action === 'scan') {
      const field = $('#queries');
      if (!field) return;
      field.value = [tidyWorkTitle(row.title), (row.authors || [])[0]].filter(Boolean).join(' ');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      showView('scanner');
      field.focus();
      toast('Wpisano tytuł do skanera. Wybierz źródła i uruchom skan.');
      return;
    }
    if (action === 'buyback') {
      if (!isbns.length) return toast('Cena skupu wymaga ISBN-13 — żadne wydanie go nie ma.');
      button.disabled = true;
      tiles.view.busy = true;
      tiles.render();
      const quotes = {};
      let failed = 0;
      for (const isbn of isbns) {
        try {
          quotes[isbn] = await checkBuyback(isbn);
        } catch {
          failed++;
        }
      }
      tiles.view.busy = false;
      if (Object.keys(quotes).length) tiles.view.buyback = bestBuyback(quotes);
      tiles.render();
      button.disabled = false;
      if (failed) toast(`Nie sprawdzono ${failed} z ${isbns.length} ISBN.`);
      return;
    }
    if (!toggleBookPane(detail, action)) toast('Wczytywanie…');
  });
}

/** "Zestawy z tą książką": sets whose composition holds one of its editions; shown only when there are any. */
async function loadWorkSets(row, detail, request) {
  let items = [];
  try {
    ({ items = [] } = await json('/api/catalog/works/' + encodeURIComponent(row.id) + '/sets'));
  } catch {
    return;
  }
  if (request !== detailRequest || !detail.isConnected || !items.length) return;
  const section = document.createElement('section');
  section.className = 'detail-section work-sets';
  section.innerHTML = '<h4>Zestawy z tą książką · ' + items.length + '</h4><div class="work-offer-list">' + items.map((item) => `<button type="button" class="work-offer-row" data-work-set="${escapeHtml(item.offerId)}"><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml([item.source, item.books + ' ' + (item.books === 1 ? 'książka' : [2, 3, 4].includes(item.books % 10) && ![12, 13, 14].includes(item.books % 100) ? 'książki' : 'książek'), item.confirmed ? 'skład potwierdzony' : 'skład do potwierdzenia', item.dismissedAt ? 'nie interesuje mnie' : ''].filter(Boolean).join(' · '))}</small></span><strong>${money(item.currentPrice)}</strong></button>`).join('') + '</div>';
  const editions = [...detail.querySelectorAll('.detail-section')].find((node) => node.querySelector('[data-edition-detail]'));
  (editions || detail.lastElementChild).after(section);
  section.querySelectorAll('[data-work-set]').forEach((button) => button.addEventListener('click', () => document.dispatchEvent(new CustomEvent('bookflip-open-set', { detail: { offerId: button.dataset.workSet } }))));
}

function priceStats(prices) {
  const sorted = prices
    .filter(value=>value!==null&&value!==undefined)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
  };
}
function offerPriceSummary(offers = []) {
  return priceStats(offers.filter(item=>isPurchasable(item) && (!item.currency || item.currency==='PLN')).map((item) => item.currentPrice));
}
function soldSummaryMarkup(offers = []) {
  const sold = offers.filter((item) => item.availability === 'sold' && item.currentPrice > 0 && (!item.currency || item.currency === 'PLN'));
  if (!sold.length) return '';
  const stats = priceStats(sold.map((item) => item.currentPrice));
  return `<p class="inline-note">Sprzedane ogłoszenia: <strong>${sold.length}</strong>, mediana ostatniej ceny ${money(stats.median)} (cena z chwili ostatniego wykrycia — przybliżenie ceny sprzedaży).</p>`;
}
function offerPriceSummaryMarkup(offers = []) {
  const stats = offerPriceSummary(offers);
  if (!stats) return '<p class="inline-note">Brak zapisanych cen ofertowych dla tego wydania.</p>' + soldSummaryMarkup(offers);
  return soldSummaryMarkup(offers) + `<div class="edition-price-summary"><div><small>Mediana cen ofertowych</small><strong>${money(stats.median)}</strong></div><div><small>Najniższa oferta</small><strong>${money(stats.min)}</strong></div><div><small>Liczba cen</small><strong>${stats.count}</strong></div></div><p class="inline-note">Wartości na podstawie aktualnych cen zapisanych ofert. Nie są to ceny sprzedaży ani prognoza zysku; nie uwzględniają kosztów dostawy i stanu egzemplarza.</p>`;
}

const ROLE_LABELS = { author: 'autor', translator: 'tłumaczenie', illustrator: 'ilustracje', editor: 'redakcja', other: 'współpraca' };
const SERIES_KIND = { cycle: 'cykl', universe: 'świat', publisher_line: 'seria wydawnicza' };
/** BN record details (original title, people, series, physical description) as detail-grid cells. */
function bibliographyMarkup(row) {
  const cells = [];
  if (row.originalTitle) cells.push(['Tytuł oryginału', escapeHtml(row.originalTitle) + (row.originalLanguage ? ' <small>(' + escapeHtml(row.originalLanguage) + ')</small>' : '')]);
  const people = (row.contributors || []).filter((person) => person.role !== 'author' || (row.contributors || []).filter((item) => item.role === 'author').length > 0);
  if (people.length)
    cells.push(['Osoby', people.map((person) => '<button type="button" class="link-button" data-person-search="' + escapeHtml(person.name) + '" title="Pokaż wszystkie książki tej osoby">' + escapeHtml(person.name) + '</button> <small>' + escapeHtml(ROLE_LABELS[person.role] || person.role) + '</small>').join('<br>')]);
  if ((row.series || []).length)
    cells.push(['Seria', row.series.map((entry) => escapeHtml(entry.name) + (entry.volume != null ? ' — t. ' + escapeHtml(entry.volume) : '') + ' <small>' + escapeHtml([SERIES_KIND[entry.kind], entry.source === 'listing' ? 'z ogłoszeń' : entry.source === 'e_isbn' ? 'e-ISBN' : ''].filter(Boolean).join(' · ')) + '</small>').join('<br>')]);
  const physical = [row.pageCount ? row.pageCount + ' s.' : '', row.heightCm ? row.heightCm + ' cm' : '', row.placeOfPublication || ''].filter(Boolean).join(' · ');
  if (physical) cells.push(['Opis fizyczny', escapeHtml(physical)]);
  if ((row.genres || []).length) cells.push(['Gatunek', escapeHtml(row.genres.join(', '))]);
  return cells.length ? '<div class="detail-grid bibliography-grid">' + cells.map(([label, value]) => '<span><b>' + label + '</b><small>' + value + '</small></span>').join('') + '</div>' : '';
}
function mountPersonSearch(detail) {
  detail.querySelectorAll('[data-person-search]').forEach((button) =>
    button.addEventListener('click', () => {
      const input = $('#catalogSearch');
      if (!input) return;
      input.value = button.dataset.personSearch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }),
  );
}

// The book's unknown edition: offers assigned to the book only. Each can be given its edition
// with one choice; nothing else of an edition record (ISBN, publisher) applies here.
async function mountUnknownEditionPicker(row, detail, request) {
  let work;
  try {
    work = await json('/api/catalog/works/' + encodeURIComponent(row.workId));
  } catch {
    return;
  }
  if (request !== detailRequest || !detail.isConnected) return;
  const heading = detail.querySelector('.edition-identity h3');
  if (heading) heading.textContent = 'Wydanie nieustalone — ' + tidyWorkTitle(work.title);
  const note = document.createElement('p');
  note.className = 'inline-note';
  note.textContent = 'Te oferty przypisano do książki bez wskazania wydania. Ich ceny liczą się do ceny całej książki. Jeśli na zdjęciu widać wydanie, wskaż je przy ofercie.';
  detail.querySelector('.detail-section')?.append(note);
  const options = work.editions
    .map((edition) => `<option value="${escapeHtml(edition.id)}">${escapeHtml([cleanPublisher(edition.publisher) || 'wydawca nieznany', edition.publicationYear, edition.binding, edition.identifiers.find((item) => item.scheme.startsWith('isbn'))?.value].filter(Boolean).join(' · '))}</option>`)
    .join('');
  detail.querySelectorAll('[data-offer-assign]').forEach((slot) => {
    const offerId = slot.dataset.offerAssign;
    const label = document.createElement('label');
    label.className = 'wp-move';
    label.innerHTML = `<small>Wskaż wydanie:</small><select aria-label="Wydanie tej oferty"><option value="">— wybierz —</option>${options}</select>`;
    slot.before(label);
    const select = label.querySelector('select');
    select.addEventListener('change', async () => {
      if (!select.value) return;
      select.disabled = true;
      try {
        await json('/api/offers/' + encodeURIComponent(offerId) + '/assignment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editionId: select.value, reason: 'Wskazano wydanie oferty przypisanej wcześniej do książki.' }) });
        toast('Wskazano wydanie.');
        await loadCatalogData();
        await openEditionDetail(row.id);
      } catch (error) {
        toast('Nie zapisano: ' + error.message);
        select.disabled = false;
      }
    });
  });
}

async function openEditionDetail(id) {
  if(!await confirmDiscard())return;
  const request = ++detailRequest;
  openDetailView('catalog');
  setBookPage(true, { id: state.selectedCatalogId });
  const detail = $('#catalogDetail');
  detail.innerHTML = '<div class="empty-detail"><p>Wczytywanie wydania...</p></div>';
  try {
    const row = await json(`/api/catalog/editions/${encodeURIComponent(id)}`);
    if (request !== detailRequest) return;
    state.selectedCatalogId = row.workId;
    renderCatalog();
    detail.dataset.editionId = id;
    detail.scrollTop = 0;
    detail.innerHTML = `<section class="detail-section"><button class="link-button" id="backToWork" type="button">← Wróć do dzieła</button><div class="edition-identity">${row.cover ? coverMarkup(row.cover, row.title, { size: 'lg', escapeHtml }) : coverPreviewMarkup(row.identifiers)}<div><h3>${escapeHtml(row.title)}</h3><p class="inline-note">${escapeHtml(row.authors?.join(', ') || 'Autor nieznany')}</p></div></div><div class="detail-grid"><span><b>ISBN</b><small>${escapeHtml(
      row.identifiers
        .filter((item) => item.scheme.startsWith('isbn'))
        .map((item) => item.value)
        .join(', ') || 'brak',
    )}</small></span><span><b>Wydawca</b><small>${escapeHtml(row.publisher || '-')}</small></span><span><b>Rok</b><small>${escapeHtml(row.publicationYear || '-')}</small></span><span><b>Język / oprawa</b><small>${escapeHtml([row.language, row.binding].filter(Boolean).join(' / ') || '-')}</small></span></div>${bibliographyMarkup(row)}</section><section class="detail-section"><h4>Ceny zapisanych ofert</h4>${offerPriceSummaryMarkup(row.offers)}</section><section class="detail-section"><h4>Powiązane oferty</h4><div class="price-list">${row.offers.map((item) => `<div class="edition-offer-row"><button class="link-button" type="button" data-edition-offer="${escapeHtml(item.id)}"><span>${escapeHtml(item.title)}<small>${escapeHtml(item.source)} · wykryto ${escapeHtml(item.lastSeenAt || 'brak daty')} · ${escapeHtml(availabilityLabel(item))}</small></span><b>${money(item.currentPrice)}</b></button><button type="button" class="link-button edition-offer-manage" data-manage-offer="${escapeHtml(item.id)}" aria-expanded="false">Zmień lub odłącz</button><div data-offer-assign="${escapeHtml(item.id)}"></div></div>`).join('') || '<p>Brak ofert.</p>'}</div></section>`;
    detail.querySelectorAll('[data-edition-offer]').forEach(button=>button.addEventListener('click',()=>openOfferDrawer(button.dataset.editionOffer)));
    mountListingCard({ after: detail.firstElementChild, editionId: row.id, json, toast, escapeHtml, money });
    mountPriceTarget({ after: detail.firstElementChild, scope: 'edition', id: row.id, json, toast, escapeHtml, money });
    mountPersonSearch(detail);
    // Per offer: change the edition or remove the assignment (mounted on first use).
    detail.querySelectorAll('[data-manage-offer]').forEach((button) =>
      button.addEventListener('click', () => {
        const slot = detail.querySelector(`[data-offer-assign="${CSS.escape(button.dataset.manageOffer)}"]`);
        const open = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!open));
        if (open) { slot.replaceChildren(); return; }
        const item = row.offers.find((entry) => entry.id === button.dataset.manageOffer);
        mountOfferAssignment({ container: slot, offer: item, currentEditionId: row.id, initialQuery: row.title, json, escapeHtml, toast, onChanged: async () => { await loadCatalogData(); await openEditionDetail(row.id); } });
      }),
    );
    const history = mountEditionHistory({ row, target: detail, json, money, openOfferDrawer });
    detail.querySelectorAll('.detail-section')[2].before(history);
    if (row.isUnknown) void mountUnknownEditionPicker(row, detail, request);
    else {
      mountEditionBuyback({ row, target: detail, toast });
      mountEditionActions(row,detail);
    }
    $('#backToWork').addEventListener('click', () => openCatalogDetail(row.workId));
  } catch (error) {
    if (request !== detailRequest) return;
    detail.innerHTML = `<div class="empty-detail"><p>${escapeHtml(error.message)}</p></div>`;
  }
}


function editorField(form,label,name,value='',type='text') {
  const field=document.createElement('label');field.className='field';const copy=document.createElement('span');copy.textContent=label;
  const input=document.createElement('input');Object.assign(input,{name,type,value:value??''});field.append(copy,input);form.append(field);return input;
}
function mountWorkActions(row,detail) {
  const root=document.createElement('details');root.className='catalog-edit';const summary=document.createElement('summary');summary.textContent='Popraw dane dzieła / połącz duplikat';root.append(summary);
  const form=document.createElement('form');const title=editorField(form,'Tytuł dzieła','title',row.title),authors=editorField(form,'Autorzy (oddziel średnikiem)','authors',row.authors.join('; '));
  const save=document.createElement('button');save.type='submit';save.className='button secondary';save.textContent='Zapisz poprawione dane';
  const message=document.createElement('p');message.setAttribute('role','status');form.append(save,message);root.append(form);
  const savedWork=watchForm('catalog-work',[title,authors]);
  form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{await json('/api/catalog/works/'+encodeURIComponent(row.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.value,authors:authors.value.split(';').map(value=>value.trim()).filter(Boolean)})});savedWork();await loadCatalogData();await openCatalogDetail(row.id);}catch(error){message.textContent='Nie zapisano. Sprawdź tytuł i autorów.';}finally{save.disabled=false;}});
  const query=editorField(root,'Znajdź docelowe dzieło dla duplikatu','mergeQuery');const search=document.createElement('button');search.type='button';search.className='button secondary';search.textContent='Znajdź dzieło';const choices=document.createElement('div');root.append(search,choices);
  search.addEventListener('click',async()=>{
    if(query.value.trim().length<2) {message.textContent='Wpisz co najmniej dwa znaki.';return;}
    search.disabled=true;
    try{const result=await json('/api/catalog/works?'+new URLSearchParams({query:query.value,limit:'30'}));choices.replaceChildren();
    for(const target of result.items.filter(item=>item.id!==row.id)){
      const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent='Połącz z: '+target.title+' · '+editionsLabel(target.editionCount);choices.append(button);
      button.addEventListener('click',async()=>{button.disabled=true;try{const payload={sourceId:row.id,targetId:target.id};const preview=await json('/api/catalog/merge-works',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!(await confirmDialog('Przenieść '+preview.editions+' wydań z „'+preview.sourceTitle+'” do „'+preview.targetTitle+'”? Dane docelowego dzieła pozostaną. Historyczne decyzje zostaną zachowane.', { title: 'Łączenie dzieł', confirmLabel: 'Połącz', danger: true }))) return;
        await json('/api/catalog/merge-works',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,confirm:true})});await loadCatalogData();await openCatalogDetail(target.id);
      }catch(error){message.textContent='Nie połączono: konflikt serii, chronione identyfikatory lub rekord już połączony. Żadne częściowe zmiany nie zostały zapisane.';}finally{button.disabled=false;}});
    }
    if(!choices.children.length)choices.textContent='Brak innych dzieł. Zmień frazę.';
    }catch(error){message.textContent='Nie udało się wyszukać duplikatów.';}finally{search.disabled=false;}
  });detail.append(root);asPane(root,'edit');
}
function mountEditionActions(row,detail) {
  const root=document.createElement('details');root.className='catalog-edit';const summary=document.createElement('summary');summary.textContent='Popraw dane wydania';root.append(summary);
  const form=document.createElement('form');const fields={title:editorField(form,'Tytuł','title',row.title),publisher:editorField(form,'Wydawca','publisher',row.publisher),publicationYear:editorField(form,'Rok','year',row.publicationYear,'number'),language:editorField(form,'Język','language',row.language),binding:editorField(form,'Oprawa','binding',row.binding)};
  const save=document.createElement('button');save.type='submit';save.className='button secondary';save.textContent='Zapisz wydanie';const message=document.createElement('p');message.setAttribute('role','status');form.append(save,message);root.append(form);detail.append(root);
  const savedEdition=watchForm('catalog-edition',Object.values(fields));
  form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const payload=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,key==='publicationYear'?(input.value.trim()?Number(input.value):null):input.value]));await json('/api/catalog/editions/'+encodeURIComponent(row.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});savedEdition();await loadCatalogData();await openEditionDetail(row.id);}catch(error){message.textContent='Nie zapisano. Sprawdź tytuł, rok i pozostałe pola.';}finally{save.disabled=false;}});
  const comparison=document.createElement('details');const label=document.createElement('summary');label.textContent='Porównaj z innym wydaniem tego dzieła';comparison.append(label);
  const choice=document.createElement('select');choice.setAttribute('aria-label','Wydanie do porównania');const empty=document.createElement('option');empty.value='';empty.textContent='Wybierz wydanie';choice.append(empty);comparison.append(choice);const output=document.createElement('div');output.className='edition-comparison';comparison.append(output);detail.append(comparison);
  let loaded=false;comparison.addEventListener('toggle',async()=>{if(!comparison.open||loaded)return;try{const work=await json('/api/catalog/works/'+encodeURIComponent(row.workId));for(const edition of work.editions.filter(item=>item.id!==row.id)){const option=document.createElement('option');option.value=edition.id;option.textContent=[edition.title,edition.publisher,edition.publicationYear,edition.language].filter(Boolean).join(' · ');choice.append(option);}loaded=true;}catch(error){output.textContent='Nie udało się pobrać wydań.';}});
  choice.addEventListener('change',async()=>{if(!choice.value)return;try{const other=await json('/api/catalog/editions/'+encodeURIComponent(choice.value));output.replaceChildren();for(const [label,key] of [['Tytuł','title'],['Wydawca','publisher'],['Rok','publicationYear'],['Język','language'],['Oprawa','binding']]){const line=document.createElement('p');line.textContent=label+': '+(row[key]||'brak')+' ↔ '+(other[key]||'brak');output.append(line);}const ids=document.createElement('p');ids.textContent='ISBN: '+row.identifiers.filter(item=>item.scheme.startsWith('isbn')).map(item=>item.value).join(', ')+' ↔ '+other.identifiers.filter(item=>item.scheme.startsWith('isbn')).map(item=>item.value).join(', ');output.append(ids);}catch(error){output.textContent='Nie udało się porównać wydań.';}});
}
return { closeBookPage, catalogRows, validCoverIsbn, coverPreviewMarkup, renderCatalog, openCatalogDetail, priceStats, offerPriceSummary, offerPriceSummaryMarkup, openEditionDetail };
}

