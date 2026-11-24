// "Okazje": offers that can be bought now for clearly less than their edition is worth
// (deals.mjs on the server). The list is read on every visit; filter and order are applied here.
// Each deal can be rated ("was it real?"); rated deals are hidden unless asked for, so the list
// shows what is still to check, and the summary says how often the list was right.
import { coverMarkup, tidyOfferTitle } from '../core/bibliography.js';
import { dateMarkup, safeOfferHref } from '../core/formatters.js';
import { plural, zl } from '../core/valuation.js';
import { targetBadgeMarkup } from './price-targets.js';
import { installDealReview } from './deal-review.js';
import { recordPurchase } from './stock.js';

const CONDITION_LABELS = { new: 'nowa', very_good: 'bardzo dobra', good: 'dobra', satisfactory: 'zadowalająca', unknown: 'stan nieznany' };
const SORTS = {
  expected: (a, b) => (b.rank ?? b.expected ?? 0) - (a.rank ?? a.expected ?? 0) || b.saving - a.saving,
  saving: (a, b) => b.saving - a.saving,
  discount: (a, b) => b.discount - a.discount || b.saving - a.saving,
  newest: (a, b) => String(b.firstSeenAt || '').localeCompare(String(a.firstSeenAt || '')),
  price: (a, b) => a.price - b.price,
  demand: (a, b) => (b.demand?.median ?? -1) - (a.demand?.median ?? -1) || b.saving - a.saving,
};
const DEMAND_LABELS = { high: 'wysoki', medium: 'średni', low: 'niski' };
const LIQUIDITY_LABELS = { fast: 'schodzi szybko', normal: 'schodzi przeciętnie', slow: 'schodzi wolno' };

/** "schodzi szybko · 31% szans na sprzedaż w 30 dni · zwykle ~57 dni"; empty without data. */
export function liquidityLabel(liquidity) {
  if (!liquidity) return '';
  const days = liquidity.medianDays == null ? '' : liquidity.medianDays >= 365 ? ' · zwykle ponad rok' : ` · zwykle ~${liquidity.medianDays} dni`;
  return `${LIQUIDITY_LABELS[liquidity.level] || ''} · ${Math.round(liquidity.chance * 100)}% szans na sprzedaż w 30 dni${days}`;
}

/** "♥ 12 · popyt wysoki (mediana 9 polubień w 5 ofertach Vinted)"; empty without data. */
export function demandLabel(item) {
  const own = item.favourites == null ? '' : `♥ ${item.favourites}`;
  const demand = item.demand
    ? `popyt ${DEMAND_LABELS[item.demand.level] || item.demand.level} (mediana ${item.demand.median} ${plural(item.demand.median, 'polubienie', 'polubienia', 'polubień')} w ${item.demand.offers} ${plural(item.demand.offers, 'ofercie', 'ofertach', 'ofertach')} Vinted)`
    : '';
  return [own, demand].filter(Boolean).join(' · ');
}
export const VERDICT_LABELS = { good: 'Trafna', wrong_match: 'Złe przypisanie', condition: 'Inny stan / zestaw', overvalued: 'Wycena zawyżona' };
const VERDICT_HINTS = {
  good: 'Naprawdę wyraźnie tańsza, niż jest warta — nadaje się do odsprzedaży',
  wrong_match: 'Oferta przypisana do innej książki albo innego wydania',
  condition: 'Egzemplarz w gorszym stanie niż przyjęty, zestaw, brak tomu itp.',
  overvalued: 'Przypisanie dobre, ale książka nie jest tyle warta',
};
const LEVELS = { high: 'wysokiej', medium: 'średniej', low: 'niskiej' };

/**
 * The deals to show: without low-confidence valuations and without rated ones unless asked,
 * in the chosen order. `keep`: offers rated during this visit stay visible, with their undo.
 */
export function visibleDeals(items, { includeLow = false, showRated = false, showHidden = false, onlyWatched = false, hideHabit = false, onlyCheapest = false, sort = 'expected', keep = new Set() } = {}) {
  return items
    .filter((item) => keep.has(item.offerId) || ((includeLow || item.confidence !== 'low') && (showRated || !item.verdict) && (showHidden || !item.hidden) && (!onlyWatched || item.watched) && (!hideHabit || !item.habit) && (!onlyCheapest || item.cheapestLive)))
    .sort(SORTS[sort] || SORTS.expected);
}

