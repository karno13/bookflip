// Katalog → „Etykiety”: the owner's labels as collections (label-collections.mjs). The list shows
// every label with its number of books, „Układaj okładki” and „Nowa etykieta”; inside a label: the
// order is arranged on the covers (cover-order.js, opened by „Układaj okładki”), here stay a folded
// list of the books with volume numbers and ×, „Ułóż według tomów”, a book search to add books; a label
// can be renamed (a name that exists asks to merge) or deleted (its books stay in the catalogue).
// Organisation only, never identification evidence.
// „Rynek” (label-market.mjs): the cheapest buyable Polish offer per book, gaps in the owner's own
// volume numbers, „Skanuj brakujące” (puts phrases into the scan field, never starts a scan) and one
// „Kupuję do … zł” for every book of the label. For buying, not a list of missing volumes.
import { confirmDialog } from '../core/dialogs.js';
import { fillNameLists } from './labels.js';
import { createLatest } from './entity-search.js';
import { money, moneyFromZloty, safeOfferHref, zlotyToGrosze } from '../core/formatters.js';
import { fillScanQueries, labelPhrases } from './scan-series.js';

const enc = encodeURIComponent;

export function booksWord(n) {
  if (n === 1) return 'książka';
  return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'książki' : 'książek';
}

/** Books by their volume number (without one: after them, in the present order). Pure (tested). */
export function idsByVolume(works) {
  return works
    .map((work, index) => ({ work, index }))
    .sort((a, b) => (a.work.volume ?? Infinity) - (b.work.volume ?? Infinity) || a.index - b.index)
    .map((item) => item.work.id);
}

