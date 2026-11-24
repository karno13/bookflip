// Etykiety (catalog-labels.mjs): the owner's own marks on a book. Chips on the catalogue rows, an
// editor on the book page (add with Enter, remove with ×), the suggestions of the label filter
// and of the editor (#labelNames), and the series names for „Seria i tom” (#seriesNames).

/** Chips for a catalogue row. Pure (tested). */
export function labelChipsMarkup(labels, escapeHtml) {
  return labels?.length ? `<small class="work-labels">${labels.map((label) => `<span class="work-label" title="Etykieta">${escapeHtml(label)}</span>`).join('')}</small>` : '';
}

/** Adds one label to a list (no duplicates whatever the case); removes one. Pure (tested). */
export function withLabel(labels, label) {
  const clean = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!clean || labels.some((item) => item.toLocaleLowerCase('pl') === clean.toLocaleLowerCase('pl'))) return labels;
  return [...labels, clean];
}
export const withoutLabel = (labels, label) => labels.filter((item) => item !== label);

let knownLabels = [];
/** Filter value for books without a label; the same as NO_LABEL in catalog-labels.mjs. */
export const NO_LABEL = '__none__';

const option = (value, note, escapeHtml) => `<option value="${escapeHtml(value)}">${escapeHtml(note)}</option>`;

/** Suggestions for every label field and the series name field; read again after a change. The
 *  labels come first and alone: the series list can take long on a big catalogue. */
export async function fillNameLists({ json, escapeHtml }) {
  await fillLabelLists({ json, escapeHtml });
  try {
    const series = await json('/api/catalog/series');
    const names = [...new Set((series.items || []).map((item) => item.series))].sort((a, b) => a.localeCompare(b, 'pl'));
    let own = [];
    try {
      own = (await json('/api/catalog/my-series')).items.map((item) => item.name);
    } catch {}
    const seriesList = document.querySelector('#seriesNames');
    if (seriesList) seriesList.innerHTML = [...new Set([...own, ...names])].map((name) => option(name, 'seria', escapeHtml)).join('');
  } catch {}
}

async function fillLabelLists({ json, escapeHtml }) {
  try {
    const labels = await json('/api/catalog/labels');
    knownLabels = labels.items.map((item) => item.label);
    const labelList = document.querySelector('#labelNames');
    if (labelList) labelList.innerHTML = labels.items.map((item) => option(item.label, `${item.works} ${item.works === 1 ? 'książka' : 'książek'}`, escapeHtml)).join('');
    // The catalogue filter is a drop-down of the labels in use; a choice that is gone falls back to all.
    const filter = document.querySelector('#catalogLabel');
    if (filter?.tagName === 'SELECT') {
      const chosen = filter.value;
      filter.innerHTML = `<option value="">Wszystkie</option><option value="${NO_LABEL}">Bez etykiety</option>` + labels.items.map((item) => `<option value="${escapeHtml(item.label)}">${escapeHtml(item.label)} (${item.works})</option>`).join('');
      filter.value = chosen === NO_LABEL || knownLabels.includes(chosen) ? chosen : '';
      if (filter.value !== chosen) filter.dispatchEvent(new Event('input'));
    }
  } catch {}
}

/** Katalog → Filtry → „Etykieta”: fills the label suggestions and the filter drop-down. */
export function installLabelFilter({ json, escapeHtml }) {
  void fillNameLists({ json, escapeHtml });
}

