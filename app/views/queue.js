// "Kolejka": everything that waits for the operator, in one view with type tabs — review decisions,
// sets to complete, suspect title assignments and possible duplicate works. The existing screens
// are embedded as they are (review and sets keep their sections, the two catalogue checks move into
// #view-checks); the tab bar sits on top of whichever is shown. Shortcuts are the same everywhere:
// ↑/↓ (or K/J) move, Enter takes the proposed action, X dismisses, S skips.
export const QUEUE_TYPES = [
  { id: 'review', label: 'Weryfikacja', view: 'review', hint: 'Oferty bez pewnego przypisania do katalogu' },
  { id: 'sets', label: 'Zestawy', view: 'sets', hint: 'Zestawy, których skład nie jest potwierdzony' },
  { id: 'conflicts', label: 'Podejrzane przypisania', view: 'checks', hint: 'Oferta przypisana po ISBN, ale tytuł nie pasuje do wydania' },
  { id: 'duplicates', label: 'Możliwe duplikaty', view: 'checks', hint: 'Dzieła o tym samym tytule i autorze' },
];
export const QUEUE_VIEWS = ['review', 'sets', 'checks'];

/** The queue type a view shows (checks: the type the operator picked, conflicts by default). */
export function queueTypeOf(view, checksType = 'conflicts') {
  if (view === 'checks') return checksType === 'duplicates' ? 'duplicates' : 'conflicts';
  return QUEUE_TYPES.some((type) => type.id === view) ? view : null;
}

/** Counts from /api/queue/summary for each tab (sets: not yet confirmed). */
export function queueCounts(summary = {}) {
  return {
    review: summary.review ?? null,
    sets: summary.sets ?? null,
    conflicts: summary.conflicts ?? null,
    duplicates: summary.duplicates ?? null,
  };
}

/**
 * Keyboard of a list of rows (checks): which row is current after a key, and what to press.
 * Returns { index, press } — press is 'primary' | 'dismiss' | null.
 */
export function rowKeyAction(key, index, length) {
  if (!length) return { index: -1, press: null };
  const current = index < 0 ? 0 : Math.min(index, length - 1);
  if (['ArrowDown', 'j', 's'].includes(key)) return { index: Math.min(length - 1, current + (index < 0 ? 0 : 1)), press: null };
  if (['ArrowUp', 'k'].includes(key)) return { index: Math.max(0, current - 1), press: null };
  if (key === 'Enter') return { index: current, press: 'primary' };
  if (key === 'x') return { index: current, press: 'dismiss' };
  return { index, press: null };
}

/**
 * Queue-wide shortcuts that need no DOM: '?' opens the shortcut help, 'U' presses the "Cofnij" of
 * the last toast. Neither decides anything about an offer. Blocked while typing, with a dialog open
 * or with Ctrl/Meta/Alt held (browser and screen-reader combinations stay untouched).
 */
export function queueShortcutAction({ key, ctrlKey = false, metaKey = false, altKey = false, shiftKey = false }, { typing = false, dialogOpen = false } = {}) {
  if (typing || dialogOpen || ctrlKey || metaKey || altKey) return null;
  if (key === '?') return 'help';
  if (!shiftKey && (key === 'u' || key === 'U')) return 'undo';
  return null;
}

/**
 * The button 'U' presses: the newest toast button that says exactly "Cofnij" (toasts append, so
 * the last one is the latest). "Cofnij partię" and other labels are a different undo and stay out.
 * @param {{ textContent: string | null }[]} buttons in document order
 */
export function pickUndoButton(buttons) {
  return buttons.filter((button) => (button.textContent ?? '').trim() === 'Cofnij').at(-1) ?? null;
}

/** Rows of the shortcut help; the decision keys are listed as they already exist, none is new. */
export const QUEUE_SHORTCUT_HELP = [
  ['↑ ↓ lub K J', 'poprzednia / następna pozycja'],
  ['Enter', 'akcja proponowana na pozycji (w Weryfikacji zatwierdza propozycję)'],
  ['X', 'odrzuć / nie interesuje mnie'],
  ['S', 'pomiń'],
  ['1–9', 'wybór propozycji w Weryfikacji'],
  ['U', 'cofnij ostatnią decyzję, gdy widać przycisk „Cofnij”'],
  ['?', 'ta pomoc'],
  ['Esc', 'zamknij pomoc'],
];

