// "Przegląd" in „Okazje”: the deals one by one with one key each (K bought -> Zapas, L to the chosen
// label, O snooze, N not for me, S skip, Z undo the last action), plus buttons for the phone. Uses
// only existing routes (POST /api/stock, PUT/DELETE /api/deals/:id/triage, POST/DELETE
// /api/catalog/labels/:name/works); no amounts, no profit. The queue is a snapshot of the list at
// the moment of opening, so an undo brings the deal back in the same place.
import { coverMarkup, tidyOfferTitle } from '../core/bibliography.js';
import { safeOfferHref } from '../core/formatters.js';
import { zl } from '../core/valuation.js';
import { addToStock, stockErrorMessage, undoStock } from './stock.js';

const headers = { 'content-type': 'application/json' };
const enc = encodeURIComponent;
const KEYS = { k: 'bought', l: 'label', o: 'snooze', n: 'dismiss', s: 'skip', z: 'undo', escape: 'close' };
export const ACTIONS = [
  ['bought', 'K', 'Kupiłem', 'Zapisuje w zapasie, że kupiłeś tę książkę (bez kwot)'],
  ['label', 'L', 'Do etykiety', 'Dodaje książkę do wybranej etykiety'],
  ['snooze', 'O', 'Odłóż', 'Wróci za dobę albo wcześniej, gdy sprzedawca obniży cenę'],
  ['dismiss', 'N', 'Nie', 'Chowa okazję; wróci tylko, gdy cena spadnie'],
  ['skip', 'S', 'Pomiń', 'Przechodzi dalej bez zapisu'],
  ['undo', 'Z', 'Cofnij', 'Cofa ostatnią akcję'],
];

/** The action of a key press ("K", "k", "Escape"), or null. Pure (tested). */
export const reviewAction = (key) => KEYS[String(key || '').toLowerCase()] || null;

/** "3 z 12" while deals remain, "Koniec" when the queue is done. Pure (tested). */
export function counterLabel(index, total) {
  if (!total) return 'Brak okazji do przeglądu';
  return index >= total ? `Koniec: ${total} z ${total}` : `${index + 1} z ${total}`;
}

/** Offer preview: price, valuation, saving and the link. Pure (tested). */
export function previewMarkup(item, { escapeHtml, money }) {
  return `<div class="review-card">${coverMarkup(item.image, item.title, { size: 'sm', escapeHtml })}<div class="review-copy"><h3 class="review-title" id="dealReviewTitle">${escapeHtml(tidyOfferTitle(item.title))}</h3><p><strong class="deal-saving">−${zl(item.saving)}</strong> · −${escapeHtml(item.discount)}% · za <b>${money(item.price)}</b> · warta ~${zl(item.worth)} <small>(${Math.round(item.worthLow / 100)}–${zl(item.worthHigh)})</small></p><small>${escapeHtml(item.source)} · <span class="value-confidence is-${escapeHtml(item.confidence)}">wiarygodność ${escapeHtml(item.confidenceLabel)}</span> · ${escapeHtml(item.workTitle)} · <a href="${escapeHtml(safeOfferHref(item.url))}" target="_blank" rel="noopener noreferrer">ogłoszenie ↗</a></small></div></div>`;
}

/** The action buttons with their keys shown. Pure (tested). */
export function actionsMarkup(escapeHtml) {
  return ACTIONS.map(
    ([action, key, label, hint]) =>
      `<button type="button" class="deal-triage-button review-action" data-review="${action}" title="${escapeHtml(hint)}" aria-keyshortcuts="${key}"><kbd>${key}</kbd> ${escapeHtml(label)}</button>`,
  ).join('');
}

