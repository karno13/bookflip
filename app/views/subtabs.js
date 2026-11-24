// Tab bar of the active navigation group (Okazje: Okazje / Paczki / Kupuję do / Indeks rynku / Snajper;
// Książki: Książki / Oferty; Skan: Źródła / Frazy). One shared bar sits under the heading of the
// shown section; the sections themselves stay where they are. Groups with one tab show no bar, and
// Kolejka keeps its own bar (queue.js). Model and order: core/nav-groups.js.
import { groupById, groupOf } from '../core/nav-groups.js';

export function installSubtabs({ $, escapeHtml, onSelect }) {
  const bar = document.createElement('nav');
  bar.className = 'subtabs rv-tabs';
  bar.id = 'subTabs';
  bar.setAttribute('aria-label', 'Podwidoki');

  /** Shows the bar for `view` with `tabId` pressed, or hides it when the group has nothing to choose. */
  function attach(view, tabId) {
    const group = groupById(groupOf(view));
    if (!group || group.ownBar || group.tabs.length < 2) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.setAttribute('aria-label', 'Podwidoki: ' + group.label);
    bar.innerHTML = group.tabs
      .map((tab) => `<button type="button" class="rv-tab${tab.id === tabId ? ' is-active' : ''}" data-subtab="${escapeHtml(tab.id)}" aria-pressed="${tab.id === tabId}"${tab.hint ? ` title="${escapeHtml(tab.hint)}"` : ''}>${escapeHtml(tab.label)}</button>`)
      .join('');
    const section = $('#view-' + view);
    const heading = section.querySelector(':scope > .view-heading');
    if (heading) heading.after(bar);
    else section.prepend(bar);
  }

  bar.addEventListener('click', (event) => {
    const id = event.target.closest('[data-subtab]')?.dataset.subtab;
    if (id) onSelect(id);
  });
  // Arrow keys move between tabs; Tab still leaves the bar.
  bar.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const buttons = [...bar.querySelectorAll('button')];
    const next = buttons[buttons.indexOf(document.activeElement) + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  });

  return { attach };
}
