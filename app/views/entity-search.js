// „Szukaj” in the top bar: sellers, authors and publisher series (entity-search.mjs on the server).
// Price against valuation and turnover only — no costs, no profit, no lists of missing volumes.
// Pure markup helpers are tested without a DOM; installEntitySearch wires the field and the key "/".

const safeUrl = (url) => (/^https?:\/\//i.test(String(url || '')) ? String(url) : '');
const percent = (fraction) => `${fraction > 0 ? '+' : ''}${Math.round(fraction * 100)}%`;

/** „mediana odchylenia od wyceny: −12%”, or a note when no offer has a reliable valuation. */
export function deviationText(card) {
  return card.medianDeviation == null
    ? 'brak wiarygodnych wycen'
    : `mediana odchylenia od wyceny: ${percent(card.medianDeviation).replace('-', '−')}`;
}

export function sellerCardMarkup(card, { escapeHtml, money }) {
  // Vinted gives no seller name: such a seller is shown by its number, found only by the whole number.
  const name = escapeHtml(card.sellerName || `#${card.sellerId}`);
  const rows = (card.offers || [])
    .map((offer) => {
      const url = safeUrl(offer.url);
      const title = escapeHtml(offer.title || 'Bez tytułu');
      const link = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${title}</a>` : `<span>${title}</span>`;
      const worth = offer.worth == null ? 'bez wiarygodnej wyceny' : `wycena ${escapeHtml(money(offer.worth))} (${escapeHtml(percent(offer.deviation).replace('-', '−'))})`;
      return `<li>${link}<small>cena ${escapeHtml(money(offer.price))} · ${worth}</small></li>`;
    })
    .join('');
  return `<article class="entity-card" data-kind="seller"><h4>Sprzedawca ${name} <small>${escapeHtml(card.source)}</small></h4><p class="entity-summary">${card.activeCount} aktywnych ofert (${card.valuedCount} z wyceną) · zniknęło w 30 dni: ${card.goneIn30Days}, w tym sprzedanych ${card.soldIn30Days} · ${escapeHtml(deviationText(card))}</p>${rows ? `<ul class="entity-offers">${rows}</ul>` : ''}</article>`;
}

export function catalogCardMarkup(card, kind, { escapeHtml, money }) {
  const label = kind === 'author' ? 'Autor' : 'Seria';
  const price = card.medianPrice == null ? 'brak cen' : `mediana ceny ${money(card.medianPrice)}`;
  return `<article class="entity-card" data-kind="${kind}"><h4>${label} ${escapeHtml(card.name)}</h4><p class="entity-summary">obrót (30 dni) ${escapeHtml(money(card.turnover))} · żywych ofert ${card.liveOffers} · ${escapeHtml(price)} · książek ${card.workCount}</p></article>`;
}

export function entityResultsMarkup(data, tools) {
  const parts = [
    ...(data?.sellers || []).map((card) => sellerCardMarkup(card, tools)),
    ...(data?.authors || []).map((card) => catalogCardMarkup(card, 'author', tools)),
    ...(data?.series || []).map((card) => catalogCardMarkup(card, 'series', tools)),
  ];
  return parts.length ? parts.join('') : '<p class="inline-note">Brak autorów, serii i sprzedawców o takiej nazwie (sprzedawcę bez nazwy znajdziesz po pełnym numerze).</p>';
}

/** Latest wins: `next()` starts a request, `cancel()` drops every one in flight. Pure (tested). */
export function createLatest() {
  let serial = 0;
  return {
    next: () => ++serial,
    cancel: () => void ++serial,
    isCurrent: (request) => request === serial,
  };
}

export function installEntitySearch({ $, json, escapeHtml, money }) {
  const input = $('#entitySearch');
  const panel = $('#entityResults');
  if (!input || !panel) return { focus: () => {} };
  const tools = { escapeHtml, money };
  let timer = null;
  const latest = createLatest();
  function close() {
    clearTimeout(timer);
    latest.cancel();
    panel.hidden = true;
    panel.innerHTML = '';
  }
  async function run() {
    const text = input.value.trim();
    if (text.length < 2) return close();
    const request = latest.next();
    try {
      const data = await json('/api/search/entities?' + new URLSearchParams({ q: text }));
      if (!latest.isCurrent(request)) return;
      panel.innerHTML = entityResultsMarkup(data, tools);
    } catch {
      if (!latest.isCurrent(request)) return;
      panel.innerHTML = '<p class="inline-note" role="alert">Nie udało się wyszukać.</p>';
    }
    panel.hidden = false;
  }
  input.addEventListener('input', () => {
    if (input.value.trim().length < 2) return close();
    clearTimeout(timer);
    timer = setTimeout(() => void run(), 250);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { input.value = ''; close(); input.blur(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target?.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    input.focus();
    input.select();
  });
  return { focus: () => input.focus() };
}