/** The list of labels. Pure (tested). */
export function collectionsMarkup(items, escapeHtml) {
  return `<div class="label-bar"><button type="button" class="button secondary compact" data-label-new>Nowa etykieta</button><form class="label-form" data-label-form hidden><label class="field"><span>Nazwa etykiety</span><input name="name" maxlength="60" required placeholder="np. Duchy Gaunta"></label><button type="submit" class="button primary compact">Utwórz</button><button type="button" class="button ghost compact" data-label-cancel>Anuluj</button></form></div>${
    items.length
      ? `<ul class="label-collections">${items.map((item) => `<li class="label-item"><button type="button" class="label-card" data-label-open="${escapeHtml(item.label)}"><strong>${escapeHtml(item.label)}</strong><small>${item.works} ${booksWord(item.works)}</small></button>${item.works > 1 ? `<button type="button" class="button ghost compact label-arrange" data-label-arrange="${escapeHtml(item.label)}" title="Otwiera katalog w widoku Okładki z tą etykietą">Układaj okładki</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="inline-note">Nie ma jeszcze etykiet. „Nowa etykieta” tworzy pustą kolekcję, książki dodasz w jej środku.</p>'
  }`;
}

/** One book of a collection. Pure (tested). */
export function bookRowMarkup(work, index, escapeHtml, groups = []) {
  const id = escapeHtml(work.id);
  const title = escapeHtml(work.title);
  const authors = (work.authors || []).length ? `<small>${escapeHtml(work.authors.join(', '))}</small>` : '';
  return `<li class="label-book" data-label-row="${id}"><span class="label-position" title="Miejsce w kolejności">${index + 1}</span><span class="label-book-title"><button type="button" class="link-button" data-label-book="${id}">${title}</button>${authors}</span><label class="label-volume"><span>Tom</span><input type="number" min="1" max="10000" inputmode="numeric" value="${work.volume ?? ''}" data-label-volume="${id}" aria-label="Numer tomu: ${title}"></label>${groups.length ? `<label class="label-group-pick"><span>Podetykieta</span><select data-label-assign="${id}" aria-label="Podetykieta: ${title}"><option value="">bez podetykiety</option>${groups.map((group) => `<option value="${group.id}"${work.groupId === group.id ? ' selected' : ''}>${escapeHtml(group.name)}</option>`).join('')}</select></label>` : ''}<button type="button" class="button ghost compact" data-label-remove="${id}" aria-label="Usuń z etykiety: ${title}" title="Usuń z etykiety (książka zostaje w katalogu)">×</button></li>`;
}

/**
 * The books of a label, grouped under the sub-labels (collapsible; `closed` = ids of folded ones).
 * Without sub-labels it is the plain ordered list. The numbers stay the label-wide order. Pure (tested).
 */
export function booksMarkup(data, escapeHtml, closed = new Set()) {
  const groups = data.groups || [];
  const rows = (list) => `<ol class="label-books">${list.map(({ work, index }) => bookRowMarkup(work, index, escapeHtml, groups)).join('')}</ol>`;
  const numbered = data.works.map((work, index) => ({ work, index }));
  if (!groups.length) return rows(numbered);
  const known = new Set(groups.map((group) => group.id));
  const loose = numbered.filter(({ work }) => !known.has(work.groupId)); // an unknown group counts as none
  return `${loose.length ? `<section class="label-group" data-label-group-section=""><h4>Bez podetykiety (${loose.length})</h4>${rows(loose)}</section>` : ''}${groups
    .map((group) => {
      const own = numbered.filter(({ work }) => work.groupId === group.id);
      const name = escapeHtml(group.name);
      return `<details class="label-group" data-label-group-section="${group.id}"${closed.has(group.id) ? '' : ' open'}><summary><span>${name} (${own.length})</span><span class="label-group-actions"><button type="button" class="button ghost compact" data-label-group-rename="${group.id}" aria-label="Zmień nazwę podetykiety ${name}">Zmień nazwę</button><button type="button" class="button ghost compact" data-label-group-delete="${group.id}" aria-label="Usuń podetykietę ${name}">Usuń</button></span></summary>${own.length ? rows(own) : '<p class="inline-note">Pusta podetykieta. Wybierz ją przy książce w polu „Podetykieta”.</p>'}</details>`;
    })
    .join('')}`;
}

/** The form that creates a sub-label (and the rename form, hidden until asked; both outside the folded list). Pure. */
export const groupFormMarkup = () =>
  '<form class="label-form" data-label-group-form><label class="field"><span>Nowa podetykieta</span><input name="name" maxlength="60" required placeholder="np. Tomy 1–10"></label><button type="submit" class="button secondary compact">Dodaj podetykietę</button></form><form class="label-form" data-label-group-rename-form hidden><label class="field"><span>Nowa nazwa podetykiety</span><input name="name" maxlength="60" required></label><button type="submit" class="button primary compact">Zapisz</button><button type="button" class="button ghost compact" data-label-group-rename-cancel>Anuluj</button></form>';

/** Books of the label that have no buyable offer now, as in the market answer. Pure (tested). */
export function missingBooks(works, books) {
  const none = new Set((books || []).filter((book) => !book.cheapest).map((book) => book.workId));
  return works.filter((work) => none.has(work.id));
}

/** One line of „Rynek”: a book with its cheapest offer or „brak ofert”. Pure (tested). */
export function marketRowMarkup(book, escapeHtml) {
  const volume = book.volume ? `<span class="label-market-volume">t. ${book.volume}</span> ` : '';
  const target = book.target ? ` <small>cel ≤ ${escapeHtml(money(book.target))}</small>` : '';
  const offer = book.cheapest;
  const body = offer
    ? `<a href="${escapeHtml(safeOfferHref(offer.url))}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(money(offer.price))}</strong></a> <small>${escapeHtml(offer.source)}${book.liveOffers > 1 ? `, ${book.liveOffers} ofert` : ''}${offer.worth != null ? `; wycena ${escapeHtml(money(offer.worth))} (${escapeHtml(offer.confidenceLabel || '')})${offer.saving > 0 ? `, taniej o ${escapeHtml(money(offer.saving))}` : ''}` : '; bez wyceny'}</small>`
    : '<span class="label-market-none">brak ofert</span>';
  return `<li class="label-market-row"><span class="label-market-book">${volume}${escapeHtml(book.title)}${target}</span><span class="label-market-offer">${body}</span></li>`;
}

/** The „Rynek” panel of one label. Pure (tested). */
export function marketMarkup(market, escapeHtml) {
  if (market.error) return `<section class="label-market"><p class="inline-note">Nie udało się wczytać rynku: ${escapeHtml(market.error)}</p></section>`;
  const gaps = market.gaps?.length
    ? `<p class="inline-note" data-label-gaps>W Twojej numeracji brakuje tomów: ${market.gaps.join(', ')}${market.more ? ` i ${market.more} kolejnych` : ''}.</p>`
    : '';
  const books = market.books || [];
  const actions = books.length
    ? `<div class="label-market-actions">${market.withoutOffers ? `<button type="button" class="button secondary compact" data-label-scan-missing>Skanuj brakujące (${market.withoutOffers})</button>` : ''}<form class="label-form" data-label-target-form><label class="field"><span>Kupuję do … zł (każda książka)</span><input name="price" type="number" min="0.01" step="0.01" inputmode="decimal" required></label><button type="submit" class="button secondary compact">Ustaw dla etykiety</button></form></div>`
    : '';
  return `<section class="label-market" aria-label="Rynek etykiety"><h4>Rynek</h4>${gaps}${
    books.length ? `<ul class="label-market-list">${books.map((book) => marketRowMarkup(book, escapeHtml)).join('')}</ul>${actions}` : '<p class="inline-note">Etykieta nie ma książek, więc nie ma czego szukać na rynku.</p>'
  }</section>`;
}

/** The inside of one label; `market` (the answer of /market, or { error }) opens the „Rynek” panel. Pure (tested). */
export function collectionMarkup(data, escapeHtml, market, { listOpen = false, closedGroups = new Set() } = {}) {
  const name = escapeHtml(data.label);
  const works = data.works;
  return `<div class="label-head"><button type="button" class="link-button" data-label-back>← Wszystkie etykiety</button><h3>${name}</h3><small>${works.length} ${booksWord(works.length)}</small><span class="label-head-actions">${works.length > 1 ? `<button type="button" class="button primary compact" data-label-arrange="${name}" title="Otwiera katalog w widoku Okładki: przeciągasz okładki, aby zmienić kolejność">Układaj okładki</button>` : ''}<button type="button" class="button ghost compact" data-label-rename>Zmień nazwę</button>${works.length > 1 ? '<button type="button" class="button ghost compact" data-label-by-volume title="Ułóż książki rosnąco według numerów tomów">Ułóż według tomów</button>' : ''}<button type="button" class="button ghost compact" data-label-market-toggle aria-pressed="${market ? 'true' : 'false'}" title="Najtańsze oferty i luki w numeracji">${market ? 'Ukryj rynek' : 'Rynek'}</button><button type="button" class="button ghost compact" data-label-delete>Usuń etykietę</button></span></div><form class="label-form" data-label-rename-form hidden><label class="field"><span>Nazwa etykiety</span><input name="name" maxlength="60" required value="${name}"></label><button type="submit" class="button primary compact">Zapisz</button><button type="button" class="button ghost compact" data-label-rename-cancel>Anuluj</button></form><div class="label-add"><label class="field"><span>Dodaj książkę do etykiety</span><input type="search" data-label-search placeholder="Szukaj: tytuł, autor lub ISBN" autocomplete="off"></label><ul class="label-add-results" data-label-results aria-live="polite"></ul></div>${
    works.length
      ? `<details class="label-books-folded" data-label-books-details${listOpen ? ' open' : ''}><summary>Książki i numery tomów (${works.length})</summary>${booksMarkup(data, escapeHtml, closedGroups)}</details>`
      : '<p class="inline-note">Ta etykieta jest pusta. Wyszukaj książkę powyżej i dodaj ją; kolejne trafiają na koniec.</p>'
  }${groupFormMarkup()}${market ? marketMarkup(market, escapeHtml) : ''}`;
}

/** A found book in the add-search. Pure (tested). */
export function candidateMarkup(work, inLabel, escapeHtml) {
  return `<li><span>${escapeHtml(work.title)}${(work.authors || []).length ? ` <small>${escapeHtml(work.authors.join(', '))}</small>` : ''}</span>${inLabel ? '<small>już w tej etykiecie</small>' : `<button type="button" class="button secondary compact" data-label-add="${escapeHtml(work.id)}">Dodaj</button>`}</li>`;
}

export function createLabelCollections({ json, toast, escapeHtml, openBook, arrange = () => {} }) {
  let open = null; // the name of the label that is open, or null for the list
  let loadedAt = 0;
  let data = null;
  let listOpen = false; // the folded list of books is open
  const closedGroups = new Set(); // sub-labels the owner folded (ids; only the view remembers)
  let market = null; // the answer of /market while „Rynek” is open, { error } when it failed
  let marketOf = null; // the label the panel was opened for
  let view = null; // { list } of the current render
  const write = (url, method, body) =>
    json(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const refreshLists = () => void fillNameLists({ json, escapeHtml });
  const fail = (what, error) => toast(`${what}: ${error.message}`);

  const renders = createLatest(); // an older answer never overwrites a newer render

  async function render(list, { background = false } = {}) {
    view = { list };
    const editing = list.querySelector('form:not([hidden]), .label-book input:focus, [data-label-search]:focus, .label-add-results li');
    if (background && list.querySelector('.label-root') && (editing || Date.now() - loadedAt < 10000)) return;
    const request = renders.next();
    const keep = list.querySelector('.label-root') ? null : '<p class="inline-note">Wczytuję etykiety…</p>';
    if (keep) list.innerHTML = keep;
    try {
      if (open) {
        try {
          data = await json(`/api/catalog/labels/${enc(open)}/works`);
        } catch (error) {
          if (error.message !== 'LABEL_NOT_FOUND') throw error;
          open = null;
        }
      }
      if (open && market && marketOf === open) {
        try {
          market = await json(`/api/catalog/labels/${enc(open)}/market`);
        } catch (error) {
          market = { error: error.message };
        }
      } else market = null;
      const labels = open ? null : await json('/api/catalog/labels');
      if (!renders.isCurrent(request) || document.body.dataset.catalogView !== 'labels') return;
      loadedAt = Date.now();
      const needle = document.querySelector('#catalogSearch')?.value.trim().toLocaleLowerCase('pl') || '';
      list.innerHTML = `<div class="label-root">${
        open
          ? collectionMarkup(data, escapeHtml, market, { listOpen, closedGroups })
          : collectionsMarkup(
              labels.items.filter((item) => !needle || item.label.toLocaleLowerCase('pl').includes(needle)).sort((a, b) => a.label.localeCompare(b.label, 'pl')),
              escapeHtml,
            )
      }</div>`;
      wire(list);
    } catch (error) {
      if (!renders.isCurrent(request)) return;
      list.innerHTML = `<p class="inline-note">Nie udało się odczytać etykiet: ${escapeHtml(error.message)}</p>`;
    }
  }
  const redraw = () => view && render(view.list);
  const base = () => `/api/catalog/labels/${enc(open)}`;

  async function save(ids) {
    try {
      data = await write(`${base()}/order`, 'PUT', { workIds: ids });
      await redraw();
    } catch (error) {
      fail('Nie zapisano kolejności', error);
    }
  }

  function wire(list) {
    const show = (selector) => list.querySelector(selector);
    // --- list ---
    const form = show('[data-label-form]');
    show('[data-label-new]')?.addEventListener('click', () => {
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('input').focus();
    });
    show('[data-label-cancel]')?.addEventListener('click', () => (form.hidden = true));
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = form.querySelector('input').value.trim();
      try {
        const made = await write('/api/catalog/labels', 'POST', { name });
        toast(`Utworzono etykietę „${made.label}”.`);
        open = made.label;
        refreshLists();
        await redraw();
        show('[data-label-search]')?.focus();
      } catch (error) {
        fail(error.message === 'LABEL_EXISTS' ? 'Taka etykieta już istnieje' : 'Nie utworzono etykiety', error);
      }
    });
    list.querySelectorAll('[data-label-open]').forEach((button) =>
      button.addEventListener('click', () => {
        open = button.dataset.labelOpen;
        listOpen = false;
        void redraw();
      }),
    );
    // The order is arranged on the covers: the catalogue opens in „Okładki” with this label.
    list.querySelectorAll('[data-label-arrange]').forEach((button) => button.addEventListener('click', () => arrange(button.dataset.labelArrange)));
    if (!open) return;
    // --- inside a label ---
    show('[data-label-back]').addEventListener('click', () => {
      open = null;
      void redraw();
    });
    const ids = () => data.works.map((work) => work.id);
    list.querySelectorAll('[data-label-book]').forEach((button) => button.addEventListener('click', () => openBook(button.dataset.labelBook)));
    show('[data-label-books-details]')?.addEventListener('toggle', (event) => (listOpen = event.currentTarget.open));
    // Sub-labels: create, rename, delete, move a book; folding is remembered while the view lives.
    list.querySelectorAll('details[data-label-group-section]').forEach((details) =>
      details.addEventListener('toggle', () => {
        const id = Number(details.dataset.labelGroupSection);
        if (details.open) closedGroups.delete(id);
        else closedGroups.add(id);
      }),
    );
    show('[data-label-group-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await write(`${base()}/groups`, 'POST', { name: event.currentTarget.querySelector('input').value.trim() });
        listOpen = true;
        await redraw();
      } catch (error) {
        fail(error.message === 'GROUP_EXISTS' ? 'Taka podetykieta już istnieje' : 'Nie dodano podetykiety', error);
      }
    });
    const renameGroupForm = show('[data-label-group-rename-form]');
    let renaming = null; // id of the sub-label being renamed
    list.querySelectorAll('[data-label-group-rename]').forEach((button) =>
      button.addEventListener('click', (event) => {
        event.preventDefault();
        renaming = button.dataset.labelGroupRename;
        renameGroupForm.hidden = false;
        const input = renameGroupForm.querySelector('input');
        input.value = data.groups.find((group) => String(group.id) === renaming)?.name ?? '';
        input.focus();
      }),
    );
    show('[data-label-group-rename-cancel]')?.addEventListener('click', () => (renameGroupForm.hidden = true));
    renameGroupForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await write(`${base()}/groups/${renaming}`, 'PUT', { name: renameGroupForm.querySelector('input').value.trim() });
        listOpen = true;
        await redraw();
      } catch (error) {
        fail(error.message === 'GROUP_EXISTS' ? 'Taka podetykieta już istnieje' : 'Nie zmieniono nazwy', error);
      }
    });
    list.querySelectorAll('[data-label-group-delete]').forEach((button) =>
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const id = button.dataset.labelGroupDelete;
        const ok = await confirmDialog('Jej książki wrócą na główną listę etykiety, żadna książka nie zostanie usunięta.', { title: 'Usunąć podetykietę?', confirmLabel: 'Usuń podetykietę', danger: true });
        if (!ok) return;
        try {
          await write(`${base()}/groups/${id}`, 'DELETE');
          await redraw();
        } catch (error) {
          fail('Nie usunięto podetykiety', error);
        }
      }),
    );
    list.querySelectorAll('[data-label-assign]').forEach((select) =>
      select.addEventListener('change', async () => {
        try {
          await write(`${base()}/assign`, 'PUT', { workIds: [select.dataset.labelAssign], groupId: select.value === '' ? null : Number(select.value) });
          await redraw();
        } catch (error) {
          fail('Nie przeniesiono książki', error);
        }
      }),
    );
    show('[data-label-market-toggle]').addEventListener('click', () => {
      market = market ? null : { books: [] };
      marketOf = open;
      void redraw();
    });
    show('[data-label-scan-missing]')?.addEventListener('click', () => {
      const field = document.querySelector('#queries');
      if (!field) return;
      const ok = fillScanQueries({ input: field, note: document.querySelector('#scanSeriesNote'), toast }, open, labelPhrases(missingBooks(data.works, market.books)), 'Tylko książki bez oferty.');
      if (ok) toast('Frazy czekają w polu skanu (zakładka Skanuj). Skan uruchomisz sam.');
    });
    show('[data-label-target-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const grosze = zlotyToGrosze(event.currentTarget.querySelector('input').value);
      if (!grosze) return toast('Podaj cenę w złotych.');
      const ok = await confirmDialog(`Każda książka etykiety dostanie cel „Kupuję do ${moneyFromZloty(grosze / 100)}”. Cele ustawione wcześniej na tych książkach zostaną zastąpione.`, { title: 'Ustawić cel dla całej etykiety?', confirmLabel: 'Ustaw' });
      if (!ok) return;
      try {
        const result = await write(`${base()}/target`, 'PUT', { maxPrice: grosze });
        toast(`Ustawiono cel ${money(result.maxPrice)} dla książek: ${result.works}.`);
        await redraw();
      } catch (error) {
        fail(error.message === 'INVALID_TARGET_PRICE' ? 'Cena poza zakresem (do 9 999 zł)' : 'Nie ustawiono celu', error);
      }
    });
    show('[data-label-by-volume]')?.addEventListener('click', () => void save(idsByVolume(data.works)));
    list.querySelectorAll('[data-label-volume]').forEach((input) =>
      input.addEventListener('change', async () => {
        const id = input.dataset.labelVolume;
        try {
          const result = await write(`${base()}/works/${enc(id)}`, 'PUT', { volume: input.value === '' ? null : Number(input.value) });
          data.works.find((work) => work.id === id).volume = result.volume;
          toast(result.volume ? `Zapisano numer tomu: ${result.volume}.` : 'Usunięto numer tomu.');
        } catch (error) {
          fail('Nie zapisano numeru tomu', error);
        }
      }),
    );
    list.querySelectorAll('[data-label-remove]').forEach((button) =>
      button.addEventListener('click', async () => {
        try {
          await write(`${base()}/works/${enc(button.dataset.labelRemove)}`, 'DELETE');
          toast('Usunięto z etykiety. Książka zostaje w katalogu.');
          refreshLists();
          await redraw();
        } catch (error) {
          fail('Nie usunięto z etykiety', error);
        }
      }),
    );
    // Rename (a name that exists asks to merge).
    const rename = show('[data-label-rename-form]');
    show('[data-label-rename]').addEventListener('click', () => {
      rename.hidden = !rename.hidden;
      if (!rename.hidden) rename.querySelector('input').focus();
    });
    show('[data-label-rename-cancel]').addEventListener('click', () => (rename.hidden = true));
    rename.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = rename.querySelector('input').value.trim();
      const put = (merge) => write(base(), 'PUT', { name, merge });
      try {
        let result;
        try {
          result = await put(false);
        } catch (error) {
          if (error.message !== 'LABEL_EXISTS') throw error;
          const ok = await confirmDialog(`Etykieta „${name}” już istnieje. Książki z „${open}” zostaną dopisane na koniec tamtej, a „${open}” zniknie.`, { title: 'Scalić etykiety?', confirmLabel: 'Scal' });
          if (!ok) return;
          result = await put(true);
        }
        toast(result.merged ? `Scalono w „${result.label}”.` : `Zmieniono nazwę na „${result.label}”.`);
        open = result.label;
        refreshLists();
        await redraw();
      } catch (error) {
        fail('Nie zmieniono nazwy', error);
      }
    });
    show('[data-label-delete]').addEventListener('click', async () => {
      const ok = await confirmDialog('Książki zostaną w katalogu, tylko stracą tę etykietę.', { title: `Usunąć etykietę „${open}”?`, confirmLabel: 'Usuń etykietę', danger: true });
      if (!ok) return;
      try {
        await write(base(), 'DELETE');
        toast(`Usunięto etykietę „${open}”.`);
        open = null;
        refreshLists();
        await redraw();
      } catch (error) {
        fail('Nie usunięto etykiety', error);
      }
    });
    // Add a book: search the catalogue; a found book goes to the end.
    const search = show('[data-label-search]');
    const results = show('[data-label-results]');
    let timer = null;
    const find = async () => {
      const query = search.value.trim();
      if (query.length < 2) {
        results.innerHTML = '';
        return;
      }
      try {
        const found = await json('/api/catalog/works?' + new URLSearchParams({ query, limit: '10' }));
        const have = new Set(ids());
        results.innerHTML = found.items.length ? found.items.map((work) => candidateMarkup(work, have.has(work.id), escapeHtml)).join('') : '<li class="inline-note">Nic nie znaleziono.</li>';
        results.querySelectorAll('[data-label-add]').forEach((add) =>
          add.addEventListener('click', async () => {
            try {
              await write(`${base()}/works`, 'POST', { workIds: [add.dataset.labelAdd] });
              toast('Dodano na koniec etykiety.');
              refreshLists();
              await redraw();
              show('[data-label-search]')?.focus();
            } catch (error) {
              fail(error.message === 'TOO_MANY_LABELS' ? 'Ta książka ma już 20 etykiet' : 'Nie dodano', error);
            }
          }),
        );
      } catch (error) {
        results.innerHTML = `<li class="inline-note">Nie udało się wyszukać: ${escapeHtml(error.message)}</li>`;
      }
    };
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(find, 250);
    });
  }

  return { render };
}