/** The label editor of a book page, mounted into `target`. */
export function mountWorkLabels({ json, escapeHtml, toast, workId, target, onChange = () => {} }) {
  let labels = [];
  const section = document.createElement('section');
  section.className = 'bp-labels';
  section.setAttribute('aria-label', 'Etykiety');
  target.append(section);
  function render() {
    section.innerHTML = `<span class="bp-labels-title">Etykiety</span>${labels.map((label) => `<span class="work-label">${escapeHtml(label)}<button type="button" class="work-label-remove" data-label-remove="${escapeHtml(label)}" aria-label="Usuń etykietę ${escapeHtml(label)}">×</button></span>`).join('')}<input class="bp-label-input" list="labelNames" maxlength="60" placeholder="${labels.length ? 'Dodaj…' : 'Dodaj etykietę, np. Gaunt'}" aria-label="Nowa etykieta">`;
    const input = section.querySelector('input');
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const next = withLabel(labels, input.value);
      if (next !== labels) void save(next);
      else input.value = '';
    });
    // Picking a suggestion from the list adds it at once.
    input.addEventListener('change', () => {
      const next = withLabel(labels, input.value);
      if (next !== labels) void save(next);
    });
    section.querySelectorAll('[data-label-remove]').forEach((button) =>
      button.addEventListener('click', () => void save(withoutLabel(labels, button.dataset.labelRemove))),
    );
  }
  async function save(next) {
    try {
      const saved = await json(`/api/catalog/works/${encodeURIComponent(workId)}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: next }),
      });
      labels = saved.labels;
      render();
      section.querySelector('input')?.focus();
      onChange(labels);
      void fillNameLists({ json, escapeHtml });
    } catch (error) {
      toast('Nie zapisano etykiety: ' + error.message);
    }
  }
  render();
  json(`/api/catalog/works/${encodeURIComponent(workId)}/labels`)
    .then((data) => {
      labels = data.labels;
      render();
    })
    .catch(() => {});
}

/** The drop-down of a catalogue row: labels to add (not on the book yet), „Nowa etykieta…”, and the
 *  book's labels with × to remove. Pure (tested). */
export function rowLabelMenuMarkup(current, known, escapeHtml) {
  const lower = new Set(current.map((label) => label.toLocaleLowerCase('pl')));
  const free = known.filter((label) => !lower.has(label.toLocaleLowerCase('pl')));
  const select = free.length
    ? `<select class="row-label-select" aria-label="Wybierz etykietę"><option value="">Wybierz etykietę…</option>${free.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join('')}<option value="${NEW_LABEL}">+ Nowa etykieta…</option></select>`
    : '';
  const fresh = `<form class="row-label-new"${free.length ? ' hidden' : ''}><input name="label" maxlength="60" placeholder="np. Gaunt" aria-label="Nowa etykieta" autocomplete="off"><button type="submit" class="button compact">Dodaj</button></form>`;
  const own = current.length
    ? `<div class="row-label-current">${current.map((label) => `<span class="work-label">${escapeHtml(label)}<button type="button" class="work-label-remove" data-row-label-remove="${escapeHtml(label)}" aria-label="Usuń etykietę ${escapeHtml(label)}">×</button></span>`).join('')}</div>`
    : '';
  return `<div class="row-label-menu" role="dialog" aria-label="Etykiety książki"><strong>Etykiety</strong>${select}${fresh}${own}</div>`;
}
const NEW_LABEL = '__new__';

/** Katalog → lista: the tag button of a row opens the drop-down; a choice is saved at once and the
 *  row shows the badge without a reload. Delegated on the list, so re-rendered rows need nothing. */
export function installRowLabels({ list, json, toast, escapeHtml, findRow }) {
  if (!list) return;
  const close = () => {
    list.querySelectorAll('.row-label-menu').forEach((menu) => menu.remove());
    list.querySelectorAll('[data-row-labels][aria-expanded]').forEach((button) => button.removeAttribute('aria-expanded'));
  };
  // The list can be drawn again at any moment (live refresh): always look the row up afresh.
  const wrapOf = (id) => [...list.querySelectorAll('[data-row-labels]')].find((button) => button.dataset.rowLabels === id)?.closest('.catalog-row-wrap');
  async function save(id, next, added) {
    try {
      const saved = await json(`/api/catalog/works/${encodeURIComponent(id)}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: next }),
      });
      const row = findRow(id);
      if (row) row.labels = saved.labels;
      close();
      toast(added ? `Dodano etykietę „${added}”.` : 'Usunięto etykietę.');
      void fillNameLists({ json, escapeHtml });
      const wrap = wrapOf(id);
      if (!wrap) return;
      // Filtered to „Bez etykiety”: a book that got one leaves the list.
      if (saved.labels.length && document.querySelector('#catalogLabel')?.value === NO_LABEL) {
        wrap.classList.add('is-removing');
        setTimeout(() => wrap.remove(), 600);
      }
      const copy = wrap.querySelector('.catalog-book-copy');
      copy?.querySelector('.work-labels')?.remove();
      copy?.insertAdjacentHTML('beforeend', labelChipsMarkup(saved.labels, escapeHtml));
      if (added) [...(copy?.querySelectorAll('.work-label') || [])].find((chip) => chip.textContent === added)?.classList.add('is-new');
      wrap.querySelector('[data-row-labels]')?.classList.toggle('has-labels', saved.labels.length > 0);
    } catch (error) {
      toast('Nie zapisano etykiety: ' + error.message);
    }
  }
  // Opens at once with the labels known so far; nothing is awaited, so the row cannot go stale.
  function open(button) {
    const wrap = button.closest('.catalog-row-wrap');
    const had = wrap.querySelector('.row-label-menu');
    close();
    if (had) return;
    const id = button.dataset.rowLabels;
    const current = findRow(id)?.labels || [];
    button.setAttribute('aria-expanded', 'true');
    wrap.insertAdjacentHTML('beforeend', rowLabelMenuMarkup(current, knownLabels, escapeHtml));
    const menu = wrap.querySelector('.row-label-menu');
    const select = menu.querySelector('select');
    const form = menu.querySelector('form');
    const field = form.querySelector('input');
    (select || field).focus();
    select?.addEventListener('change', () => {
      if (!select.value) return;
      if (select.value === NEW_LABEL) {
        form.hidden = false;
        field.focus();
        return;
      }
      void save(id, withLabel(current, select.value), select.value);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = field.value.replace(/\s+/g, ' ').trim();
      // A typed name that already exists takes that label's spelling.
      const label = knownLabels.find((known) => known.toLocaleLowerCase('pl') === value.toLocaleLowerCase('pl')) || value;
      const next = withLabel(current, label);
      if (next !== current) return void save(id, next, label);
      if (!label) return field.focus();
      close();
      toast(`Ta książka ma już etykietę „${label}”.`);
    });
    menu.querySelectorAll('[data-row-label-remove]').forEach((remove) =>
      remove.addEventListener('click', () => void save(id, withoutLabel(current, remove.dataset.rowLabelRemove), '')),
    );
  }
  void fillLabelLists({ json, escapeHtml });
  list.addEventListener('click', (event) => {
    const target = event.target;
    const button = target.closest('[data-row-labels]');
    if (button) return open(button);
    if (!target.closest('.row-label-menu')) close();
  });
  document.addEventListener('click', (event) => {
    if (!list.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && list.querySelector('.row-label-menu')) close();
  });
}
