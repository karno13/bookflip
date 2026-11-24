// "Zapas" (podwidok Łowcy): the owner's copies as states and dates only, no amounts (stock.mjs on
// the server). Three columns (bought, listed, sold) with one-click moves, the age of a copy in
// days and medians of the times; no data shows "-", never 0. The buttons "Kupiłem" (deals) and
// "Wystawiłem" (edition page) write through the helpers at the bottom. Markup builders are pure.
import { plural } from '../core/valuation.js';

const headers = { 'content-type': 'application/json' };
export const COLUMNS = [
  { status: 'bought', title: 'Kupione' },
  { status: 'listed', title: 'Wystawione' },
  { status: 'sold', title: 'Sprzedane' },
];
export const MOVE_LABELS = { listed: 'Wystawiłem', sold: 'Sprzedałem', dropped: 'Odpuszczam' };
const MOVE_HINTS = {
  listed: 'Książka jest wystawiona na sprzedaż',
  sold: 'Książka została sprzedana',
  dropped: 'Nie sprzedam jej (zepsuta, oddana, pomyłka) — wychodzi z zapasu',
};
const ERRORS = {
  OFFER_NOT_IDENTIFIED: 'Ta oferta nie ma przypisanego wydania — najpierw przypisz ją w Kolejce (weryfikacja).',
  ALREADY_IN_STOCK: 'Ta oferta jest już w zapasie.',
  INVALID_STOCK_TRANSITION: 'Tego przejścia nie da się zrobić.',
  EDITION_NOT_FOUND: 'Nie znaleziono wydania.',
  OFFER_NOT_FOUND: 'Nie znaleziono oferty.',
  STOCK_NOT_FOUND: 'Tej sztuki już nie ma w zapasie.',
  NOTHING_TO_UNDO: 'Nie ma czego cofać.',
  STOCK_NOT_LISTED: 'Ta sztuka nie jest już wystawiona.',
  ISBN_LIST_REQUIRED: 'Zaznacz książki, które kupiłeś.',
  TOO_MANY_ITEMS: 'Za dużo pozycji naraz — kup mniejszą partię.',
  STOCK_CHANGED: 'Ta sztuka zmieniła się w międzyczasie — nic nie cofnięto. Odśwież widok Zapas.',
};

export const stockErrorMessage = (error) => ERRORS[error?.message] || 'Nie udało się zapisać w zapasie.';

/** "12 dni" / "1 dzień" or "-" without data (null or undefined), never "0". */
export function daysLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  const days = Math.round(Number(value));
  return `${days} ${plural(days, 'dzień', 'dni', 'dni')}`;
}

/** Header line: counts of the states, both medians and "sprzedane w 30 dni: N z M" ("-" without data). */
export function stockSummaryLabel(report) {
  const { counts = {}, medians = {}, soldIn30 = {} } = report || {};
  const sold = soldIn30.of ? `${soldIn30.sold} z ${soldIn30.of}` : '-';
  return `Kupione ${counts.bought || 0} · wystawione ${counts.listed || 0} · sprzedane ${counts.sold || 0} · mediana kupno → wystawienie: ${daysLabel(medians.boughtToListed)} · wystawienie → sprzedaż: ${daysLabel(medians.listedToSold)} · sprzedane w 30 dni: ${sold}`;
}

/** Header line of the calibration: own 30-day chance against the index; no number under 20 sold copies. */
export function calibrationLabel(calibration) {
  if (!calibration?.enough) return 'Twoja szansa sprzedaży w 30 dni vs indeks: za mało danych';
  const percent = (value) => `${Math.round(value * 100)}%`;
  return `Twoja szansa sprzedaży w 30 dni: ${percent(calibration.own)} (przedział ${percent(calibration.low)}–${percent(calibration.high)}, ${calibration.tries} prób) vs indeks ${percent(calibration.index)} (indeks to dzisiejszy model rynku, nie stan z dnia wystawienia)`;
}

