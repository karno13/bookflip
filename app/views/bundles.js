// „Paczki sprzedawców” in „Okazje”: sellers with several valued books on offer (seller-bundles.mjs
// on the server). Price against valuation only — no costs, no profit, no contact with the seller.
// Pure helpers (plural, summary, markup) are tested without a DOM; installBundles wires the page.
import { setWatched } from './deals.js';

const PREVIEW = 3;

/** 1 książka, 2-4 książki, 5+ książek (12-14 książek, 22 książki). */
export function booksLabel(count) {
  const n = Math.abs(Math.trunc(Number(count) || 0));
  if (n === 1) return `${n} książka`;
  const last = n % 10;
  const tens = n % 100;
  return last >= 2 && last <= 4 && !(tens >= 12 && tens <= 14) ? `${n} książki` : `${n} książek`;
}

/** „7 książek, razem 84 zł, wycena 190 zł (oszczędność 106 zł)”. */
export function bundleSummaryText(bundle, money) {
  const gap = bundle.totalSaving < 0 ? `drożej o ${money(-bundle.totalSaving)}` : `oszczędność ${money(bundle.totalSaving)}`;
  return `${booksLabel(bundle.count)}, razem ${money(bundle.totalPrice)}, wycena ${money(bundle.totalWorth)} (${gap})`;
}

/** Heading of the section: „Paczki sprzedawców (N)”. */
export function bundlesTitle(total) {
  return `Paczki sprzedawców (${Number(total) || 0})`;
}

export function emptyBundlesText(minBooks) {
  return `Brak sprzedawców z co najmniej ${Number(minBooks) || 3} wycenionymi książkami.`;
}

// Only http(s) links are made clickable; anything else is shown as plain text.
const safeUrl = (url) => (/^https?:\/\//i.test(String(url || '')) ? String(url) : '');

function offerRowMarkup(offer, { escapeHtml, money }) {
  const title = escapeHtml(offer.title || 'Bez tytułu');
  const url = safeUrl(offer.url);
  const name = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${title}</a>` : `<span>${title}</span>`;
  return `<li class="bundle-offer">${name}<small>cena ${escapeHtml(money(offer.price))} · wycena ${escapeHtml(money(offer.worth))}</small></li>`;
}

/** One card per seller; the first three offers, the rest behind a „Pokaż wszystkie” button. */
export function bundleCardMarkup(bundle, tools, expanded = false) {
  const { escapeHtml, money } = tools;
  const offers = bundle.offers || [];
  const shown = expanded ? offers : offers.slice(0, PREVIEW);
  const name = bundle.sellerName || bundle.sellerId || 'nieznany';
  const more =
    offers.length > PREVIEW
      ? `<button type="button" class="button secondary compact" data-bundle-toggle aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? 'Pokaż mniej' : `Pokaż wszystkie (${offers.length})`}</button>`
      : '';
  return `<article class="bundle-card" data-bundle="${escapeHtml(bundle.sellerId)}" data-source="${escapeHtml(bundle.source || '')}"><h4>Sprzedawca ${escapeHtml(name)} <button type="button" class="link-button" data-bundle-watch="${bundle.watched ? '' : '1'}">${bundle.watched ? 'Przestań obserwować' : 'Obserwuj'}</button></h4><p class="bundle-summary">${escapeHtml(bundleSummaryText(bundle, money))}</p><ul class="bundle-offers">${shown.map((offer) => offerRowMarkup(offer, tools)).join('')}</ul>${more}</article>`;
}

/** Cards of the bundles cheaper than their worth; the dearer ones only on request (button). */
export function bundlesMarkup(data, tools, showDearer = false) {
  const all = data?.items || [];
  if (!all.length) return `<p class="inline-note">${tools.escapeHtml(emptyBundlesText(data?.minBooks))}</p>`;
  const cheaper = all.filter((bundle) => bundle.totalSaving >= 0);
  const dearer = all.length - cheaper.length;
  const shown = showDearer ? all : cheaper;
  const note = dearer
    ? `<p class="inline-note">${cheaper.length ? '' : 'Żadna paczka nie jest tańsza niż wycena. '}${dearer} ${dearer === 1 ? 'paczka jest droższa' : 'paczek jest droższych'} niż wycena. <button type="button" class="link-button" data-bundles-dearer>${showDearer ? 'Ukryj droższe' : 'Pokaż też droższe'}</button></p>`
    : '';
  return note + shown.map((bundle) => bundleCardMarkup(bundle, tools)).join('');
}

export const loadBundles = (json) => json('/api/seller-bundles');

/** Collapsed „Paczki sprzedawców (N)” section above the deals list. */
export function installBundles({ $, json, escapeHtml, money, toast = () => {} }) {
  const body = $('#bundlesBody');
  if (!body) return { refresh: async () => {} };
  const summary = $('#bundlesSummary');
  const tools = { escapeHtml, money };
  const bySeller = new Map();
  let lastData = null;
  let showDearer = false;
  async function refresh() {
    let data;
    try {
      data = await loadBundles(json);
    } catch {
      body.innerHTML = '<p class="inline-note" role="alert">Nie udało się wczytać paczek sprzedawców.</p>';
      return;
    }
    bySeller.clear();
    for (const bundle of data.items || []) bySeller.set(`${bundle.source}|${bundle.sellerId}`, bundle);
    if (summary) summary.textContent = bundlesTitle((data.items || []).filter((bundle) => bundle.totalSaving >= 0).length);
    lastData = data;
    body.innerHTML = bundlesMarkup(data, tools, showDearer);
  }
  body.addEventListener('click', (event) => {
    if (event.target.closest('[data-bundles-dearer]')) {
      showDearer = !showDearer;
      body.innerHTML = bundlesMarkup(lastData, tools, showDearer);
      return;
    }
    const watch = event.target.closest('[data-bundle-watch]');
    if (watch) {
      const card = watch.closest('.bundle-card');
      void setWatched(json, card.dataset.source, card.dataset.bundle, Boolean(watch.dataset.bundleWatch))
        .then(() => document.dispatchEvent(new CustomEvent('bookflip-watch-changed')))
        .catch(() => toast('Nie udało się zmienić obserwacji sprzedawcy.'));
      return;
    }
    const button = event.target.closest('[data-bundle-toggle]');
    if (!button) return;
    const card = button.closest('.bundle-card');
    const bundle = bySeller.get(`${card.dataset.source}|${card.dataset.bundle}`);
    if (!bundle) return;
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    card.outerHTML = bundleCardMarkup(bundle, tools, expanded);
  });
  document.addEventListener('bookflip-watch-changed', () => void refresh());
  return { refresh };
}
