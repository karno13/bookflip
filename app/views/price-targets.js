// „Kupuję do … zł”: the owner's price target of an edition or a work (price-targets.mjs on the
// server). An offer at or below it is a deal whatever the valuation says. Pure helpers (price
// parsing, labels, markup) are tested without a DOM; the mounts below wire them to the page.
const LIMIT_GROSZE = 1_000_000; // the server refuses 10 000 zł and more

/**
 * "15", "15,5", "15.50 zł" -> grosze (1500, 1550, 1500); null when it is not a price the server
 * accepts (empty, zero, negative, more than two decimals, 10 000 zł or more).
 */
export function parsePriceInput(text) {
  const clean = String(text ?? '')
    .replace(/\s+/g, '')
    .replace(/(zł|zl|pln)$/i, '');
  const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const grosze = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0') || 0);
  return grosze > 0 && grosze < LIMIT_GROSZE ? grosze : null;
}

/** grosze -> "15,00" for the input field. */
export function priceInputValue(grosze) {
  return grosze != null && Number.isFinite(Number(grosze)) ? (Number(grosze) / 100).toFixed(2).replace('.', ',') : '';
}

/** The target of one edition or work from the list, or null. */
export function findTarget(items, scope, id) {
  return (items || []).find((item) => item.scope === scope && (scope === 'edition' ? item.editionId : item.workId) === id) || null;
}

/** "Cel: 15,00 zł — aktywny" / "… — wyłączony" / "Brak celu". */
export function targetStatusLabel(target, money) {
  if (!target) return 'Brak celu';
  return `Cel: ${money(target.maxPrice)} — ${target.active ? 'aktywny' : 'wyłączony'}`;
}

/** The request body for a save: the scope's id plus grosze, or null for an invalid price. */
export function targetBody(scope, id, text) {
  const maxPrice = parsePriceInput(text);
  if (maxPrice == null) return null;
  return { [scope === 'edition' ? 'editionId' : 'workId']: id, maxPrice, active: true };
}

/** Badge of a deal that meets the owner's price; empty otherwise. Text, not only colour. */
export function targetBadgeMarkup(item, { escapeHtml, money }) {
  if (!item.target || !(item.target.maxPrice > 0)) return '';
  return `<span class="value-confidence is-high deal-target" title="Cena z Twojego celu „Kupuję do”">Twoja cena ≤ ${escapeHtml(money(item.target.maxPrice))}</span>`;
}

const SCOPE_NOTE = { edition: 'Dla tego wydania.', work: 'Dla polskich wydań tej książki.' };

/** Panel body: field, buttons and the state line. `target` may be null. */
export function targetPanelMarkup({ scope, id, target }, { escapeHtml, money }) {
  const key = `${scope}-${escapeHtml(id)}`;
  return `<div class="target-row"><label for="target-${key}">Kupuję do (zł)</label><input id="target-${key}" class="target-input" type="text" inputmode="decimal" autocomplete="off" placeholder="np. 15,00" value="${escapeHtml(target ? priceInputValue(target.maxPrice) : '')}"><button type="button" class="button primary" data-target-save>Zapisz</button>${target ? `<button type="button" class="button secondary" data-target-toggle>${target.active ? 'Wyłącz' : 'Włącz'}</button>` : ''}</div><p class="inline-note target-status" role="status">${escapeHtml(targetStatusLabel(target, money))}. ${escapeHtml(SCOPE_NOTE[scope])}</p>`;
}

/** Rows of the list of targets („Moje ceny docelowe”). */
export function targetsListMarkup(items, { escapeHtml, money }) {
  if (!items.length) return '<p class="inline-note">Brak celów. Ustaw „Kupuję do” w szczegółach wydania lub książki.</p>';
  return `<ul class="targets-list">${items
    .map(
      (item) =>
        `<li class="target-item${item.active ? '' : ' is-off'}"><span><b>${escapeHtml(item.title || 'Bez tytułu')}</b><small>${item.scope === 'work' ? 'polskie wydania książki' : 'wydanie'} · do ${escapeHtml(money(item.maxPrice))} · ${item.active ? 'aktywny' : 'wyłączony'}</small></span><button type="button" class="button secondary compact" data-target-active="${escapeHtml(item.id)}" data-active="${item.active ? '0' : '1'}">${item.active ? 'Wyłącz' : 'Włącz'}</button></li>`,
    )
    .join('')}</ul>`;
}