/** The reminder on a listed copy: "leży N dni, przewidywane M; sugerowana obniżka do X zł" plus its two buttons. */
export function agingMarkup(reminder, id, escapeHtml) {
  if (!reminder) return '';
  const base = `leży ${daysLabel(reminder.daysListed)}, przewidywane ${daysLabel(reminder.expectedDays)}`;
  const tail = reminder.suggestion != null
    ? `; sugerowana obniżka do ${Math.round(reminder.suggestion / 100)} zł`
    : '; za mało ofert, by zaproponować cenę';
  return `<div class="stock-aging"><small>${escapeHtml(base + tail)}</small><button type="button" class="deal-triage-button" data-stock-repriced="${escapeHtml(id)}" title="Zapisuje tylko datę; przypomnienie wraca po 7 dniach">Obniżyłem cenę</button><button type="button" class="link-button" data-stock-keep="${escapeHtml(id)}" title="Wycisza przypomnienie do zmiany ceny rynkowej">Zostaw</button></div>`;
}

const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

/** One copy: title (opens the edition), dates, age and the buttons its state allows. */
export function stockCardMarkup(item, escapeHtml, reminder = null) {
  const dates = [
    item.boughtAt && item.boughtKnown !== false && `kupiona ${day(item.boughtAt)}`,
    item.listedAt && `wystawiona ${day(item.listedAt)}`,
    item.soldAt && `sprzedana ${day(item.soldAt)}`,
    item.droppedAt && `odpuszczona ${day(item.droppedAt)}`,
  ].filter(Boolean);
  const moves = (item.next || [])
    .map(
      (to) =>
        `<button type="button" class="deal-triage-button" data-stock-move="${escapeHtml(item.id)}" data-to="${to}" title="${escapeHtml(MOVE_HINTS[to])}">${MOVE_LABELS[to]}</button>`,
    )
    .join('');
  const undo = item.canUndo
    ? `<button type="button" class="link-button" data-stock-undo="${escapeHtml(item.id)}" data-event="${item.lastEventId ?? ''}" title="Cofa ostatnią zmianę tej sztuki">Cofnij</button>`
    : '';
  const age = item.ageDays == null ? '' : ` · ${daysLabel(item.ageDays)}`;
  return `<article class="stock-card" data-stock-id="${escapeHtml(item.id)}"><button type="button" class="link-button stock-title" data-stock-open="${escapeHtml(item.editionId)}" title="Otwórz wydanie">${escapeHtml(item.workTitle || item.editionTitle)}</button><small>${escapeHtml(dates.join(' · '))}${age}</small>${agingMarkup(reminder, item.id, escapeHtml)}${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}<div class="stock-actions">${moves}${undo}</div></article>`;
}

/** The three columns plus a folded list of dropped copies. */
export function stockBoardMarkup(report, escapeHtml, reminders = {}) {
  const items = report?.items || [];
  if (!items.length)
    return '<p class="inline-note">Zapas jest pusty. Dodasz sztukę przyciskiem „Kupiłem” przy okazji albo „Wystawiłem” w panelu Wystaw na stronie wydania.</p>';
  const columns = COLUMNS.map(({ status, title }) => {
    const own = items.filter((item) => item.status === status);
    return `<section class="stock-column" aria-label="${title}"><h3>${title} <small>${own.length}</small></h3>${own.map((item) => stockCardMarkup(item, escapeHtml, reminders[item.id])).join('') || '<p class="inline-note">-</p>'}</section>`;
  }).join('');
  const dropped = items.filter((item) => item.status === 'dropped');
  const tail = dropped.length
    ? `<details class="stock-dropped"><summary>Odpuszczone (${dropped.length})</summary>${dropped.map((item) => stockCardMarkup(item, escapeHtml)).join('')}</details>`
    : '';
  return `<div class="stock-board">${columns}</div>${tail}`;
}

