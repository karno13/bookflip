import { recordListing } from './stock.js';
// "Karta wystawienia" on the edition page: three price tiers with a rough 30-day sale chance, the
// competition now and a title and description ready to copy. The panel opens under „Wystaw”; a
// change of the condition reloads the card. „Wystawiłem” records the copy in the stock register (stock.js). Markup builders are pure (no DOM) and tested.
export const CONDITIONS = [
  ['', 'Nie wybrano ([uzupełnij] w opisie)'],
  ['new', 'Nowa'],
  ['very_good', 'Bardzo dobry'],
  ['good', 'Dobry'],
  ['satisfactory', 'Zadowalający'],
];

/** "orientacyjnie 42% szans na sprzedaż w 30 dni" */
export function chanceLabel(chance) {
  const value = Number(chance);
  if (chance == null || !Number.isFinite(value)) return 'brak oszacowania szans (za mało sprzedaży tego wydania)';
  return `orientacyjnie ${Math.round(Math.min(1, Math.max(0, value)) * 100)}% szans na sprzedaż w 30 dni`;
}

/** "N ofert teraz, najtańsza X zł, mediana Y zł" or "brak ofert". */
export function competitionSentence(competition, money) {
  const count = Number(competition?.count) || 0;
  if (!count) return 'Brak ofert tego wydania teraz.';
  const word =
    count === 1 ? 'oferta' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'oferty' : 'ofert';
  const median = count > 1 && competition.median != null ? `, mediana ${money(competition.median)}` : '';
  return `${count} ${word} teraz, najtańsza ${money(competition.cheapest)}${median}.`;
}

export function conditionOptionsMarkup(selected, escapeHtml) {
  return CONDITIONS.map(
    ([value, label]) => `<option value="${escapeHtml(value)}"${value === (selected || '') ? ' selected' : ''}>${escapeHtml(label)}</option>`,
  ).join('');
}

function tiersMarkup(card, { money, escapeHtml }) {
  if (!card.tiers?.length) {
    return '<p class="listing-empty" role="status">Za mało ofert tego wydania, żeby podać cenę.</p>';
  }
  return `<div class="listing-tiers">${card.tiers
    .map(
      (tier) =>
        `<div class="listing-tier${tier.id === 'srodek' ? ' is-key' : ''}"><small>${escapeHtml(tier.label)}</small><strong>${money(tier.price)}</strong><small>${escapeHtml(chanceLabel(tier.chance))}</small></div>`,
    )
    .join('')}</div>`;
}

/** Body of the panel for a loaded card (everything below the condition select). */
export function listingCardMarkup(card, { money, escapeHtml }) {
  const text = card.text || {};
  return `${tiersMarkup(card, { money, escapeHtml })}<p class="listing-competition">${escapeHtml(competitionSentence(card.competition, money))}</p><div class="listing-field"><label for="listingTitle">Tytuł ogłoszenia</label><input id="listingTitle" type="text" readonly value="${escapeHtml(text.title || '')}"><button type="button" class="button secondary compact" data-listing-copy="title">Kopiuj tytuł</button></div><div class="listing-field"><label for="listingDescription">Opis ogłoszenia</label><textarea id="listingDescription" readonly rows="8">${escapeHtml(text.description || '')}</textarea><button type="button" class="button secondary compact" data-listing-copy="description">Kopiuj opis</button></div>${card.note ? `<p class="listing-note">${escapeHtml(card.note)}</p>` : ''}`;
}

export function listingUrl(editionId, condition) {
  const query = condition ? `?condition=${encodeURIComponent(condition)}` : '';
  return `/api/editions/${encodeURIComponent(editionId)}/listing-card${query}`;
}

/** Copies `field`'s text; falls back to selecting it. Returns 'copied' | 'selected'. */
export async function copyField(field, clipboard = globalThis.navigator?.clipboard) {
  try {
    if (!clipboard?.writeText) throw new Error('no clipboard');
    await clipboard.writeText(field.value);
    return 'copied';
  } catch {
    field.focus();
    field.select();
    return 'selected';
  }
}

/** Adds the „Wystaw” button and its panel after `after` (an element of the edition page). */
export function mountListingCard({ after, editionId, json, toast, escapeHtml, money }) {
  const section = document.createElement('section');
  section.className = 'detail-section listing-card';
  section.innerHTML =
    '<button type="button" class="button primary" data-listing-open aria-expanded="false" aria-controls="listingPanel">Wystaw</button><div id="listingPanel" class="listing-panel" hidden></div>';
  after.after(section);
  const button = section.querySelector('[data-listing-open]');
  const panel = section.querySelector('#listingPanel');
  let condition = '';
  let request = 0;

  async function load() {
    const mine = ++request;
    panel.setAttribute('aria-busy', 'true');
    let body;
    try {
      body = listingCardMarkup(await json(listingUrl(editionId, condition)), { money, escapeHtml });
    } catch (error) {
      body = `<p class="listing-empty" role="alert">Nie udało się wczytać karty: ${escapeHtml(error.message)}</p>`;
    }
    if (mine !== request) return;
    panel.querySelector('.listing-body').innerHTML = body;
    panel.removeAttribute('aria-busy');
  }

  panel.innerHTML = `<div class="listing-condition"><label for="listingCondition">Stan książki</label><select id="listingCondition">${conditionOptionsMarkup('', escapeHtml)}</select></div><div class="listing-body" aria-live="polite"></div><div class="listing-stock"><button type="button" class="button secondary compact" data-listing-stock title="Zapisuje w zapasie, że ta książka jest wystawiona (bez kwot)">Wystawiłem</button></div>`;
  panel.querySelector('#listingCondition').addEventListener('change', (event) => {
    condition = event.target.value;
    void load();
  });
  panel.addEventListener('click', async (event) => {
    const stockButton = event.target.closest('[data-listing-stock]');
    if (stockButton) {
      if (stockButton.disabled) return;
      stockButton.disabled = true; // one request per click
      try {
        await recordListing({ json, toast, editionId });
      } finally {
        stockButton.disabled = false;
      }
      return;
    }
    const copy = event.target.closest('[data-listing-copy]');
    if (!copy) return;
    const field = panel.querySelector(copy.dataset.listingCopy === 'title' ? '#listingTitle' : '#listingDescription');
    const result = await copyField(field);
    toast(result === 'copied' ? 'Skopiowano' : 'Schowek niedostępny — tekst zaznaczony, skopiuj go ręcznie (Ctrl+C).');
  });
  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) void load();
  });
}