/** "12 okazji · 94 ukryte (niska wiarygodność wyceny) · 5 ocenionych ukrytych". */
export function dealsCountLabel(items, shown, { onlyCheapest = false } = {}) {
  const visible = new Set(shown.map((item) => item.offerId));
  const allHidden = items.filter((item) => !visible.has(item.offerId));
  // Items cut by „Tylko najtańsze w wydaniu” are counted on their own, not as low-confidence or rated.
  const notCheapest = onlyCheapest ? allHidden.filter((item) => !item.cheapestLive) : [];
  const hiddenItems = onlyCheapest ? allHidden.filter((item) => item.cheapestLive) : allHidden;
  const boxed = hiddenItems.filter((item) => item.hidden).length;
  const hidden = hiddenItems.filter((item) => !item.hidden);
  const rated = hidden.filter((item) => item.verdict).length;
  const low = hidden.length - rated;
  const pricier = notCheapest.length;
  return `${shown.length} ${plural(shown.length, 'okazja', 'okazje', 'okazji')}${pricier ? ` · ${pricier} ${plural(pricier, 'ukryta', 'ukryte', 'ukrytych')} przez „Tylko najtańsze w wydaniu”` : ''}${boxed ? ` · ${boxed} ${plural(boxed, 'odłożona lub odrzucona', 'odłożone lub odrzucone', 'odłożonych lub odrzuconych')}` : ''}${low ? ` · ${low} ${plural(low, 'ukryta', 'ukryte', 'ukrytych')} (niska wiarygodność wyceny)` : ''}${rated ? ` · ${rated} ${plural(rated, 'oceniona ukryta', 'ocenione ukryte', 'ocenionych ukrytych')}` : ''}`;
}

/** "Ocenione: 12 — trafna 7 (58%) · złe przypisanie 3 … Przy wiarygodności średniej trafne 4 z 6." */
export function verdictSummaryLabel(summary) {
  if (!summary?.total) return 'Ocenione: 0. Oceń kilka okazji przyciskami przy ofercie — wtedy będzie widać, jak często lista ma rację.';
  const { total, counts = {}, byConfidence = {} } = summary;
  const parts = Object.keys(VERDICT_LABELS)
    .filter((key) => counts[key])
    .map((key) => `${VERDICT_LABELS[key].toLowerCase()} ${counts[key]}${key === 'good' ? ` (${Math.round((100 * counts[key]) / total)}%)` : ''}`);
  const perLevel = Object.entries(LEVELS)
    .filter(([key]) => byConfidence[key]?.total)
    .map(([key, label]) => `przy wiarygodności ${label} trafne ${byConfidence[key].good} z ${byConfidence[key].total}`);
  const levels = perLevel.join('; ');
  return `Ocenione: ${total} — ${parts.join(' · ')}${levels ? `. ${levels[0].toUpperCase()}${levels.slice(1)}` : ''}.`;
}

const TRIAGE_ACTIONS = [
  ['seen', 'Obejrzane', 'Obejrzałem — chowa okazję z listy'],
  ['snoozed', 'Odłóż do jutra', 'Wróci za dobę albo wcześniej, gdy sprzedawca obniży cenę'],
  ['dismissed', 'Nie dla mnie', 'Chowa okazję; wróci tylko, gdy cena spadnie'],
];
const TRIAGE_STATE_LABELS = { seen: 'Obejrzana', snoozed: 'Odłożona do jutra', dismissed: 'Odrzucona' };
const RETURNED_LABELS = { price_drop: 'wróciła: obniżka po odrzuceniu', snooze_over: 'wróciła: koniec odłożenia' };

