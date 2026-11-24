// "Frazy": what each scan phrase brings (/api/phrases) and the owner's switch to turn a noisy one off
// (PUT /api/phrases/disabled, reversible). Render, filter and summary functions are pure.
import { plural } from '../core/valuation.js';

export const PHRASE_FILTERS = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'noise', label: 'Tylko szum' },
  { id: 'disabled', label: 'Wyłączone' },
];

const VERDICTS = {
  szum: { tone: 'warn', icon: '!', text: 'Szum' },
  ok: { tone: 'good', icon: '✔', text: 'OK' },
  za_malo_danych: { tone: 'neutral', icon: '…', text: 'Za mało danych' },
};
const VERDICT_FALLBACK = VERDICTS.za_malo_danych;

export const MANUAL_SCAN_NOTE =
  'Wyłączona fraza nie jest skanowana w pełnym i szybkim skanie ani przez snajpera; skan wpisany ręcznie zawsze robi dokładnie to, co wpisano.';

/** Rows of the chosen filter; unknown filter shows everything. */
export function filterPhrases(items, filter) {
  const list = Array.isArray(items) ? items : [];
  if (filter === 'noise') return list.filter((item) => item.verdict === 'szum' && !item.disabled);
  if (filter === 'disabled') return list.filter((item) => item.disabled);
  return list;
}

export function phraseCounts(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    noise: list.filter((item) => item.verdict === 'szum' && !item.disabled).length,
    disabled: list.filter((item) => item.disabled).length,
  };
}

/** "12 fraz, 3 szumiące, 1 wyłączona". */
export function phrasesSummaryText(items) {
  const { total, noise, disabled } = phraseCounts(items);
  return `${total} ${plural(total, 'fraza', 'frazy', 'fraz')}, ${noise} ${plural(noise, 'szumiąca', 'szumiące', 'szumiących')}, ${disabled} ${plural(disabled, 'wyłączona', 'wyłączone', 'wyłączonych')}`;
}

/** Share 0..1 as "38%"; "—" when unknown. */
export function sharePercent(share) {
  return Number.isFinite(share) ? `${Math.round(share * 100)}%` : '—';
}

/** Body of PUT /api/phrases/disabled. */
export function phraseSwitchBody(phrase, disabled) {
  return JSON.stringify({ phrase, disabled: disabled === true });
}

/**
 * Table (cards on a phone, by CSS) of phrases; outside strings through escapeHtml. `dateText`
 * turns lastSeenAt into display markup that is already safe.
 */
export function phrasesTableMarkup(items, { escapeHtml, dateText }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '<p class="phrases-empty" role="status">Brak fraz w tym widoku.</p>';
  const rows = list
    .map((item) => {
      const verdict = VERDICTS[item.verdict] || VERDICT_FALLBACK;
      const phrase = escapeHtml(item.phrase);
      const off = item.disabled === true;
      const action = off
        ? `<button class="button primary" type="button" data-phrase-toggle="${phrase}" data-phrase-disabled="false" aria-label="Włącz frazę: ${phrase}">Włącz</button>`
        : `<button class="button" type="button" data-phrase-toggle="${phrase}" data-phrase-disabled="true" aria-label="Wyłącz frazę: ${phrase}">Wyłącz</button>`;
      const state = off ? ' <span class="phrases-off">Wyłączona</span>' : '';
      return `<tr class="phrases-row${off ? ' is-off' : ''}"><th scope="row" data-label="Fraza"><strong>${phrase}</strong>${state}</th><td data-label="Nowe oferty">${Number(item.newOffers) || 0}</td><td data-label="Okazje">${Number(item.deals) || 0}</td><td data-label="Bez ISBN">${escapeHtml(sharePercent(item.withoutIsbnShare))}</td><td data-label="Ostatnio widziana">${dateText(item.lastSeenAt)}</td><td data-label="Werdykt"><span class="phrases-chip is-${verdict.tone}"><span aria-hidden="true">${verdict.icon}</span> ${escapeHtml(verdict.text)}</span></td><td class="phrases-action">${action}</td></tr>`;
    })
    .join('');
  return `<table class="phrases-table"><thead><tr><th scope="col">Fraza</th><th scope="col">Nowe oferty</th><th scope="col">Okazje</th><th scope="col">Bez ISBN</th><th scope="col">Ostatnio widziana</th><th scope="col">Werdykt</th><th scope="col"><span class="sr-only">Akcja</span></th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function installPhrases({ $, json, escapeHtml, dateText, toast }) {
  const root = $('#view-phrases');
  if (!root) return { refresh: async () => {} };
  const summary = $('#phrasesSummary');
  const list = $('#phrasesList');
  const filters = $('#phrasesFilter');
  let items = [];
  let days = 14;
  let filter = 'all';
  let serial = 0;
  const render = () => {
    summary.textContent = phrasesSummaryText(items);
    for (const button of filters.querySelectorAll('[data-phrase-filter]'))
      button.setAttribute('aria-pressed', String(button.dataset.phraseFilter === filter));
    list.innerHTML = phrasesTableMarkup(filterPhrases(items, filter), { escapeHtml, dateText });
  };
  const refresh = async () => {
    const request = ++serial;
    try {
      const data = await json('/api/phrases');
      if (request !== serial) return;
      items = Array.isArray(data?.items) ? data.items : [];
      days = data?.days ?? days;
      $('#phrasesDays').textContent = String(days);
      render();
    } catch {
      if (request !== serial) return;
      list.innerHTML = '<p class="phrases-empty" role="alert">Nie udało się wczytać fraz — spróbuj ponownie.</p>';
    }
  };
  const put = (phrase, disabled) =>
    json('/api/phrases/disabled', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: phraseSwitchBody(phrase, disabled) });
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-phrase-filter]');
    if (!button) return;
    filter = button.dataset.phraseFilter;
    render();
  });
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-phrase-toggle]');
    if (!button) return;
    const phrase = button.dataset.phraseToggle;
    const disabled = button.dataset.phraseDisabled === 'true';
    button.disabled = true;
    try {
      await put(phrase, disabled);
    } catch {
      button.disabled = false;
      toast('Nie udało się zmienić frazy.');
      return;
    }
    await refresh();
    toast(disabled ? 'Fraza wyłączona.' : 'Fraza włączona.', {
      label: 'Cofnij',
      onClick: async () => {
        await put(phrase, !disabled);
        await refresh();
      },
      onError: () => toast('Nie udało się cofnąć.'),
    });
  });
  return { refresh };
}