/** „Co przyniosło towar”: per phrase and per seller, counts and days only; small groups give no rate. */
export function attributionMarkup(report, escapeHtml) {
  if (!report || !report.total) return '';
  const table = (title, rows) =>
    rows.length
      ? `<h4>${title}</h4><div class="stock-attribution-scroll"><table class="stock-attribution-table"><thead><tr><th>Źródło</th><th>Kupione</th><th>Sprzedane</th><th>Mediana dni od wystawienia do sprzedaży</th></tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.label)}</td><td>${row.bought}</td>${row.enough ? `<td>${row.sold}</td><td>${row.medianDaysToSold ?? '-'}</td>` : '<td colspan="2"><small>za mało danych (od 5 sztuk)</small></td>'}</tr>`,
          )
          .join('')}</tbody></table></div>`
      : '';
  const unknown = report.noPhrase ? `<small>${report.noPhrase} z ${report.total} sztuk bez znanej frazy (${report.unknown} bez frazy i sprzedawcy).</small>` : '';
  return `<details class="stock-attribution"><summary>Co przyniosło towar</summary>${table('Frazy', report.phrases)}${table('Sprzedawcy', report.sellers)}${unknown}</details>`;
}

export const addToStock = (json, body) =>
  json('/api/stock', { method: 'POST', headers, body: JSON.stringify(body) });
export const repriceStock = (json, id) => json(`/api/stock/${encodeURIComponent(id)}/repriced`, { method: 'POST', headers, body: '{}' });
export const keepStockPrice = (json, id) => json(`/api/stock/${encodeURIComponent(id)}/keep`, { method: 'POST', headers, body: '{}' });
export const moveStock = (json, id, to) =>
  json(`/api/stock/${encodeURIComponent(id)}/move`, { method: 'POST', headers, body: JSON.stringify({ to }) });
/** expectedEventId: undo only that change; if the copy moved on since, the server answers 409. */
export const undoStock = (json, id, expectedEventId = null) =>
  json(`/api/stock/${encodeURIComponent(id)}/undo`, {
    method: 'POST',
    headers,
    body: JSON.stringify(expectedEventId == null ? {} : { expectedEventId }),
  });

/** "Wystawiłem" on the edition page; the toast undo takes back exactly this change (409 if the copy moved on). */
export async function recordListing({ json, toast, editionId }) {
  try {
    const result = await json('/api/stock/listed', { method: 'POST', headers, body: JSON.stringify({ editionId }) });
    toast('Zapisano w zapasie jako wystawione.', {
      label: 'Cofnij',
      onClick: () => undoStock(json, result.id, result.eventId),
      onError: (error) => toast(error?.message === 'STOCK_CHANGED' ? stockErrorMessage(error) : 'Nie udało się cofnąć.'),
    });
    return result;
  } catch (error) {
    toast(stockErrorMessage(error));
    return null;
  }
}

/** "Kupiłem": adds a copy and offers the undo; errors become a Polish message. */
export async function recordPurchase({ json, toast, body, label = 'Dodano do zapasu.' }) {
  try {
    const created = await addToStock(json, body);
    toast(label, { label: 'Cofnij', onClick: () => undoStock(json, created.id, created.eventId), onError: (error) => toast(error?.message === 'STOCK_CHANGED' ? stockErrorMessage(error) : 'Nie udało się cofnąć.') });
    return created;
  } catch (error) {
    toast(stockErrorMessage(error));
    return null;
  }
}

const SKIP_REASONS = {
  invalid_isbn: 'to nie wygląda na ISBN',
  not_in_catalogue: 'brak wydania w katalogu — dodaj ISBN w Kolejce (weryfikacja)',
};

/** Toast text of a session purchase: what went to the stock and what was skipped, with the reason. */
export function purchaseSummary(result) {
  const created = result?.created || [];
  const skipped = result?.skipped || [];
  const parts = [];
  if (created.length) parts.push(`Dodano do zapasu: ${created.length} ${plural(created.length, 'książka', 'książki', 'książek')}.`);
  if (skipped.length)
    parts.push(`Pominięto ${skipped.length}: ${skipped.map((entry) => `${entry.isbn} (${SKIP_REASONS[entry.reason] || 'nie udało się'})`).join('; ')}.`);
  return parts.join(' ') || 'Nic nie dodano do zapasu.';
}

/**
 * "Kupiłem zaznaczone" in the Łowca session: one batch call (ISBN -> edition on the server). Skipped
 * rows get a message instead of failing the batch. The toast undo takes back exactly these copies
 * (each with its event id; a copy that moved on gives STOCK_CHANGED and the rest is still undone).
 */
export async function recordSessionPurchase({ json, toast, isbns, onUndone = () => {} }) {
  let result;
  try {
    result = await json('/api/stock/batch', { method: 'POST', headers, body: JSON.stringify({ items: isbns.map((isbn) => ({ isbn })) }) });
  } catch (error) {
    toast(stockErrorMessage(error));
    return null;
  }
  const message = purchaseSummary(result);
  if (!result.created.length) {
    toast(message);
    return result;
  }
  toast(message, {
    label: 'Cofnij',
    onClick: async () => {
      const outcomes = await Promise.allSettled(result.created.map((entry) => undoStock(json, entry.id, entry.eventId)));
      const undone = result.created.filter((_, index) => outcomes[index].status === 'fulfilled');
      if (undone.length) onUndone(undone.map((entry) => entry.isbn));
      const failed = outcomes.find((outcome) => outcome.status === 'rejected');
      if (failed) throw failed.reason;
    },
    onError: (error) => toast(error?.message === 'STOCK_CHANGED' ? stockErrorMessage(error) : 'Nie udało się cofnąć.'),
  });
  return result;
}

export function installStock({ $, json, escapeHtml, toast = () => {} }) {
  const board = $('#stockBoard');
  if (!board) return { refresh: async () => {} };
  let serial = 0;
  async function refresh() {
    const request = ++serial;
    let report;
    let aging = { reminders: [], calibration: { enough: false } };
    let attribution = null;
    try {
      report = await json('/api/stock');
      // The reminders are an addition: without them the board still shows.
      aging = await json('/api/stock/aging').catch(() => aging);
      attribution = await json('/api/stock/attribution').catch(() => null);
    } catch {
      if (request === serial) board.innerHTML = '<p class="inline-note">Nie udało się odczytać zapasu.</p>';
      return;
    }
    if (request !== serial) return;
    const attributionOpen = Boolean(board.querySelector('.stock-attribution[open]'));
    $('#stockSummary').textContent = `${stockSummaryLabel(report)} · ${calibrationLabel(aging.calibration)}`;
    board.innerHTML = stockBoardMarkup(report, escapeHtml, Object.fromEntries(aging.reminders.map((entry) => [entry.itemId, entry]))) + attributionMarkup(attribution, escapeHtml);
    if (attributionOpen) board.querySelector('.stock-attribution')?.setAttribute('open', '');
  }
  board.addEventListener('click', async (event) => {
    const open = event.target.closest('[data-stock-open]');
    const move = event.target.closest('[data-stock-move]');
    const undo = event.target.closest('[data-stock-undo]');
    const reprice = event.target.closest('[data-stock-repriced]');
    const keep = event.target.closest('[data-stock-keep]');
    if (open) {
      document.dispatchEvent(new CustomEvent('bookflip-open-edition', { detail: { editionId: open.dataset.stockOpen } }));
      return;
    }
    if (!move && !undo && !reprice && !keep) return;
    const button = move || undo || reprice || keep;
    if (button.disabled) return;
    button.disabled = true; // a double click must not send the request twice
    try {
      if (reprice) await repriceStock(json, reprice.dataset.stockRepriced);
      else if (keep) await keepStockPrice(json, keep.dataset.stockKeep);
      else if (move) await moveStock(json, move.dataset.stockMove, move.dataset.to);
      else await undoStock(json, undo.dataset.stockUndo, undo.dataset.event || null);
    } catch (error) {
      toast(stockErrorMessage(error));
    }
    await refresh();
  });
  return { refresh };
}