/** "3 nowe, 2 odłożone"; the other states only when there are some. Empty without counts. */
export function triageCountsLabel(triage) {
  const counts = triage?.counts;
  if (!counts) return '';
  return [
    `${counts.new || 0} nowe`,
    `${counts.snoozed || 0} ${plural(counts.snoozed || 0, 'odłożona', 'odłożone', 'odłożonych')}`,
    counts.seen ? `${counts.seen} ${plural(counts.seen, 'obejrzana', 'obejrzane', 'obejrzanych')}` : '',
    counts.dismissed ? `${counts.dismissed} ${plural(counts.dismissed, 'odrzucona', 'odrzucone', 'odrzuconych')}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** Three triage buttons of a visible deal, or its state with "Cofnij" when it is set aside. */
export function triageMarkup(item, escapeHtml) {
  const id = escapeHtml(item.offerId);
  const returned = item.triage?.returned && RETURNED_LABELS[item.triage.returned];
  const badge = returned ? `<span class="deal-returned">${escapeHtml(returned)}</span>` : '';
  if (item.hidden && item.triage)
    return `<div class="deal-triage is-set"><small>${escapeHtml(TRIAGE_STATE_LABELS[item.triage.state] || item.triage.state)}</small><button type="button" class="link-button" data-deal-untriage="${id}">Cofnij</button></div>`;
  return `${badge ? `<div class="deal-triage-flag">${badge}</div>` : ''}<div class="deal-triage" role="group" aria-label="Skrzynka okazji">${TRIAGE_ACTIONS.map(
    ([state, label, hint]) => `<button type="button" class="deal-triage-button" data-deal-triage="${id}" data-state="${state}" title="${escapeHtml(hint)}">${escapeHtml(label)}</button>`,
  ).join('')}</div>`;
}

/** "Kupiłem": the copy goes to the stock register (Łowca → Zapas), no amounts. */
export function boughtMarkup(item, escapeHtml) {
  return `<div class="deal-triage deal-bought"><button type="button" class="deal-triage-button" data-deal-bought="${escapeHtml(item.offerId)}" title="Zapisuje w zapasie, że kupiłeś tę książkę (bez kwot)">Kupiłem</button></div>`;
}

function verdictMarkup(item, escapeHtml) {
  if (item.verdict)
    return `<div class="deal-verdict is-rated"><small>Ocena: <b>${escapeHtml(VERDICT_LABELS[item.verdict] || item.verdict)}</b></small><button type="button" class="link-button" data-deal-unrate="${escapeHtml(item.offerId)}">Cofnij</button></div>`;
  // Rating is rare next to the buying decision: folded behind one "Oceń" button.
  return `<details class="deal-rate"><summary>Oceń</summary><div class="deal-verdict" role="group" aria-label="Oceń okazję">${Object.entries(VERDICT_LABELS)
    .map(([key, label]) => `<button type="button" class="deal-verdict-chip" data-deal-rate="${escapeHtml(item.offerId)}" data-verdict="${key}" title="${escapeHtml(VERDICT_HINTS[key])}">${escapeHtml(label)}</button>`)
    .join('')}</div></details>`;
}

const loose = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ł]+/g, ' ').trim();

/** The book link repeats nothing: the book's title when the listing names it otherwise, else a plain "strona książki". */
function workLinkMarkup(item, escapeHtml) {
  const same = loose(item.workTitle) && loose(item.title).includes(loose(item.workTitle));
  return `<small>↳ <button type="button" class="link-button" data-deal-work="${escapeHtml(item.workId)}" title="Strona książki: ${escapeHtml(item.workTitle)}">${same ? 'strona książki' : escapeHtml(item.workTitle)}</button></small>`;
}

/** "obniżka −12%" badge when the seller lowered the price (item.priceDrop = { from, percent }); else empty. */
export function priceDropMarkup(item, { escapeHtml, money }) {
  const drop = item.priceDrop;
  if (!drop || !(drop.percent > 0)) return '';
  const hint = `Sprzedawca obniżył cenę z ${money(drop.from)} do ${money(item.price)} (−${drop.percent}%)`;
  return `<span class="deal-price-drop" title="${escapeHtml(hint)}" aria-label="${escapeHtml(hint)}">obniżka −${escapeHtml(drop.percent)}%</span>`;
}

/** „Nowa nie drożej: Empik 39,90 zł”: a new copy of the edition costs no more than this used offer (item.newCheaper); only a mark. */
export function newCheaperMarkup(item, { escapeHtml, money }) {
  const found = item.newCheaper;
  if (!found) return '';
  return `<a class="deal-new-cheaper" href="${escapeHtml(safeOfferHref(found.url))}" target="_blank" rel="noopener noreferrer" title="Nowy egzemplarz tego wydania w sklepie kosztuje tyle samo lub mniej niż ta oferta (ceny bez wysyłki)">Nowa nie drożej: ${escapeHtml(found.source)} ${escapeHtml(money(found.price))} ↗</a>`;
}

/** Watch or stop watching a seller (watched-sellers.mjs). */
export const setWatched = (json, source, sellerId, on) =>
  on
    ? json('/api/watched-sellers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source, sellerId }) })
    : json(`/api/watched-sellers/${encodeURIComponent(source)}/${encodeURIComponent(sellerId)}`, { method: 'DELETE', headers: { 'content-type': 'application/json' } });

/** „Zwykle odrzucasz: wydawca X (12 z 14)”: only a mark, nothing is hidden by it. */
export function habitMarkup(item, { escapeHtml }) {
  if (!item.habit) return '';
  const text = `zwykle odrzucasz: ${item.habit.label} (${item.habit.dismissed} z ${item.habit.total})`;
  return `<span class="deal-habit" title="Z Twoich decyzji z ostatnich 90 dni; tylko znacznik">${escapeHtml(text)}</span>`;
}

/** „Prawie okazje”: a hint of the price after a usual cut; not a target. */
export function nearMarkup(item, { escapeHtml, money }) {
  if (!item.near) return '';
  const drops = item.near.drops ? `obniżona ${item.near.drops.count} ${item.near.drops.count === 1 ? 'raz' : 'razy'}, ostatnio −${item.near.drops.lastPercent}%; ` : '';
  return `<span class="deal-near" title="Podpowiedź z historii obniżek sprzedawców, nie cena docelowa">${escapeHtml(drops)}po zwykłej obniżce (ok. ${escapeHtml(money(item.near.suggested))}) byłaby okazją</span>`;
}

/** „Obserwuj sprzedawcę” / „Obserwowany”: only for an offer whose source gave a seller id. */
export function watchMarkup(item, { escapeHtml }) {
  if (!item.sellerId) return '';
  const attrs = `data-deal-watch data-source="${escapeHtml(item.source)}" data-seller="${escapeHtml(item.sellerId)}" data-on="${item.watched ? '1' : ''}"`;
  return item.watched
    ? `<span class="deal-watched">obserwowany</span> <button type="button" class="link-button" ${attrs}>Przestań obserwować</button>`
    : `<button type="button" class="link-button" ${attrs} title="Nowe oferty tego sprzedawcy trafią do okazji, gdy są choć trochę poniżej wyceny">Obserwuj sprzedawcę</button>`;
}

/** The page allows no inline style (CSP): the positions travel in data-left / data-width and are set here. */
export function applyGauges(root) {
  root.querySelectorAll('[data-left]').forEach((element) => {
    element.style.left = `${element.dataset.left}%`;
    if (element.dataset.width) element.style.width = `${element.dataset.width}%`;
  });
}

/** Price against the valuation range on one scale: the band is worthLow–worthHigh, the tick the worth, the dot the price. Pure (tested). */
export function gaugeMarkup(item, { escapeHtml, money }) {
  const high = Number(item.worthHigh) || Number(item.worth) || 0;
  const low = Number(item.worthLow) || Number(item.worth) || 0;
  const price = Number(item.price) || 0;
  const max = Math.max(high, price, Number(item.worth) || 0) * 1.1;
  if (!(max > 0)) return '';
  const at = (value) => Math.max(0, Math.min(100, (value / max) * 100)).toFixed(1);
  const label = `Cena ${money(price)}, wycena ${money(item.worth)} (${money(low)}–${money(high)})`;
  return `<div class="deal-gauge" role="img" aria-label="${escapeHtml(label)}"><span class="deal-gauge-band" data-left="${at(low)}" data-width="${(at(high) - at(low)).toFixed(1)}"></span><span class="deal-gauge-worth" data-left="${at(item.worth)}"></span><span class="deal-gauge-price" data-left="${at(price)}"></span></div>`;
}

/**
 * Medium/high: one worth with its range. Low confidence: no single number as fact, the valuation
 * range (the deal carries no min–max of live offers) and a „Kupuję do…” shortcut to the edition page.
 */
export function worthMarkup(item, { escapeHtml }) {
  const range = `${Math.round(item.worthLow / 100)}–${zl(item.worthHigh)}`;
  if (item.confidence !== 'low') return `<span>warta ~${zl(item.worth)} <small>(${range})</small></span>`;
  const target = item.editionId ? `<button type="button" class="button secondary compact deal-target-open" data-deal-target="${escapeHtml(item.editionId)}" title="Otwiera wydanie, gdzie ustawisz cenę „Kupuję do”">Kupuję do…</button>` : '';
  return `<span class="deal-check" title="Wycena ma niską wiarygodność (mało obserwacji) — to nie jest pewna wartość">do sprawdzenia</span><span>wycena orientacyjnie <small>${range}</small></span>${target}`;
}

export function dealMarkup(item, { escapeHtml, money, now = new Date() }) {
  const demand = demandLabel(item);
  const basis = [item.sold ? `${item.sold} ${plural(item.sold, 'sprzedaż', 'sprzedaże', 'sprzedaży')}` : '', item.live ? `${item.live} ${plural(item.live, 'oferta', 'oferty', 'ofert')}` : ''].filter(Boolean).join(', ');
  return `<article class="deal-row${item.suspicious ? ' is-suspicious' : ''}" data-deal-offer="${escapeHtml(item.offerId)}">${coverMarkup(item.image, item.title, { size: 'sm', escapeHtml })}<div class="deal-copy"><button type="button" class="link-button deal-title" data-deal-open="${escapeHtml(item.offerId)}" title="${escapeHtml(item.title)}">${escapeHtml(tidyOfferTitle(item.title))}</button><small>${escapeHtml(item.source)} · ${escapeHtml(CONDITION_LABELS[item.condition] || item.condition)} · wykryta ${dateMarkup(item.firstSeenAt, now)}${item.lastSeenAt ? ` · widziana ${dateMarkup(item.lastSeenAt, now)}` : ''}${item.maybeGone ? ' · <span class="deal-warning" title="Źródło było czytane, a ta oferta nie była odświeżana od ponad 48 godzin — sprawdź, czy jeszcze jest">może nieaktualna</span>' : ''}${demand ? ` · <span class="deal-demand${item.demand ? ` is-${escapeHtml(item.demand.level)}` : ''}" title="Polubienia tej oferty i mediana polubień pozostałych ofert tego wydania na Vinted — im więcej, tym częściej oferty schodzą">${escapeHtml(demand)}</span>` : ''} · <a href="${escapeHtml(safeOfferHref(item.url))}" target="_blank" rel="noopener noreferrer">ogłoszenie ↗</a></small>${workLinkMarkup(item, escapeHtml)}${item.suspicious ? '<small class="deal-warning">Bardzo daleko od wyceny — sprawdź, czy oferta jest przypisana do właściwej książki i czy to jeden egzemplarz.</small>' : ''}${gaugeMarkup(item, { escapeHtml, money })}${item.liquidity ? `<small class="deal-liquidity is-${escapeHtml(item.liquidity.level)}" title="Z czasu wystawienia i sprzedaży ofert tego wydania na Vinted">${escapeHtml(liquidityLabel(item.liquidity))}</small>` : ''}</div><div class="deal-numbers" title="${escapeHtml((item.reasons || []).join(' '))}"><strong class="deal-saving">−${zl(item.saving)}</strong>${item.expected != null ? `<span class="deal-expected" title="Oszczędność × szansa sprzedaży w 30 dni">oczekiwany zysk ~${zl(item.expected)}</span>` : ''}<span class="deal-price">−${item.discount}% · za <b>${money(item.price)}</b></span>${priceDropMarkup(item, { escapeHtml, money })}${item.cheapestLive ? '<span class="deal-cheapest" title="Cena niższa niż każda inna żywa oferta tego wydania">najtańsza</span>' : ''}${newCheaperMarkup(item, { escapeHtml, money })}${watchMarkup(item, { escapeHtml })}${habitMarkup(item, { escapeHtml })}${nearMarkup(item, { escapeHtml, money })}${targetBadgeMarkup(item, { escapeHtml, money })}${worthMarkup(item, { escapeHtml })}<small><span class="value-confidence is-${escapeHtml(item.confidence)}">wiarygodność ${escapeHtml(item.confidenceLabel)}</span> ${escapeHtml(basis)}</small></div><div class="deal-actions">${triageMarkup(item, escapeHtml)}${boughtMarkup(item, escapeHtml)}${verdictMarkup(item, escapeHtml)}</div></article>`;
}

export function installDeals({ $, json, escapeHtml, money, openOfferDrawer, openWork, toast = () => {} }) {
  const list = $('#dealsList');
  if (!list) return { refresh: async () => {} };
  let items = [];
  let nearItems = [];
  let summary = null;
  let triage = null;
  const keep = new Set();
  function render() {
    const nearOn = Boolean($('#dealsShowNear')?.checked);
    const shown = visibleDeals(nearOn ? nearItems : items, { includeLow: $('#dealsIncludeLow').checked, showRated: $('#dealsShowRated').checked, showHidden: $('#dealsShowHidden').checked, onlyWatched: $('#dealsOnlyWatched')?.checked, hideHabit: $('#dealsHideHabit')?.checked, onlyCheapest: $('#dealsOnlyCheapest')?.checked, sort: $('#dealsSort').value, keep });
    $('#dealsCount').textContent = nearOn ? `${shown.length} prawie okazji (podpowiedź z historii obniżek)` : dealsCountLabel(items, shown, { onlyCheapest: Boolean($('#dealsOnlyCheapest')?.checked) });
    $('#dealsVerdicts').textContent = verdictSummaryLabel(summary);
    $('#dealsTriage').textContent = triageCountsLabel(triage);
    const nav = $('#dealsNavCount');
    if (nav) nav.textContent = dealsCountLabel(items, visibleDeals(items)).split(' · ')[0];
    list.innerHTML = shown.length
      ? shown.map((item) => dealMarkup(item, { escapeHtml, money })).join('')
      : `<p class="inline-note">${nearOn ? 'Brak „prawie okazji”: potrzeba co najmniej 30 zaobserwowanych obniżek cen i ofert wiszących 14 dni lub już obniżanych.' : items.length && $('#dealsOnlyCheapest')?.checked && items.some((item) => !item.cheapestLive) ? 'Pozostałe okazje są ukryte przez „Tylko najtańsze w wydaniu” (inna oferta tego wydania jest tańsza lub tej samej ceny) — wyłącz przełącznik, aby je zobaczyć.' : items.length ? 'Pozostałe okazje są ukryte (niska wiarygodność wyceny, już ocenione albo odłożone) — zaznacz pole powyżej, aby je zobaczyć.' : 'Brak okazji: żadna dostępna oferta nie jest wyraźnie poniżej wyceny swojego wydania. Wycena potrzebuje co najmniej dwóch innych cen tego samego wydania.'}</p>`;
    applyGauges(list);
    list.querySelectorAll('[data-deal-open]').forEach((button) => button.addEventListener('click', () => openOfferDrawer(button.dataset.dealOpen)));
    list.querySelectorAll('[data-deal-target]').forEach((button) => button.addEventListener('click', () => document.dispatchEvent(new CustomEvent('bookflip-open-edition', { detail: { editionId: button.dataset.dealTarget } }))));
    list.querySelectorAll('[data-deal-work]').forEach((button) => button.addEventListener('click', () => openWork(button.dataset.dealWork)));
    list.querySelectorAll('[data-deal-rate]').forEach((button) => button.addEventListener('click', () => rate(button.dataset.dealRate, button.dataset.verdict)));
    list.querySelectorAll('[data-deal-triage]').forEach((button) => button.addEventListener('click', () => setTriage(button.dataset.dealTriage, button.dataset.state)));
    list.querySelectorAll('[data-deal-untriage]').forEach((button) => button.addEventListener('click', () => setTriage(button.dataset.dealUntriage, null)));
    list.querySelectorAll('[data-deal-bought]').forEach((button) => button.addEventListener('click', () => void recordPurchase({ json, toast, body: { offerId: button.dataset.dealBought } })));
    list.querySelectorAll('[data-deal-watch]').forEach((button) => button.addEventListener('click', () => toggleWatch(button.dataset.source, button.dataset.seller, !button.dataset.on)));
    list.querySelectorAll('[data-deal-unrate]').forEach((button) => button.addEventListener('click', () => rate(button.dataset.dealUnrate, null)));
  }
  async function toggleWatch(source, sellerId, on) {
    try {
      await setWatched(json, source, sellerId, on);
    } catch {
      toast('Nie udało się zmienić obserwacji sprzedawcy.');
      return;
    }
    document.dispatchEvent(new CustomEvent('bookflip-watch-changed'));
  }
  async function rate(offerId, verdict) {
    const url = `/api/deals/${encodeURIComponent(offerId)}/verdict`;
    // Every write, DELETE too, must be JSON: the server refuses other writes (tailscale-access.mjs).
    const headers = { 'content-type': 'application/json' };
    try {
      const result = verdict
        ? await json(url, { method: 'PUT', headers, body: JSON.stringify({ verdict }) })
        : await json(url, { method: 'DELETE', headers });
      serial += 1; // a reload that started before this verdict would bring the old state back
      summary = result.verdicts;
      const item = items.find((entry) => entry.offerId === offerId) || nearItems.find((entry) => entry.offerId === offerId);
      if (item) item.verdict = result.verdict;
      keep.add(offerId);
    } catch {
      $('#dealsVerdicts').textContent = 'Nie udało się zapisać oceny.';
      return;
    }
    render();
  }
  // Seen / snoozed / dismissed: the deal leaves the list and a toast offers the undo (DELETE).
  async function setTriage(offerId, state) {
    const url = `/api/deals/${encodeURIComponent(offerId)}/triage`;
    const headers = { 'content-type': 'application/json' };
    try {
      if (state) await json(url, { method: 'PUT', headers, body: JSON.stringify({ state }) });
      else await json(url, { method: 'DELETE', headers });
    } catch {
      $('#dealsVerdicts').textContent = 'Nie udało się zapisać decyzji.';
      return;
    }
    await refresh();
    if (state)
      toast(`${TRIAGE_STATE_LABELS[state]}.`, { label: 'Cofnij', onClick: () => setTriage(offerId, null), onError: () => toast('Nie udało się cofnąć.') });
  }
  // „Przegląd”: the deals of the current filters one by one (deal-review.js); the list waits hidden.
  const review = installDealReview({
    $,
    json,
    escapeHtml,
    money,
    toast,
    getDeals: () => visibleDeals(items, { includeLow: $('#dealsIncludeLow').checked, showRated: false, showHidden: false, sort: $('#dealsSort').value }),
    onClose: () => {
      list.hidden = false;
      void refresh();
      $('#dealsReviewStart').focus();
    },
  });
  $('#dealsReviewStart').addEventListener('click', () => {
    list.hidden = true;
    review.open();
  });
  $('#dealsShowHidden').addEventListener('change', render);
  $('#dealsIncludeLow').addEventListener('change', render);
  $('#dealsShowRated').addEventListener('change', render);
  $('#dealsOnlyWatched')?.addEventListener('change', render);
  $('#dealsHideHabit')?.addEventListener('change', render);
  $('#dealsOnlyCheapest')?.addEventListener('change', render);
  $('#dealsShowNear')?.addEventListener('change', render);
  document.addEventListener('bookflip-watch-changed', () => void refresh());
  $('#dealsSort').addEventListener('change', render);
  // An older reply must not overwrite a newer state (a verdict saved while the list reloads).
  let serial = 0;
  async function refresh() {
    const request = ++serial;
    try {
      const data = await json('/api/deals');
      if (request !== serial) return;
      ({ items, verdicts: summary = null, triage = null } = data);
      nearItems = data.near || [];
      keep.clear();
    } catch {
      if (request !== serial) return;
      list.innerHTML = '<p class="inline-note">Nie udało się odczytać okazji.</p>';
      return;
    }
    render();
  }
  return { refresh };
}