export function installDealReview({ $, json, escapeHtml, money, getDeals, onClose = () => {}, toast = () => {} }) {
  const panel = $('#dealReview');
  if (!panel) return { open: () => {}, close: () => {} };
  const card = $('#dealReviewCard');
  const counter = $('#dealReviewCounter');
  const live = $('#dealReviewLive');
  const picker = $('#dealReviewLabel');
  $('#dealReviewActions').innerHTML = actionsMarkup(escapeHtml);
  let queue = [];
  let index = 0;
  let busy = false;
  let done = []; // undo records, last on top
  let lastLabel = '';
  let session = 0; // bumped by open()/close(); an action started in an older session must not touch the new queue

  // Card announcement for screen readers only (the card itself is visible).
  const say = (text) => {
    live.textContent = text;
  };
  // Feedback of an action: visible toast (its region is aria-live) and the sr-only line.
  const notify = (text) => {
    say(text);
    toast(text);
  };
  function show({ announce = true } = {}) {
    counter.textContent = counterLabel(index, queue.length);
    const item = queue[index];
    card.innerHTML = item
      ? previewMarkup(item, { escapeHtml, money })
      : `<p class="inline-note">${queue.length ? 'To już wszystkie okazje z tego przeglądu.' : 'Brak okazji do przeglądu przy obecnych filtrach.'}</p>`;
    panel.querySelectorAll('[data-review]').forEach((button) => {
      const action = button.dataset.review;
      button.disabled = busy || (action === 'undo' ? !done.length : !item && action !== 'close');
    });
    if (item && announce) say(`${counterLabel(index, queue.length)}: ${tidyOfferTitle(item.title)}, ${money(item.price)}, oszczędność ${zl(item.saving)}.`);
  }
  async function loadLabels() {
    try {
      const { items } = await json('/api/catalog/labels');
      picker.innerHTML = `<option value="">Wybierz etykietę…</option>${items.map((entry) => `<option value="${escapeHtml(entry.label)}">${escapeHtml(entry.label)}</option>`).join('')}`;
      if (items.some((entry) => entry.label === lastLabel)) picker.value = lastLabel;
    } catch {
      picker.innerHTML = '<option value="">Nie udało się wczytać etykiet</option>';
    }
  }

  const triage = (item, state) => json(`/api/deals/${enc(item.offerId)}/triage`, { method: 'PUT', headers, body: JSON.stringify({ state }) });
  const untriage = (item) => json(`/api/deals/${enc(item.offerId)}/triage`, { method: 'DELETE', headers });
  // Each handler returns { message, undo } (undo may be null) or throws; the queue moves on after it.
  const HANDLERS = {
    async bought(item) {
      const created = await addToStock(json, { offerId: item.offerId });
      return { message: 'Dodano do zapasu', undo: () => undoStock(json, created.id, created.eventId) };
    },
    async label(item) {
      const name = picker.value;
      if (!name) {
        picker.focus();
        throw Object.assign(new Error('NO_LABEL'), { handled: true, text: 'Wybierz etykietę z listy, potem naciśnij L albo „Do etykiety”.' });
      }
      lastLabel = name;
      const base = `/api/catalog/labels/${enc(name)}/works`;
      const result = await json(base, { method: 'POST', headers, body: JSON.stringify({ workIds: [item.workId] }) });
      return {
        message: result.added ? `Dodano do etykiety „${name}”` : `Już w etykiecie „${name}”`,
        undo: result.added ? () => json(`${base}/${enc(item.workId)}`, { method: 'DELETE', headers }) : null,
      };
    },
    async snooze(item) {
      await triage(item, 'snoozed');
      return { message: 'Odłożono do jutra', undo: () => untriage(item) };
    },
    async dismiss(item) {
      await triage(item, 'dismissed');
      return { message: 'Odrzucono', undo: () => untriage(item) };
    },
    async skip() {
      return { message: 'Pominięto', undo: null };
    },
  };
  const FAILS = { TOO_MANY_LABELS: 'Ta książka ma już 20 etykiet.', LABEL_NOT_FOUND: 'Tej etykiety już nie ma.' };

  async function act(action) {
    if (action === 'close') return close();
    if (busy || !queue.length) return;
    busy = true;
    const mine = session;
    const current = () => mine === session;
    try {
      if (action === 'undo') {
        const last = done[done.length - 1];
        if (!last) return notify('Nie ma czego cofać.');
        try {
          await last.undo?.();
        } catch (error) {
          return notify(error?.message === 'STOCK_CHANGED' ? stockErrorMessage(error) : 'Nie udało się cofnąć.');
        }
        if (!current()) return notify(`Cofnięto: ${last.message}.`);
        done.pop();
        index = last.index;
        busy = false;
        show({ announce: false });
        notify(`Cofnięto: ${last.message}. ${counterLabel(index, queue.length)}.`);
        return;
      }
      const item = queue[index];
      if (!item) return;
      try {
        const result = await HANDLERS[action](item);
        if (!current()) return notify(`${result.message} — ${tidyOfferTitle(item.title)}`);
        done.push({ index, message: `${result.message} — ${tidyOfferTitle(item.title)}`, undo: result.undo });
        index += 1;
        busy = false;
        show({ announce: false });
        notify(`${result.message}. ${counterLabel(index, queue.length)}.`);
      } catch (error) {
        if (current()) notify(error.handled ? error.text : FAILS[error?.message] || (action === 'bought' ? stockErrorMessage(error) : 'Nie udało się zapisać.'));
      }
    } finally {
      // Only unlock the buttons; show() would announce the card over the error message.
      if (current() && busy) {
        busy = false;
        show({ announce: false });
      }
    }
  }
  panel.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', () => void act(button.dataset.review)));
  picker.addEventListener('change', () => panel.focus());
  $('#dealReviewClose').addEventListener('click', () => close());
  document.addEventListener('keydown', (event) => {
    if (panel.hidden || !panel.offsetParent || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const drawer = $('#offerDrawer');
    if (drawer && !drawer.hidden) return; // the offer drawer owns the keys while open
    const action = reviewAction(event.key);
    if (!action) return;
    const inSelect = event.target.closest?.('select');
    if (inSelect ? action !== 'close' : event.target.closest?.('input, textarea, dialog, [contenteditable]')) return;
    event.preventDefault();
    void act(action);
  });

  function open() {
    queue = [...getDeals()].filter((item) => !item.hidden && !item.verdict);
    session += 1;
    index = 0;
    done = [];
    busy = false;
    panel.hidden = false;
    void loadLabels();
    show();
    panel.focus();
  }
  function close() {
    session += 1;
    busy = false;
    panel.hidden = true;
    onClose();
  }
  return { open, close };
}