export function installQueue({ $, json, escapeHtml, showView, state }) {
  const bar = document.createElement('nav');
  bar.className = 'queue-types rv-tabs';
  bar.id = 'queueTypes';
  bar.setAttribute('aria-label', 'Rodzaje zaległości');
  let counts = queueCounts();
  state.checksType ||= 'conflicts';

  function render(active) {
    bar.innerHTML = QUEUE_TYPES.map((type) => {
      const count = counts[type.id];
      return `<button type="button" class="rv-tab${type.id === active ? ' is-active' : ''}" data-queue-type="${type.id}" aria-pressed="${type.id === active}" title="${escapeHtml(type.hint)}">${escapeHtml(type.label)}${count == null ? '' : ` <span>${count}</span>`}</button>`;
    }).join('') + '<small class="queue-keys" aria-hidden="true">↑↓ wybór · Enter akcja · X odrzuć · S pomiń · U cofnij · ? skróty</small>';
  }

  bar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-queue-type]');
    if (!button) return;
    const type = QUEUE_TYPES.find((item) => item.id === button.dataset.queueType);
    if (type.view === 'checks') state.checksType = type.id;
    state.queueType = type.id;
    showView(type.view);
  });

  /** Puts the tab bar on top of the shown queue section and shows the chosen check. */
  function attach(view) {
    if (!QUEUE_VIEWS.includes(view)) return;
    const active = queueTypeOf(view, state.checksType);
    state.queueType = active;
    render(active);
    const section = $('#view-' + view);
    const heading = section.querySelector(':scope > .view-heading');
    if (heading) heading.after(bar);
    else section.prepend(bar);
    if (view === 'checks') {
      section.dataset.type = active;
      const panel = $(active === 'duplicates' ? '#catalogDuplicates' : '#catalogConflicts');
      if (panel) {
        panel.hidden = false;
        // Opening loads the panel (its own toggle listener); open again re-reads it.
        if (!panel.open) panel.open = true;
        else panel.dispatchEvent(new Event('toggle'));
      }
    }
    void refreshCounts();
  }

  async function refreshCounts() {
    try {
      counts = queueCounts(await json('/api/queue/summary'));
      render(state.queueType);
    } catch {
      // Counts stay as they were; the lists themselves still work.
    }
  }

  // Shortcuts of the checks (review and sets have their own handlers with the same keys).
  let current = -1;
  document.addEventListener('keydown', (event) => {
    const section = $('#view-checks');
    if (!section || section.hidden || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (document.querySelector('dialog[open]') || event.target?.closest?.('input,select,textarea,[contenteditable="true"]')) return;
    const key = event.key.length === 1 ? event.key.toLocaleLowerCase('pl') : event.key;
    if (key === 'Enter' && event.target?.closest?.('button,a,summary')) return;
    const rows = [...section.querySelectorAll('details:not([hidden]) :is(.conflict-row, .duplicate-group)')].filter((row) => row.offsetParent);
    const { index, press } = rowKeyAction(key, current, rows.length);
    if (index === current && !press) return;
    event.preventDefault();
    current = index;
    rows.forEach((row, position) => row.classList.toggle('is-current', position === current));
    rows[current]?.scrollIntoView({ block: 'nearest' });
    if (!press) return;
    const row = rows[current];
    const button = press === 'primary'
      ? row?.querySelector('[data-action="review"], [data-merge-group]')
      : row?.querySelector('[data-action="confirm"]');
    if (button && !button.disabled) button.click();
  });

  // '?' help and 'U' undo, in every queue view (review and sets keep their own decision keys).
  let help = null;
  document.addEventListener('keydown', (event) => {
    if (!QUEUE_VIEWS.some((view) => { const section = $('#view-' + view); return section && !section.hidden; })) return;
    const action = queueShortcutAction(event, {
      typing: Boolean(event.target?.closest?.('input,select,textarea,[contenteditable="true"]')),
      dialogOpen: Boolean(document.querySelector('dialog[open]')),
    });
    if (!action) return;
    if (action === 'undo') {
      const undo = pickUndoButton([...document.querySelectorAll('#toastRegion .toast button:not(:disabled)')]);
      if (!undo) return;
      event.preventDefault();
      undo.click();
      return;
    }
    event.preventDefault();
    if (!help) {
      help = document.createElement('dialog');
      help.className = 'palette';
      help.setAttribute('aria-label', 'Skróty klawiaturowe kolejki');
      help.innerHTML = '<form method="dialog" class="palette-form"><div class="palette-results"><div class="palette-group">Skróty klawiaturowe kolejki</div>'
        + QUEUE_SHORTCUT_HELP.map(([keys, text]) => `<div class="palette-item"><span></span><span class="palette-copy"><b>${escapeHtml(text)}</b></span><kbd>${escapeHtml(keys)}</kbd></div>`).join('')
        + '</div><p class="palette-hint">Skróty nie działają w polach tekstowych. <kbd>Esc</kbd> zamyka.</p><button class="button secondary" type="submit">Zamknij</button></form>';
      document.body.append(help);
    }
    help.showModal();
  });

  return { attach, refreshCounts, current: () => state.queueType };
}
