import { MAX_SCAN_QUERIES } from '../core/scan-limits.js';
import { DISCWORLD_PHRASES, GOTREK_FELIX_PHRASES, HORUS_HERESY_PHRASES, universeSeriesOptions } from './scan-series-titles.js';

export { DISCWORLD_PHRASES, DISCWORLD_TITLES, GOTREK_FELIX_TITLES, HORUS_HERESY_TITLES } from './scan-series-titles.js';

/** Only series and title lists explicitly agreed with the user belong here (the „Gotowe serie” group). */
export function scanSeriesOptions() {
  return [
    { id: 'discworld', name: 'Świat Dysku', titles: [...DISCWORLD_PHRASES] },
    {
      id: 'horus-heresy', name: 'Herezja Horusa', titles: [...HORUS_HERESY_PHRASES],
      scope: 'Polskie tytuły tomów 1–48, w tym zapowiedzi: Stara Ziemia i Brzemię lojalności.',
    },
    { id: 'gotrek-felix', name: 'Gotrek i Felix', titles: [...GOTREK_FELIX_PHRASES], scope: '17 głównych tomów Przygód Gotreka i Felixa.' },
    ...universeSeriesOptions(),
  ];
}

/**
 * Scan phrases of one label: „title author” of its books in the owner's order (the author is left out
 * when the title already carries the surname; duplicates dropped). Pure (tested).
 */
export function labelPhrases(works) {
  const seen = new Set();
  const phrases = [];
  for (const work of works || []) {
    const title = String(work.title || '').trim();
    if (!title) continue;
    const author = String((work.authors || [])[0] || '').trim();
    const phrase = author && !title.toLocaleLowerCase('pl').includes(author.split(/\s+/).pop().toLocaleLowerCase('pl')) ? `${title} ${author}` : title;
    const key = phrase.toLocaleLowerCase('pl');
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
  }
  return phrases;
}

/**
 * Puts phrases into the scan field (and says so in the note); the scan is never started here.
 * Returns false when nothing was put (too many phrases or none). The limit is the scan's own.
 */
export function fillScanQueries({ input, note, toast }, name, titles, scope) {
  if (titles.length > MAX_SCAN_QUERIES) {
    toast(`„${name}” ma ${titles.length} tytułów. Limit skanu to ${MAX_SCAN_QUERIES}; wybierz mniejszą etykietę.`);
    return false;
  }
  if (!titles.length) {
    toast(`Etykieta „${name}” nie ma żadnych książek.`);
    return false;
  }
  input.value = titles.join('\n');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (note) note.textContent = `Wstawiono ${titles.length} tytułów: ${name}. ${scope ? scope + ' ' : ''}Możesz je edytować przed skanem.`;
  return true;
}

export function installScanSeries({ $, toast, json }) {
  const picker = $('#scanSeries');
  const input = $('#queries');
  const note = $('#scanSeriesNote');
  const options = scanSeriesOptions();
  let labels = [];
  function optionNode(label, value) {
    const node = document.createElement('option');
    node.textContent = label;
    node.value = value;
    return node;
  }
  function groupNode(label, nodes) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const node of nodes) group.appendChild(node);
    return group;
  }
  function render() {
    const selected = picker.value;
    picker.replaceChildren(optionNode('Wybierz etykietę…', ''));
    const mine = labels.filter((item) => item.works > 0);
    if (mine.length) picker.add(groupNode('Moje etykiety', mine.map((item) => optionNode(`${item.label} (${item.works})`, `label:${item.label}`))));
    picker.add(groupNode('Gotowe serie', options.map((option) => optionNode(`${option.name} (${option.titles.length} tytułów)`, `series:${option.id}`))));
    picker.value = selected;
  }
  async function loadLabels() {
    if (!json) return;
    try {
      labels = (await json('/api/catalog/labels')).items || [];
    } catch {
      labels = [];
    }
    render();
  }
  const fill = (name, titles, scope) => fillScanQueries({ input, note, toast }, name, titles, scope);
  async function apply() {
    const value = picker.value;
    if (value.startsWith('series:')) {
      const series = options.find((option) => option.id === value.slice(7));
      if (series) fill(series.name, series.titles, series.scope);
    } else if (value.startsWith('label:') && json) {
      const name = value.slice(6);
      try {
        const data = await json(`/api/catalog/labels/${encodeURIComponent(name)}/works`);
        if (picker.value === value) fill(data.label || name, labelPhrases(data.works));
      } catch (error) {
        toast(`Nie udało się odczytać etykiety: ${error.message}`);
      }
    }
  }
  render();
  void loadLabels();
  picker.addEventListener('focus', () => void loadLabels());
  picker.addEventListener('change', () => void apply());
}
