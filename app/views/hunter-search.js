// „Łowca” without a barcode: find a book by its title, author or publisher in the pack kept on this
// device (hunter-pack.js), so it works the same with and without a connection. Old books, library
// sales and fairs often have no barcode, or a sticker over it: the owner types „smoki jesien” and
// picks the edition by publisher and year with the book in hand (the ISBN of the pick is then
// checked as usual). Also „Ściąga”: the books worth looking out for on a shelf, valued and sorted,
// printable for a fair. The edition's universe, cycle and the owner's labels are searched too
// („warhammer”). A search only finds and lists; nothing is assigned. Pure functions.
import { FLAG, verdictOf, worthUpTo } from './hunter-pack.js';

/** Lower case, no diacritics, ł → l, anything else than letters and digits → one space. */
export function foldText(text) {
  return String(text ?? '')
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Typed text that is an ISBN (digits, X, dashes, spaces, an „ISBN” prefix), not a title. */
export function looksLikeIsbn(text) {
  const clean = String(text ?? '').trim().replace(/^ISBN(?:-1[03])?:?/i, '');
  // 9–13 digits or X: „1984” or „451” are titles and are searched.
  return /^[\d\sXx-]+$/.test(clean) && /^\d[\dXx]{8,12}$/.test(clean.replace(/[\s-]/g, ''));
}

/** Shortest text worth searching („Mort” has four letters, „It” is too short to mean anything). */
export const MIN_QUERY = 3;
export const SEARCH_LIMIT = 30;

const words = new WeakMap();
/** Per entry: folded words of its title and of everything else (work, authors, publisher, year). */
function wordsOf(pack) {
  let list = words.get(pack);
  if (!list) {
    list = pack.entries.map((entry) => ({
      title: foldText(entry[1]).split(' ').filter(Boolean),
      other: foldText([entry[18], entry[15], entry[16], entry[17], entry[19]].filter((part) => part != null).join(' ')).split(' ').filter(Boolean),
    }));
    words.set(pack, list);
  }
  return list;
}

/** One pack entry as a row of a list (search result or cheat sheet). price in grosze or null. */
export function packRow(pack, entry, price = null) {
  const [isbn, title, estimate, , , confidence, target, inStock, flags, chance, , , listed, cheapest, , authors, publisher, year, work] = entry;
  return {
    isbn,
    title: title || isbn,
    work: work || null,
    authors: authors || '',
    publisher: publisher || null,
    year: year ?? null,
    estimate,
    confidence,
    worthUpTo: worthUpTo(pack, estimate),
    target: target ?? null,
    chance: chance ?? null,
    listed: listed ?? 0,
    cheapest: cheapest ?? null,
    inStock: inStock ?? 0,
    outside: Boolean(flags & FLAG.outside),
    removed: Boolean(flags & FLAG.removed),
    verdict: verdictOf(pack, estimate, price),
    targetMet: target != null && price > 0 && price <= target,
  };
}

/**
 * Score of a pack entry for the typed words, or -1 when a word starts no word of it: a word in the
 * title counts 10, in the work, authors, publisher or year 6, the whole title typed 5; books seen
 * only in offers lose 8 (a seller's title often carries the author: „Margaret Weis Zaginiony Król”
 * must not come before the catalogue's Weis books) and removed works 4.
 */
function scoreOf(pack, index, tokens, folded) {
  const { title, other } = wordsOf(pack)[index];
  let score = 0;
  for (const token of tokens) {
    if (title.some((word) => word.startsWith(token))) score += 10;
    else if (other.some((word) => word.startsWith(token))) score += 6;
    else return -1;
  }
  const flags = pack.entries[index][8];
  return score + (title.join(' ') === folded ? 5 : 0) - (flags & FLAG.outside ? 8 : 0) - (flags & FLAG.removed ? 4 : 0);
}

/**
 * Pack entries whose words start with every typed word, best first (scoreOf), then the higher
 * valuation. price (grosze) gives each row its verdict, as a scanned book would get.
 * @returns {{ rows: any[], more: number }}
 */
export function packSearch(pack, query, { price = null, limit = SEARCH_LIMIT } = {}) {
  const folded = foldText(query);
  const tokens = folded.split(' ').filter(Boolean);
  if (!pack || folded.replace(/ /g, '').length < MIN_QUERY) return { rows: [], more: 0 };
  const hits = [];
  pack.entries.forEach((entry, index) => {
    const score = scoreOf(pack, index, tokens, folded);
    if (score >= 0) hits.push({ entry, score });
  });
  hits.sort((a, b) => b.score - a.score || (b.entry[2] ?? -1) - (a.entry[2] ?? -1) || String(a.entry[1]).localeCompare(String(b.entry[1]), 'pl'));
  return { rows: hits.slice(0, limit).map((hit) => packRow(pack, hit.entry, price)), more: Math.max(0, hits.length - limit) };
}

/** A cheat-sheet row needs at least this „opłaca się do” (grosze): cheaper finds are not worth the time. */
export const CHEAT_MIN = 1000;
export const CHEAT_LIMIT = 150;

/**
 * „Ściąga”: catalogue books (not removed) with a sure enough valuation (high or medium) or the
 * owner's own target, and „opłaca się do” (or the target) of at least `min`. sort 'value' (the
 * highest limit first) or 'author' (A–Z by author, then title, as books stand on a shelf);
 * `query` narrows it with the words of a title search („warhammer” for a fantasy fair).
 */
export function cheatSheet(pack, { sort = 'value', query = '', min = CHEAT_MIN, limit = CHEAT_LIMIT } = {}) {
  if (!pack) return { rows: [], more: 0 };
  const folded = foldText(query);
  const tokens = folded.split(' ').filter(Boolean);
  const rows = [];
  for (const [index, entry] of pack.entries.entries()) {
    if (tokens.length && scoreOf(pack, index, tokens, folded) < 0) continue;
    const row = packRow(pack, entry);
    if (row.outside || row.removed) continue;
    const sure = row.confidence === 'high' || row.confidence === 'medium';
    const limitPrice = Math.max(sure ? (row.worthUpTo ?? 0) : 0, row.target ?? 0);
    if (!(limitPrice >= min)) continue;
    rows.push({ ...row, limit: limitPrice });
  }
  const byText = (a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' });
  rows.sort(
    sort === 'author'
      ? (a, b) => byText(sortName(a.authors) || '￿', sortName(b.authors) || '￿') || byText(a.title, b.title)
      : (a, b) => b.limit - a.limit || byText(a.title, b.title),
  );
  return { rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit) };
}

/** „Pratchett” from „Terry Pratchett” or „Pratchett, Terry”: the surname a shelf is ordered by. */
export function sortName(authors) {
  const first = String(authors || '').split(/,\s*(?=[^,]*\s)|;/)[0].trim();
  if (!first) return '';
  if (first.includes(',')) return first.split(',')[0].trim();
  const parts = first.split(/\s+/);
  return parts[parts.length - 1];
}

function rowMeta(row) {
  return [row.authors, row.publisher, row.year].filter((part) => part != null && part !== '').join(' · ');
}

/** Search results as buttons; picking one checks its ISBN. Outside strings through escapeHtml. */
export function searchMarkup(result, query, { escapeHtml, money }) {
  if (foldText(query).replace(/ /g, '').length < MIN_QUERY) return '';
  if (!result.rows.length) return `<p class="hunter-message is-warn">Nic nie pasuje do „${escapeHtml(query.trim())}” w katalogu ani w zapisanych ofertach. Spróbuj innego słowa z tytułu albo nazwiska autora.</p>`;
  const items = result.rows
    .map((row) => {
      const limit = row.worthUpTo != null ? `opłaca się do ${money(row.worthUpTo)}` : 'bez wyceny';
      const chips = [
        row.targetMet ? '<span class="hunter-chip is-good">W Twoim celu</span>' : '',
        row.verdict ? `<span class="hunter-chip is-${['warto', 'raczej_tak'].includes(row.verdict.verdict) ? 'good' : row.verdict.verdict === 'granica' ? 'warn' : 'bad'}">${escapeHtml(row.verdict.label.split(':')[0])}</span>` : '',
        row.outside ? '<span class="hunter-chip is-neutral">Spoza katalogu</span>' : '',
        row.removed ? '<span class="hunter-chip is-neutral">Usunięte z katalogu</span>' : '',
        row.inStock > 0 ? `<span class="hunter-chip is-neutral">W zapasie: ${row.inStock}</span>` : '',
      ].join('');
      const work = row.work && foldText(row.work) !== foldText(row.title) ? `<small>dzieło w katalogu: ${escapeHtml(row.work)}</small>` : '';
      return `<li><button class="hunter-pick" type="button" data-hunter-pick="${escapeHtml(row.isbn)}"><span class="hunter-pick-main"><strong>${escapeHtml(row.title)}</strong>${work}<small>${escapeHtml(rowMeta(row) || 'bez opisu wydania')} · ISBN ${escapeHtml(row.isbn)}</small></span><span class="hunter-pick-side"><b>${escapeHtml(limit)}</b>${chips}</span></button></li>`;
    })
    .join('');
  const more = result.more ? `<p class="hunter-hint">i ${result.more} więcej — dopisz słowo, aby zawęzić.</p>` : '';
  return `<p class="hunter-hint">Wybierz wydanie, które masz w ręku (wydawca, rok):</p><ul class="hunter-picks">${items}</ul>${more}`;
}

/** The cheat sheet as a table that also prints well. */
export function cheatSheetMarkup(result, { escapeHtml, money }) {
  if (!result.rows.length) return '<p class="hunter-hint">Brak książek do ściągi przy tych ustawieniach (potrzebna pewna wycena albo Twój cel „Kupuję do”).</p>';
  const rows = result.rows
    .map((row) => {
      const notes = [row.target != null ? `cel ${money(row.target)}` : '', row.listed ? `${row.listed} w ofertach` : 'brak w ofertach', row.inStock ? `w zapasie ${row.inStock}` : ''].filter(Boolean).join(' · ');
      return `<tr><td><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(rowMeta(row))}</small></td><td class="hunter-cheat-limit">${escapeHtml(money(row.limit))}</td><td><small>${escapeHtml(notes)}</small></td></tr>`;
    })
    .join('');
  const more = result.more ? `<p class="hunter-hint">i ${result.more} więcej poniżej tego progu listy.</p>` : '';
  return `<table class="hunter-cheat-table"><thead><tr><th scope="col">Książka (autor · wydawca · rok)</th><th scope="col">Bierz do</th><th scope="col">Uwagi</th></tr></thead><tbody>${rows}</tbody></table>${more}`;
}
