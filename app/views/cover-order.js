// Katalog → „Okładki” with a label filter: the covers stand in the owner's order of that label
// (label-collections.mjs, sort=label) and can be swapped by dragging one onto another, with the
// Ctrl+←/→ keys on a focused cover, or with the ← → buttons (the only way on a phone). The save goes
// through the label order route; the list changes at once and returns on an error. Organisation only.
import { NO_LABEL } from './labels.js';
import { tidyWorkTitle } from '../core/bibliography.js';
import { escapeHtml } from '../core/formatters.js';

const enc = encodeURIComponent;
const NARROWING = ['query', 'author', 'language', 'publisher', 'year', 'binding', 'gap'];

/** The ids with the places of `a` and `b` swapped; unchanged when either is missing or they are one. Pure (tested). */
export function swapped(ids, a, b) {
  const from = ids.indexOf(a);
  const to = ids.indexOf(b);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** The id next to `id` (`delta` -1 or 1), or null at the ends. Pure (tested). */
export function neighbour(ids, id, delta) {
  const at = ids.indexOf(id);
  if (at < 0) return null;
  return ids[at + delta] ?? null;
}

/** `ids` with `id` moved to stand just before `target`; unchanged when either is missing or they are one. Pure (tested). */
export function movedBefore(ids, id, target) {
  if (id === target || !ids.includes(id) || !ids.includes(target)) return ids;
  const rest = ids.filter((other) => other !== id);
  rest.splice(rest.indexOf(target), 0, id);
  return rest;
}

/** `ids` with `id` moved to stand just after `anchor`; unchanged when either is missing or they are one. Pure (tested). */
export function movedAfter(ids, id, anchor) {
  if (id === anchor || !ids.includes(id) || !ids.includes(anchor)) return ids;
  const rest = ids.filter((other) => other !== id);
  rest.splice(rest.indexOf(anchor) + 1, 0, id);
  return rest;
}

/**
 * The sections of the covers view: „Bez podetykiety” first, then one per sub-label in the list-view order.
 * Each keeps the one global order of `ids`; an unknown group counts as none. Pure (tested).
 * @returns {{ key: string, groupId: number|null, name: string, ids: string[] }[]}
 */
export function coverSections(groups, groupOf, ids) {
  const known = new Set(groups.map((group) => group.id));
  const of = (id) => (known.has(groupOf(id)) ? groupOf(id) : null);
  return [
    { key: 'none', groupId: null, name: 'Bez podetykiety', ids: ids.filter((id) => of(id) === null) },
    ...groups.map((group) => ({ key: String(group.id), groupId: group.id, name: group.name, ids: ids.filter((id) => of(id) === group.id) })),
  ];
}

/** The sections as markup; `cover(id)` gives the markup of one cover. An empty section is a drop zone. Pure (tested). */
export function coverSectionsMarkup(sections, cover, escapeHtml) {
  return sections
    .map(
      (section) =>
        `<section class="cover-section" data-cover-group="${section.key}" aria-label="Podetykieta: ${escapeHtml(section.name)}"><h4 class="cover-section-title">${escapeHtml(section.name)} <span>(${section.ids.length})</span></h4><div class="cover-section-grid">${section.ids.length ? section.ids.map(cover).join('') : '<p class="cover-drop-hint">Upuść tu okładkę</p>'}</div></section>`,
    )
    .join('');
}

const MESSAGES = {
  noLabel: 'Aby zmieniać kolejność przeciąganiem, wybierz etykietę w filtrach katalogu.',
  sort: 'Przeciąganie działa w kolejności etykiety: wybierz sortowanie „Kolejność etykiety (tomy)”.',
  narrowed: 'Przeciąganie działa tylko bez wyszukiwania i innych filtrów, gdy widać całą etykietę.',
  single: 'Ta etykieta ma jedną książkę, nie ma czego układać.',
};

/**
 * Whether the covers can be rearranged and what to tell the owner when not. `filters` are the filters
 * of the loaded list. Pure (tested).
 * @returns {{ show: boolean, enabled: boolean, label: string, message: string }}
 */
export function coverOrderStatus({ view, filters, loaded, total, incompleteOnly = false }) {
  const off = (message) => ({ show: true, enabled: false, label: '', message });
  if (view !== 'grid') return { show: false, enabled: false, label: '', message: '' };
  const label = String(filters?.label || '').trim();
  if (!label || label === NO_LABEL) return off(MESSAGES.noLabel);
  if (filters.sort !== 'label') return off(MESSAGES.sort);
  if (NARROWING.some((key) => filters[key]) || incompleteOnly || loaded !== total) return off(MESSAGES.narrowed);
  if (loaded < 1) return { show: false, enabled: false, label: '', message: '' };
  if (loaded < 2) return off(MESSAGES.single);
  return {
    show: true,
    enabled: true,
    label,
    message: `Kolejność etykiety „${label}”: przeciągnij okładkę na inną lub użyj przycisków ←/→ (klawiatura: Ctrl+←/→), aby zamienić je miejscami.`,
  };
}

/** The place badge and the ← → buttons of one cover. Pure (tested). */
export function coverOrderMarkup({ id, title, place, count, groups = [], groupId = null, first = place === 1, last = place === count }, escapeHtml) {
  const key = escapeHtml(id);
  const name = escapeHtml(title);
  const button = (delta, arrow, word, blocked) =>
    `<button type="button" class="cover-move" data-cover-move="${delta}" data-cover-id="${key}" aria-label="Przesuń ${word}: ${name} (miejsce ${place} z ${count})" title="Zamień miejscami z sąsiednią okładką"${blocked ? ' disabled' : ''}>${arrow}</button>`;
  // With sub-labels every cover also has a select, the way to move it without dragging (keyboard, phone).
  const pick = groups.length
    ? `<select class="cover-group-pick" data-cover-group-pick data-cover-id="${key}" aria-label="Przenieś do podetykiety: ${name}" title="Przenieś do podetykiety"><option value="">Bez podetykiety</option>${groups.map((group) => `<option value="${group.id}"${group.id === groupId ? ' selected' : ''}>${escapeHtml(group.name)}</option>`).join('')}</select>`
    : '';
  return `<span class="cover-place" title="Miejsce w kolejności etykiety: ${place} z ${count}"><span class="sr-only">Miejsce </span>${place}</span><span class="cover-order-buttons">${button(-1, '←', 'w lewo', first)}${button(1, '→', 'w prawo', last)}</span>${pick}`;
}

/** Wires the covers list once (delegated events); `render` redraws it, `reload` reads it again from the server. */
export function createCoverOrder({ state, $, json, toast, render, reload }) {
  const list = $('#catalogList');
  const note = $('#catalogOrderNote');
  const live = $('#catalogOrderLive');
  let queue = Promise.resolve();
  let dragged = null;
  let info = null; // { label, groups, of: Map(workId → groupId|null) } of the open label, read from the label route
  let fetching = null; // the label whose sub-labels are being read
  let generation = 0; // raised by a failed save: saves queued before it are dropped (they were built on the failed state)
  let pending = 0; // saves queued or running
  let stale = false; // a failed save wants one reload once the queue is drained
  let redraw = false; // a redraw was asked for during a drag

  /** Redraws the list, but never in the middle of a drag (the dragged node would vanish and dragend might not fire). */
  function draw() {
    if (dragged !== null) {
      redraw = true;
      return;
    }
    redraw = false;
    render();
  }

  /** Drops what is known of the sub-labels; the next redraw reads them again from the server. */
  function forget() {
    info = null;
    fetching = null;
  }
  function loadGroups(label) {
    if (info?.label === label || fetching === label) return;
    fetching = label;
    json(`/api/catalog/labels/${enc(label)}/works`)
      .then((data) => {
        if (fetching !== label) return;
        fetching = null;
        info = { label, groups: data.groups || [], of: new Map((data.works || []).map((work) => [work.id, work.groupId ?? null])) };
        if (info.groups.length) draw();
      })
      .catch(() => {
        if (fetching === label) {
          fetching = null;
          info = { label, groups: [], of: new Map() };
        }
      });
  }
  const sectioned = () => Boolean(info && info.label === status().label && info.groups.length);
  const groupOf = (id) => (info?.groups.some((group) => group.id === info.of.get(id)) ? info.of.get(id) : null);
  const groupName = (groupId) => (groupId === null ? 'Bez podetykiety' : info.groups.find((group) => group.id === groupId)?.name || '');

  const status = () =>
    coverOrderStatus({
      view: document.body.dataset.catalogView,
      filters: state.catalogPages.works.filters,
      loaded: state.catalogWorks.length,
      total: state.catalogPages.works.total,
      incompleteOnly: Boolean($('#catalogIncompleteOnly')?.checked),
    });
  const ids = () => state.catalogWorks.map((work) => work.id);
  const titleOf = (id) => tidyWorkTitle(state.catalogWorks.find((work) => work.id === id)?.title || '');

  /** Shows or hides the explanation line above the covers; returns the status. */
  function sync() {
    const result = status();
    if (result.enabled) loadGroups(result.label);
    if (note) {
      note.hidden = !result.show;
      note.textContent = result.message + (result.enabled && sectioned() ? ' Okładka upuszczona w innej sekcji trafia do tej podetykiety (albo wybierz ją na liście na okładce).' : '');
    }
    return result;
  }

  /**
   * The markup of the covers: plain, or in sections when the label has sub-labels. `visible` are the rows
   * to show, `all` all of the label (places count in the one global order); `rowMarkup(row, order)` is one cover.
   */
  function coversHtml(visible, all, rowMarkup) {
    const place = new Map(all.map((row, index) => [row.id, index + 1]));
    const base = (row) => ({ place: place.get(row.id), count: all.length });
    if (!sectioned()) return visible.map((row) => rowMarkup(row, base(row))).join('');
    const byId = new Map(visible.map((row) => [row.id, row]));
    const sections = coverSections(info.groups, groupOf, visible.map((row) => row.id));
    const sectionOf = new Map(sections.flatMap((section) => section.ids.map((id) => [id, section])));
    const cover = (id) => {
      const section = sectionOf.get(id);
      const at = section.ids.indexOf(id);
      return rowMarkup(byId.get(id), { ...base(byId.get(id)), groups: info.groups, groupId: section.groupId, first: at === 0, last: at === section.ids.length - 1 });
    };
    return coverSectionsMarkup(sections, cover, escapeHtml);
  }

  function announce(message) {
    if (!live) return;
    live.textContent = '';
    setTimeout(() => (live.textContent = message), 30);
  }

  /**
   * Puts the list in `next` order at once and saves it; the returned promise rejects after the list was restored.
   * `move` = { id, from, to } also puts that cover into the sub-label `to` (saved before the order).
   */
  function apply(next, label, move = null) {
    const before = state.catalogWorks;
    const byId = new Map(before.map((work) => [work.id, work]));
    const after = next.map((id) => byId.get(id));
    if (after.some((work) => !work)) return Promise.resolve();
    const reordered = next.some((id, index) => id !== before[index]?.id);
    state.catalogWorks = after;
    if (move) info?.of.set(move.id, move.to);
    draw();
    const mine = generation;
    pending += 1;
    queue = queue.then(async () => {
      try {
        if (mine !== generation) throw new Error('Pominięto, bo poprzedni zapis się nie udał.');
        const put = (path, method, body) => json(`/api/catalog/labels/${enc(label)}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (move) await put('assign', 'PUT', { workIds: [move.id], groupId: move.to });
        if (reordered) await put('order', 'PUT', { workIds: next });
      } catch (error) {
        if (mine === generation) {
          generation += 1; // later queued saves are dropped; the list goes back to the state before this one
          if (move) forget(); // the server may hold half of the change: read both again
          state.catalogWorks = before;
          draw();
          stale = true;
        }
        throw error;
      } finally {
        pending -= 1;
        if (pending === 0 && stale) {
          stale = false;
          reload(); // read the server state only after the queue is drained
        }
      }
    });
    const result = queue;
    queue = queue.catch(() => {});
    return result;
  }

  function dropToast(message, undo) {
    document.querySelectorAll('#toastRegion .toast[data-cover-order]').forEach((node) => node.remove());
    toast(message, { label: 'Cofnij', onClick: undo, onError: (error) => toast(`Nie cofnięto: ${error.message}`) });
    const node = $('#toastRegion')?.lastElementChild;
    if (node) node.dataset.coverOrder = '1';
  }

  /** Swaps cover `id` with `other` (optimistic); `focus` restores the focus afterwards. */
  async function swap(id, other, focus = null) {
    const now = status();
    if (!now.enabled || !other || other === id) return;
    const before = ids();
    const next = swapped(before, id, other);
    if (next === before) return;
    const place = next.indexOf(id) + 1;
    const names = `„${titleOf(id)}” i „${titleOf(other)}”`;
    try {
      await apply(next, now.label);
    } catch (error) {
      toast(`Nie zapisano kolejności: ${error.message}`);
      announce('Nie zapisano kolejności, przywrócono poprzednią.');
      return;
    }
    announce(`Zamieniono ${names}. „${titleOf(id)}” jest teraz na miejscu ${place} z ${next.length}.`);
    dropToast(`Zamieniono miejscami ${names}.`, async () => {
      await apply(before, now.label);
      announce('Cofnięto zamianę.');
    });
    if (focus) restoreFocus(id, focus);
  }

  /** Moves cover `id` into the sub-label `groupId` (null = none): just before `before` when dropped on a cover, else after the last cover of that section. */
  async function moveToGroup(id, groupId, { before = null, focus = null } = {}) {
    const now = status();
    if (!now.enabled || !sectioned() || (groupOf(id) === groupId && !before)) return;
    const from = groupOf(id);
    const old = ids();
    let next = old;
    if (before) next = movedBefore(old, id, before);
    else {
      const last = old.filter((other) => other !== id && groupOf(other) === groupId).at(-1);
      if (last) next = movedAfter(old, id, last);
    }
    const where = groupName(groupId);
    try {
      await apply(next, now.label, { id, from, to: groupId });
    } catch (error) {
      toast(`Nie przeniesiono okładki: ${error.message}`);
      announce('Nie przeniesiono okładki, przywrócono poprzedni układ.');
      return;
    }
    announce(`„${titleOf(id)}” jest teraz w podetykiecie „${where}”.`);
    dropToast(`Przeniesiono „${titleOf(id)}” do: ${where}.`, async () => {
      await apply(old, now.label, { id, from: groupId, to: from });
      announce('Cofnięto przeniesienie.');
    });
    if (focus) restoreFocus(id, focus);
  }

  function restoreFocus(id, focus) {
    const own = [...list.querySelectorAll('[data-cover-move]')].filter((button) => button.dataset.coverId === id && !button.disabled);
    const row = [...list.querySelectorAll('[data-catalog-id]')].find((button) => button.dataset.catalogId === id);
    const pick = [...list.querySelectorAll('[data-cover-group-pick]')].find((select) => select.dataset.coverId === id);
    if (focus.stay) {
      // Moved with its list: the page stays where the owner was; focus goes to the cover that took its place.
      const near = [...list.querySelectorAll('[data-catalog-id]')].find((button) => button.dataset.catalogId === focus.next);
      near?.focus({ preventScroll: true });
      window.scrollTo({ top: focus.scrollY, behavior: 'instant' });
      return;
    }
    const target = focus.pick ? pick || row : focus.row ? row : own.find((button) => button.dataset.coverMove === String(focus.delta)) || own[0] || row;
    target?.focus();
  }

  const wrapOf = (target) => target.closest?.('[data-cover-wrap]');
  const sectionOf = (target) => target.closest?.('[data-cover-group]');
  const sectionGroup = (section) => (section.dataset.coverGroup === 'none' ? null : Number(section.dataset.coverGroup));
  const clearTargets = () => list.querySelectorAll('.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
  /** The neighbour of a cover in its own section (the whole list without sub-labels). */
  const sibling = (id, delta) => neighbour(sectioned() ? ids().filter((other) => groupOf(other) === groupOf(id)) : ids(), id, delta);

  list.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-cover-move]');
    if (!button) return;
    const delta = Number(button.dataset.coverMove);
    void swap(button.dataset.coverId, sibling(button.dataset.coverId, delta), { delta });
  });
  list.addEventListener('change', (event) => {
    const select = event.target.closest?.('[data-cover-group-pick]');
    if (!select) return;
    const id = select.dataset.coverId;
    // The cover leaves for another section, the view does not follow it (stays at the same scroll).
    const next = sibling(id, 1) || sibling(id, -1);
    void moveToGroup(id, select.value === '' ? null : Number(select.value), { focus: { stay: true, next, scrollY: window.scrollY } });
  });
  // Precaution: a press on a <select> inside a draggable element can start a drag gesture in some
  // browsers, so the cover stops being draggable while its sub-label list is in use.
  const pickOf = (target) => target.closest?.('[data-cover-group-pick]');
  const holdDrag = (event) => {
    const wrap = pickOf(event.target) && wrapOf(event.target);
    if (wrap) wrap.draggable = false;
  };
  list.addEventListener('pointerdown', holdDrag);
  list.addEventListener('focusin', holdDrag);
  list.addEventListener('focusout', (event) => {
    const wrap = pickOf(event.target) && wrapOf(event.target);
    if (wrap) wrap.draggable = true;
  });
  list.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || event.altKey || event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const wrap = wrapOf(event.target);
    if (!wrap || !status().enabled) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -1 : 1;
    const id = wrap.dataset.coverWrap;
    const other = sibling(id, delta);
    if (!other) announce(delta < 0 ? 'Pierwsza okładka w podetykiecie.' : 'Ostatnia okładka w podetykiecie.');
    else void swap(id, other, { row: true });
  });
  list.addEventListener('dragstart', (event) => {
    const wrap = wrapOf(event.target);
    if (!wrap || !status().enabled) return;
    dragged = wrap.dataset.coverWrap;
    wrap.classList.add('is-dragged');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged);
  });
  list.addEventListener('dragover', (event) => {
    const wrap = wrapOf(event.target);
    const section = sectionOf(event.target);
    if (!dragged || !(wrap || section)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    // A cover is the target when over one; otherwise (a gap, an empty section) the section is.
    const target = wrap ?? section;
    if (target.classList.contains('is-drop-target') || target.dataset.coverWrap === dragged) return;
    clearTargets();
    target.classList.add('is-drop-target');
  });
  list.addEventListener('drop', (event) => {
    const wrap = wrapOf(event.target);
    const section = sectionOf(event.target);
    if (!dragged || !(wrap || section)) return;
    event.preventDefault();
    const id = dragged;
    dragged = null;
    clearTargets();
    if (wrap) {
      const target = wrap.dataset.coverWrap;
      if (!sectioned() || groupOf(target) === groupOf(id)) void swap(id, target);
      else void moveToGroup(id, groupOf(target), { before: target });
    } else void moveToGroup(id, sectionGroup(section));
  });
  list.addEventListener('dragend', () => {
    dragged = null;
    clearTargets();
    list.querySelectorAll('.is-dragged').forEach((node) => node.classList.remove('is-dragged'));
    if (redraw) draw();
  });

  return { status, sync, forget, coversHtml };
}