// Every write must be JSON: the server refuses other writes (tailscale-access.mjs).
const headers = { 'content-type': 'application/json' };
export const loadTargets = (json) => json('/api/price-targets').then((data) => data.items || []);
export const saveTarget = (json, body) => json('/api/price-targets', { method: 'PUT', headers, body: JSON.stringify(body) });
export const switchTarget = (json, id, active) =>
  json(`/api/price-targets/${encodeURIComponent(id)}/active`, { method: 'PUT', headers, body: JSON.stringify({ active }) });

/** Adds the „Kupuję do” section after `after` (edition page) or any element (work page). */
export function mountPriceTarget({ after, scope, id, json, toast, escapeHtml, money, onChange = () => {} }) {
  const section = document.createElement('section');
  section.className = 'detail-section target-panel';
  section.setAttribute('aria-label', 'Kupuję do');
  after.after(section);
  let target = null;
  const tools = { escapeHtml, money };
  const render = () => {
    section.innerHTML = targetPanelMarkup({ scope, id, target }, tools);
  };
  async function load() {
    try {
      target = findTarget(await loadTargets(json), scope, id);
    } catch {
      section.innerHTML = '<p class="inline-note" role="alert">Nie udało się wczytać celu „Kupuję do”.</p>';
      return;
    }
    render();
  }
  async function act(request, message) {
    try {
      await request();
    } catch (error) {
      toast(`Nie zapisano celu: ${error.message}`);
      return;
    }
    toast(message);
    await load();
    onChange();
  }
  section.addEventListener('click', (event) => {
    if (event.target.closest('[data-target-save]')) {
      const body = targetBody(scope, id, section.querySelector('.target-input').value);
      if (!body) {
        toast('Podaj cenę w zł, np. 15 lub 15,50 (od 0,01 do 9999,99).');
        section.querySelector('.target-input').focus();
        return;
      }
      // Saving keeps an existing target's switch: a deliberately switched-off one stays off.
      if (target && !target.active) body.active = false;
      void act(() => saveTarget(json, body), 'Zapisano cel.');
    } else if (event.target.closest('[data-target-toggle]') && target) {
      void act(() => switchTarget(json, target.id, !target.active), target.active ? 'Cel wyłączony.' : 'Cel włączony.');
    }
  });
  void load();
}

/** „Moje ceny docelowe” in „Okazje”: a collapsible list with a switch per target. */
export function installTargetsList({ $, json, escapeHtml, money, toast, onChange = () => {} }) {
  const body = $('#targetsBody');
  if (!body) return { refresh: async () => {} };
  const summary = $('#targetsSummary');
  async function refresh() {
    let items;
    try {
      items = await loadTargets(json);
    } catch {
      body.innerHTML = '<p class="inline-note" role="alert">Nie udało się wczytać celów.</p>';
      return;
    }
    const active = items.filter((item) => item.active).length;
    if (summary) summary.textContent = `Moje ceny docelowe (aktywne: ${active})`;
    body.innerHTML = targetsListMarkup(items, { escapeHtml, money });
  }
  body.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-target-active]');
    if (!button) return;
    button.disabled = true;
    try {
      await switchTarget(json, button.dataset.targetActive, button.dataset.active === '1');
    } catch (error) {
      toast(`Nie zapisano celu: ${error.message}`);
      button.disabled = false;
      return;
    }
    toast(button.dataset.active === '1' ? 'Cel włączony.' : 'Cel wyłączony.');
    await refresh();
    onChange();
  });
  return { refresh };
}
