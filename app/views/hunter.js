// "Łowca": a book in hand (shop, fair), checked by ISBN against the catalogue through /api/hunter;
// a typed title or author is searched in the offline pack (hunter-search.js) and the pick checked by ISBN.
// The server answers from the catalogue only; this view shows the verdict on the shelf price, the
// valuation, how fast the edition sells and what is listed now. Render functions are pure.
import { plural, valuationRange, zl } from '../core/valuation.js';
import { recordSessionPurchase } from './stock.js';
import { cameraAvailable, startBarcodeScanner } from '../core/barcode.js';
import { LOOKUP_TIMEOUT_MS, isConnectionError, loadPack, packDate, packIsStale, packLookup, packStatusText, savePack, validPack } from './hunter-pack.js';
import { cheatSheet, cheatSheetMarkup, looksLikeIsbn, packSearch, searchMarkup } from './hunter-search.js';

const VERDICT_STYLE = {
  warto: { tone: 'good', icon: '✔', text: 'Warto brać' },
  raczej_tak: { tone: 'good', icon: '✔', text: 'Raczej tak' },
  granica: { tone: 'warn', icon: '!', text: 'Na granicy' },
  drogo: { tone: 'bad', icon: '✖', text: 'Drogo' },
};
const VERDICT_FALLBACK = { tone: 'warn', icon: '!', text: 'Ocena ceny' };
const LEVEL_LABELS = { fast: 'szybko', normal: 'normalnie', slow: 'wolno' };
const CAUTIONS = {
  no_valuation: 'Brak wiarygodnej wyceny tej książki — za mało ofert tego wydania, więc nie da się ocenić ceny z półki.',
  low_confidence: 'Wycena jest niepewna (mało obserwacji) — traktuj werdykt tylko orientacyjnie.',
};

/** Shelf price typed by the user ("15", "15,50") to the query value; null when empty or not positive. */
export function shelfPriceParam(text) {
  const value = Number(String(text ?? '').trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? String(text).trim().replace('.', ',') : null;
}

export function hunterUrl(isbn, priceText) {
  const price = shelfPriceParam(priceText);
  return `/api/hunter?isbn=${encodeURIComponent(String(isbn ?? '').trim())}${price ? `&price=${encodeURIComponent(price)}` : ''}`;
}

/** "28% szans na sprzedaż w 30 dni · schodzi szybko · zwykle ~57 dni"; empty without data. */
export function huntLiquidityLabel(liquidity) {
  // No sales of its own for this edition: say "brak danych" instead of a made-up 0%.
  if (!liquidity || liquidity.basis === 'market' || (liquidity.sales === 0 && !(liquidity.live > 0))) return '';
  const level = LEVEL_LABELS[liquidity.level];
  const days = liquidity.medianDays == null ? '' : liquidity.medianDays >= 365 ? 'zwykle ponad rok' : `zwykle ~${liquidity.medianDays} dni`;
  return [`${Math.round((liquidity.chance ?? 0) * 100)}% szans na sprzedaż w 30 dni`, level ? `schodzi ${level}` : '', days].filter(Boolean).join(' · ');
}

function verdictMarkup(result, escapeHtml) {
  const verdict = result.verdict;
  if (!verdict) {
    return result.price != null
      ? ''
      : '<p class="hunter-hint">Wpisz cenę z półki, aby dostać werdykt.</p>';
  }
  const style = VERDICT_STYLE[verdict.verdict] || VERDICT_FALLBACK;
  const percent = Math.round(verdict.ratio * 100);
  return `<div class="hunter-verdict is-${style.tone}" role="status"><span class="hunter-verdict-icon" aria-hidden="true">${style.icon}</span><div><strong>${escapeHtml(style.text)}</strong><small>${escapeHtml(verdict.label)} · cena to ${percent}% wyceny</small></div></div>`;
}

/** „Opłaca się do 22 zł” and the owner's own „Kupuję do”, when there is one. */
function limitsMarkup(result, { escapeHtml, money }) {
  const parts = [];
  if (result.target != null)
    parts.push(`<p class="hunter-fact hunter-target${result.targetMet ? ' is-met' : ''}"><span>Twój cel „Kupuję do”</span><b>${escapeHtml(money(result.target))}</b>${result.targetMet ? ' <small>cena mieści się w celu — bierz</small>' : ''}</p>`);
  if (result.worthUpTo != null)
    parts.push(`<p class="hunter-fact hunter-limit"><span>Opłaca się do</span><b>${escapeHtml(money(result.worthUpTo))}</b> <small>75% wyceny, bez kosztów i opłat</small></p>`);
  return parts.join('');
}

function listedText(listed, { escapeHtml, money }) {
  const count = listed?.count ?? 0;
  return count ? `${count} ${plural(count, 'oferta', 'oferty', 'ofert')}, najtańsza ${escapeHtml(money(listed.cheapest))}` : 'brak ofert';
}

function worthMarkup(value, escapeHtml, note = '') {
  return value
    ? `<p class="hunter-fact"><span>Wycena${note}</span><b>${escapeHtml(zl(value.estimate))}</b> <small>(${escapeHtml(valuationRange(value))}) · wiarygodność ${escapeHtml(value.confidenceLabel || value.confidence)}</small></p>`
    : '<p class="hunter-fact"><span>Wycena</span><b>brak</b></p>';
}

/** Not in the catalogue, but offers with this very ISBN were seen: a valuation from them. */
function marketMarkup(result, helpers) {
  const { escapeHtml } = helpers;
  const market = result.market;
  const caution = CAUTIONS[result.caution] ? `<p class="hunter-message is-warn">${escapeHtml(CAUTIONS[result.caution])}</p>` : '';
  const offers = `${market.offers} ${plural(market.offers, 'oferty', 'ofert', 'ofert')}`;
  return `<article class="hunter-card is-outside">${verdictMarkup(result, escapeHtml)}${caution}<p class="hunter-message is-warn" role="status">Tej książki nie ma w katalogu. Wycena z ${escapeHtml(offers)} z tym samym ISBN (tytuł z ogłoszeń, nie z katalogu).</p><h3>${escapeHtml(market.title || result.isbn)}</h3><p class="hunter-meta">ISBN ${escapeHtml(result.isbn)}</p>${worthMarkup(market.value, escapeHtml, ' z ofert')}${limitsMarkup(result, helpers)}<p class="hunter-fact"><span>Teraz w ofertach</span>${listedText(market.listed, helpers)}</p></article>`;
}

/** HTML of one lookup result; every outside string goes through escapeHtml. */
export function hunterResultMarkup(result, helpers) {
  const html = resultMarkup(result, helpers);
  // Answered from the pack on this phone: say so, with the pack's date.
  return html && result?.offline ? `<p class="hunter-message is-warn" role="status">Bez połączenia z komputerem — odpowiedź z danych z ${helpers.escapeHtml(packDate(result.offline))}.</p>${html}` : html;
}

function resultMarkup(result, { escapeHtml, money }) {
  if (!result || result.found === undefined) return '';
  const helpers = { escapeHtml, money };
  if (!result.found) {
    if (result.reason === 'invalid_isbn') return '<p class="hunter-message is-bad" role="alert">To nie wygląda na ISBN.</p>';
    if (result.market) return marketMarkup(result, helpers);
    return '<p class="hunter-message is-warn" role="status">Tej książki nie ma w katalogu ani w zapisanych ofertach — nie da się jej wycenić.</p>';
  }
  const { edition, value, liquidity, listed } = result;
  const authors = (edition.authors || []).join(', ');
  const meta = [authors, edition.publisher, edition.year].filter((part) => part != null && part !== '').map((part) => escapeHtml(part)).join(' · ');
  const chance = huntLiquidityLabel(liquidity);
  const caution = CAUTIONS[result.caution] ? `<p class="hunter-message is-warn">${escapeHtml(CAUTIONS[result.caution])}</p>` : '';
  const notes = [
    result.inStock > 0 ? `<p class="hunter-message is-warn">Masz już ${result.inStock} ${plural(result.inStock, 'sztukę', 'sztuki', 'sztuk')} w zapasie.</p>` : '',
    result.removed ? '<p class="hunter-message is-warn">Usunąłeś to dzieło z katalogu.</p>' : '',
  ].join('');
  const basis = result.valueBasis === 'isbn_offers' ? ' z ofert z tym ISBN' : '';
  return `<article class="hunter-card">${verdictMarkup(result, escapeHtml)}${caution}${notes}<h3>${escapeHtml(edition.title)}</h3><p class="hunter-meta">${meta}</p>${worthMarkup(value, escapeHtml, basis)}${limitsMarkup(result, helpers)}<p class="hunter-fact"><span>Sprzedaż</span>${escapeHtml(chance || 'brak danych')}</p><p class="hunter-fact"><span>Teraz w ofertach</span>${listedText(listed, helpers)}</p></article>`;
}

/**
 * One line under the camera, so the verdict is seen without scrolling away from the books:
 * „✔ Warto brać · Miecz przeznaczenia · opłaca się do 52 zł”.
 */
export function scanStripMarkup(result, { escapeHtml, money }) {
  if (!result || result.found === undefined) return '';
  if (!result.found && !result.market)
    return `<p class="hunter-strip is-neutral">${escapeHtml(result.reason === 'invalid_isbn' ? 'To nie wygląda na ISBN' : `${result.isbn || ''}: brak w katalogu i w ofertach`)}</p>`;
  const style = result.verdict ? VERDICT_STYLE[result.verdict.verdict] || VERDICT_FALLBACK : null;
  const tone = result.targetMet ? 'good' : style?.tone || 'neutral';
  const head = result.targetMet ? '✔ W Twoim celu' : style ? `${style.icon} ${style.text}` : 'Bez werdyktu';
  const title = result.found ? result.edition?.title : result.market?.title;
  const limit = result.worthUpTo != null ? `opłaca się do ${money(result.worthUpTo)}` : 'bez wyceny';
  // The shelf price stays for the next book (a box at one price): say which price was judged.
  const shelf = result.price != null ? ` · półka ${money(result.price)}` : '';
  return `<p class="hunter-strip is-${tone}"><b>${escapeHtml(head)}</b> · ${escapeHtml(title || result.isbn || '')} · ${escapeHtml(limit + shelf)}</p>`;
}

/** Phone feedback for a scanned book: 'good' (worth it or the owner's target), 'known', 'unknown'. */
export function scanFeedback(result) {
  if (!result || result.found === undefined || (!result.found && !result.market)) return 'unknown';
  if (result.targetMet || ['warto', 'raczej_tak'].includes(result.verdict?.verdict)) return 'good';
  return 'known';
}

// --- Shop session: a series of checks kept as a list with a running total (price against valuation only).
export const SESSION_KEY = 'bookflip.hunterSession.v1';
export const SESSION_LIMIT = 200;

/** Shelf price text ("15,50") to integer grosze; null when empty or not positive. */
export function shelfGrosze(text) {
  const param = shelfPriceParam(text);
  return param ? Math.round(Number(param.replace(',', '.')) * 100) : null;
}

/** Session row from a lookup result; null for an invalid ISBN (nothing to keep). */
export function sessionItemFromResult(result, typedIsbn, priceText) {
  if (!result || result.found === undefined || (!result.found && result.reason === 'invalid_isbn')) return null;
  const isbn = String(result.isbn || typedIsbn || '').trim();
  if (!isbn) return null;
  const found = result.found === true;
  // Outside the catalogue with offers of this ISBN: the sellers' title and the valuation from them.
  const market = !found && result.market ? result.market : null;
  const value = found ? result.value : market?.value;
  return {
    isbn,
    title: found ? result.edition?.title || null : market?.title || null,
    shelf: result.price ?? shelfGrosze(priceText),
    estimate: Number.isFinite(value?.estimate) ? value.estimate : null,
    verdict: found || market ? result.verdict?.verdict || null : null,
    take: false,
    ...(market ? { outside: true } : {}),
  };
}

/** Add a row, or refresh the one with the same ISBN (keeps its place and its "Biorę"); capped at the limit. */
export function upsertSessionItem(items, item) {
  const list = Array.isArray(items) ? items : [];
  const at = list.findIndex((entry) => entry.isbn === item.isbn);
  if (at >= 0) return list.map((entry, index) => (index === at ? { ...item, take: entry.take, bought: entry.bought === true } : entry));
  return [...list, item].slice(-SESSION_LIMIT);
}

/** Marks rows (by ISBN) as put in the stock register, or clears it after an undo. */
export function markSessionBought(items, isbns, bought = true) {
  const set = new Set(isbns);
  return (items || []).map((entry) => (set.has(entry.isbn) ? { ...entry, bought } : entry));
}

/** ISBNs of the rows picked with "Biorę" that are not in the stock register yet (catalogue books only). */
export function sessionToBuy(items) {
  return (items || []).filter((entry) => entry.take && !entry.bought && !entry.outside).map((entry) => entry.isbn);
}

export function removeSessionItem(items, isbn) {
  return (items || []).filter((entry) => entry.isbn !== isbn);
}

export function toggleSessionTake(items, isbn) {
  return (items || []).map((entry) => (entry.isbn === isbn ? { ...entry, take: !entry.take } : entry));
}

/** Count, picked count, shelf total and valuation total of the picked rows (valuation only where one exists). */
export function sessionTotals(items) {
  const list = items || [];
  const picked = list.filter((entry) => entry.take);
  const sum = (rows, key) => rows.reduce((total, entry) => total + (Number.isFinite(entry[key]) ? entry[key] : 0), 0);
  const valued = picked.filter((entry) => Number.isFinite(entry.estimate));
  return {
    count: list.length,
    picked: picked.length,
    shelfTotal: sum(picked, 'shelf'),
    estimateTotal: sum(valued, 'estimate'),
    withoutEstimate: picked.length - valued.length,
  };
}

export function serializeSession(items) {
  return JSON.stringify((items || []).slice(-SESSION_LIMIT));
}

/** Rows from stored text; a broken value or wrong shapes give an empty or cleaned list, never a throw. */
export function parseSession(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set();
  const rows = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object' || typeof raw.isbn !== 'string' || !raw.isbn || seen.has(raw.isbn)) continue;
    seen.add(raw.isbn);
    rows.push({
      isbn: raw.isbn,
      title: typeof raw.title === 'string' && raw.title ? raw.title : null,
      shelf: Number.isFinite(raw.shelf) ? raw.shelf : null,
      estimate: Number.isFinite(raw.estimate) ? raw.estimate : null,
      verdict: typeof raw.verdict === 'string' ? raw.verdict : null,
      take: raw.take === true,
      ...(raw.bought === true ? { bought: true } : {}),
      ...(raw.outside === true ? { outside: true } : {}),
    });
  }
  return rows.slice(-SESSION_LIMIT);
}

/** Session rows; newest first. Outside strings through escapeHtml. */
export function sessionListMarkup(items, { escapeHtml, money }) {
  return [...(items || [])]
    .reverse()
    .map((entry) => {
      const style = entry.verdict ? VERDICT_STYLE[entry.verdict] || VERDICT_FALLBACK : null;
      const tone = style ? style.tone : 'neutral';
      const verdict = style
        ? `<span class="hunter-chip is-${tone}"><span aria-hidden="true">${style.icon}</span> ${escapeHtml(style.text)}</span>`
        : `<span class="hunter-chip is-neutral">${escapeHtml(entry.title ? 'Bez werdyktu' : 'Brak w katalogu')}</span>`;
      const label = escapeHtml(entry.title || entry.isbn);
      const isbn = escapeHtml(entry.isbn);
      const shelf = entry.shelf != null ? escapeHtml(money(entry.shelf)) : 'bez ceny';
      const worth = entry.estimate != null ? ` · wycena ${escapeHtml(money(entry.estimate))}` : '';
      const outside = entry.outside ? '<span class="hunter-chip is-neutral">Spoza katalogu</span>' : '';
      // A book outside the catalogue has no edition, so it cannot be a stock copy yet.
      const buy = entry.bought
        ? '<span class="hunter-chip is-good">W zapasie</span>'
        : entry.take && !entry.outside
          ? `<button class="button" type="button" data-hunter-bought="${isbn}" title="Dodaje tę sztukę do zapasu jako kupioną">Kupiłem</button>`
          : '';
      return `<li class="hunter-session-row${entry.take ? ' is-taken' : ''}"><div class="hunter-session-main"><strong>${label}</strong><small>${entry.title ? `${isbn} · ` : ''}półka ${shelf}${worth}</small>${verdict}${outside}</div><div class="hunter-session-actions"><button class="button${entry.take ? ' primary' : ''}" type="button" data-hunter-take="${isbn}" aria-pressed="${entry.take ? 'true' : 'false'}">Biorę</button>${buy}<button class="button" type="button" data-hunter-remove="${isbn}" aria-label="Usuń z sesji: ${label}">Usuń</button></div></li>`;
    })
    .join('');
}

/** Sticky total: counts and shelf price against valuation, no costs or profit. */
export function sessionBarMarkup(items, { escapeHtml, money }) {
  const totals = sessionTotals(items);
  const missing = totals.withoutEstimate
    ? ` <small>(${totals.withoutEstimate} ${plural(totals.withoutEstimate, 'książka', 'książki', 'książek')} bez wyceny)</small>`
    : '';
  return `<span>${totals.count} ${plural(totals.count, 'książka', 'książki', 'książek')}</span><span>Biorę: <b>${totals.picked}</b></span><span>Półka: <b>${escapeHtml(money(totals.shelfTotal))}</b></span><span>Wycena: <b>${escapeHtml(money(totals.estimateTotal))}</b>${missing}</span>`;
}

/** The bar button: all picked rows not yet in the stock; empty when there is none. */
export function sessionBuyMarkup(items) {
  const count = sessionToBuy(items).length;
  return count ? `<button class="button primary" type="button" data-hunter-buy-all>Kupiłem zaznaczone (${count})</button>` : '';
}

function loadSession() {
  try {
    return parseSession(localStorage.getItem(SESSION_KEY));
  } catch {
    return [];
  }
}

function saveSession(items) {
  try {
    localStorage.setItem(SESSION_KEY, serializeSession(items));
  } catch {
    /* storage unavailable: the session lives until the page is closed */
  }
}

export function installHunter({ $, json, escapeHtml, money, toast = () => {} }) {
  const form = $('#hunterForm');
  if (!form) return { focus: () => {} };
  const isbn = $('#hunterIsbn');
  const price = $('#hunterPrice');
  const out = $('#hunterResult');
  const sessionBox = $('#hunterSession');
  const sessionList = $('#hunterSessionList');
  const sessionBar = $('#hunterSessionBar');
  let session = loadSession();
  let serial = 0;
  // „Łowca bez sieci”: the pack kept on this device and its status line.
  let pack = loadPack();
  let packRefreshing = null;
  let packFailed = false;
  const packStatus = $('#hunterPackStatus');
  const packButton = $('#hunterPackRefresh');
  const showPack = (state = {}) => {
    if (packStatus) packStatus.textContent = packStatusText(pack, state);
    if (packButton) packButton.textContent = pack ? 'Odśwież dane bez sieci' : 'Pobierz dane do pracy bez sieci';
  };
  const refreshPack = () =>
    (packRefreshing ??= (async () => {
      showPack({ refreshing: true });
      try {
        const fresh = validPack(await json('/api/hunter/pack'));
        if (!fresh) throw Error('INVALID_PACK');
        pack = fresh;
        packFailed = false;
        showPack({ unsaved: !savePack(pack) });
      } catch {
        packFailed = true;
        showPack({ failed: true });
      } finally {
        packRefreshing = null;
        // Search and sheet waiting for the pack show the result either way (never „pobieranie…” for good).
        renderSearch();
        renderCheat();
      }
    })());
  packButton?.addEventListener('click', () => {
    packFailed = false;
    void refreshPack();
  });
  showPack();
  /** No pack on this device: start the download once, or say why there is nothing (offline, failed). */
  function noPackMarkup(what) {
    const offline = navigator.onLine === false;
    if (!offline && !packFailed) void refreshPack();
    return packRefreshing && !offline
      ? `<p class="hunter-hint">${what} korzysta z danych do pracy bez sieci — pobieranie…</p>`
      : `<p class="hunter-message is-warn">${what} korzysta z danych do pracy bez sieci, a na tym urządzeniu ich nie ma. Połącz się z komputerem i użyj „Pobierz dane do pracy bez sieci”.</p>`;
  }
  // Title / author search: in the pack, so it answers the same with and without a connection.
  const searchBox = $('#hunterSearch');
  let lastSearch = null;
  /** Renders the matches of the typed text; null when the text is an ISBN (or empty). */
  function renderSearch() {
    if (!searchBox) return null;
    const text = isbn.value;
    if (!text.trim() || looksLikeIsbn(text)) {
      searchBox.innerHTML = '';
      lastSearch = null;
      return null;
    }
    if (!pack) {
      searchBox.innerHTML = noPackMarkup('Szukanie po tytule');
      return null;
    }
    lastSearch = packSearch(pack, text, { price: shelfGrosze(price.value) });
    searchBox.innerHTML = searchMarkup(lastSearch, text, { escapeHtml, money });
    return lastSearch;
  }
  let searchTimer = 0;
  const searchSoon = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderSearch, 120);
  };
  isbn.addEventListener('input', searchSoon);
  price.addEventListener('input', () => {
    if (lastSearch) searchSoon();
  });
  const pick = (value) => {
    isbn.value = value;
    if (searchBox) searchBox.innerHTML = '';
    lastSearch = null;
    void check().then(() => isbn.select());
  };
  searchBox?.addEventListener('click', (event) => {
    const chosen = event.target.closest('[data-hunter-pick]');
    if (chosen) pick(chosen.dataset.hunterPick);
  });
  // „Ściąga”: what to look out for on a shelf, from the same pack; printable.
  const cheat = $('#hunterCheat');
  const cheatList = $('#hunterCheatList');
  function renderCheat() {
    if (!cheat?.open || !cheatList) return;
    if (!pack) {
      cheatList.innerHTML = noPackMarkup('Ściąga');
      return;
    }
    // The share of „opłaca się do” comes with the pack (hunter.mjs VERDICTS), not from the page.
    const shareNote = $('#hunterCheatShare');
    if (shareNote) shareNote.textContent = String(Math.round((pack.worthUpToShare ?? 0.75) * 100));
    const options = { sort: $('#hunterCheatSort')?.value === 'author' ? 'author' : 'value', query: $('#hunterCheatQuery')?.value || '' };
    cheatList.innerHTML = `<p class="hunter-hint">Dane z ${escapeHtml(packDate(pack.generatedAt))}.</p>${cheatSheetMarkup(cheatSheet(pack, options), { escapeHtml, money })}`;
  }
  cheat?.addEventListener('toggle', renderCheat);
  $('#hunterCheatSort')?.addEventListener('change', renderCheat);
  $('#hunterCheatQuery')?.addEventListener('input', renderCheat);
  $('#hunterCheatPrint')?.addEventListener('click', () => {
    if (!cheatList?.querySelector('table')) return;
    // Print only the sheet: a copy at the top of <body>; the print rule hides every other child.
    const sheet = document.createElement('div');
    sheet.id = 'hunterPrintSheet';
    sheet.innerHTML = `<h1>Ściąga na kiermasz</h1>${cheatList.innerHTML}`;
    document.body.append(sheet);
    document.body.classList.add('printing-hunter-cheat');
    const done = () => {
      document.body.classList.remove('printing-hunter-cheat');
      sheet.remove();
    };
    globalThis.addEventListener('afterprint', done, { once: true });
    globalThis.print();
  });
  const renderSession = () => {
    if (!sessionBox) return;
    sessionBox.hidden = session.length === 0;
    sessionList.innerHTML = sessionListMarkup(session, { escapeHtml, money });
    sessionBar.innerHTML = sessionBarMarkup(session, { escapeHtml, money }) + sessionBuyMarkup(session);
  };
  const setSession = (next) => {
    session = next;
    saveSession(session);
    renderSession();
  };
  let buying = false;
  async function buy(isbns) {
    if (buying || !isbns.length) return;
    buying = true;
    try {
      const result = await recordSessionPurchase({
        json,
        toast,
        isbns,
        onUndone: (undone) => setSession(markSessionBought(session, undone, false)),
      });
      // Rows that became copies are marked; skipped ones stay picked (they can be fixed in the queue).
      if (result?.created?.length) setSession(markSessionBought(session, result.created.map((entry) => entry.isbn)));
    } finally {
      buying = false;
    }
  }
  sessionBar?.addEventListener('click', (event) => {
    if (event.target.closest('[data-hunter-buy-all]')) void buy(sessionToBuy(session));
  });
  sessionList?.addEventListener('click', (event) => {
    const bought = event.target.closest('[data-hunter-bought]');
    if (bought) {
      void buy([bought.dataset.hunterBought]);
      return;
    }
    const take = event.target.closest('[data-hunter-take]');
    const remove = event.target.closest('[data-hunter-remove]');
    if (take) setSession(toggleSessionTake(session, take.dataset.hunterTake));
    else if (remove) setSession(removeSessionItem(session, remove.dataset.hunterRemove));
    else return;
    // Re-rendering drops focus; hand it back to the same control when it still exists.
    const key = (take || remove).dataset.hunterTake || (take || remove).dataset.hunterRemove;
    const attr = take ? 'data-hunter-take' : 'data-hunter-remove';
    sessionList.querySelector(`[${attr}="${CSS.escape(key)}"]`)?.focus();
  });
  $('#hunterSessionReset')?.addEventListener('click', () => {
    if (session.length && !confirm('Wyczyścić całą sesję w sklepie?')) return;
    setSession([]);
    isbn.focus();
  });
  renderSession();
  /**
   * Looks the typed ISBN up; the result, or null when the request failed. Every result goes to the
   * session; only the card shows the newest check (a slower answer does not overwrite it).
   */
  async function check() {
    const request = ++serial;
    const typed = isbn.value;
    const shelf = price.value;
    // A scanned or picked ISBN replaces whatever the title search listed.
    if (searchBox) searchBox.innerHTML = '';
    lastSearch = null;
    out.innerHTML = '<p class="hunter-hint" role="status">Sprawdzanie…</p>';
    try {
      let result;
      try {
        // With a pack, a hung connection must not keep the shop waiting.
        const signal = pack && globalThis.AbortSignal?.timeout ? AbortSignal.timeout(LOOKUP_TIMEOUT_MS) : undefined;
        result = await json(hunterUrl(typed, shelf), signal ? { signal } : undefined);
      } catch (error) {
        // No connection to the computer (no signal, Tailscale down): answer from the pack.
        if (!pack || !isConnectionError(error)) throw error;
        result = packLookup(pack, typed, shelfGrosze(shelf));
      }
      const item = sessionItemFromResult(result, typed, shelf);
      if (item) setSession(upsertSessionItem(session, item));
      if (request === serial) out.innerHTML = hunterResultMarkup(result, { escapeHtml, money });
      return result;
    } catch {
      if (request === serial) out.innerHTML = '<p class="hunter-message is-bad" role="alert">Nie udało się sprawdzić książki — spróbuj ponownie.</p>';
      return null;
    }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isbn.value.trim()) {
      out.innerHTML = '<p class="hunter-message is-bad" role="alert">Wpisz ISBN, tytuł lub autora książki.</p>';
      isbn.focus();
      return;
    }
    if (!looksLikeIsbn(isbn.value)) {
      // A title: one match is checked at once, several are listed to pick from.
      clearTimeout(searchTimer);
      const found = renderSearch();
      if (found?.rows.length === 1 && !found.more) pick(found.rows[0].isbn);
      else searchBox?.querySelector('[data-hunter-pick]')?.focus();
      return;
    }
    await check();
    // Ready for the next book: the ISBN is selected, the price stays for books at the same price.
    isbn.select();
  });
  const strip = $('#hunterScanStrip');
  const camera = installCamera({ $, onCode: async (code) => {
    isbn.value = code;
    const result = await check();
    if (strip) strip.innerHTML = result ? scanStripMarkup(result, { escapeHtml, money }) : '<p class="hunter-strip is-bad">Brak połączenia — nie sprawdzono tej książki.</p>';
    return result;
  } });
  return {
    focus: () => {
      // Opening Łowca with a connection keeps the offline pack fresh, without waiting for it.
      if (packIsStale(pack) && navigator.onLine !== false) void refreshPack();
      if (!camera.running()) isbn.focus();
    },
    stop: camera.stop,
  };
}

const HTTPS_HINT = 'Aparat działa tylko na bezpiecznym adresie: HTTPS przez Tailscale (na telefonie) albo na tym komputerze. Wpisz ISBN ręcznie.';
const TONES = { good: [[880, 0.09], [1175, 0.12]], known: [[520, 0.07]], unknown: [[220, 0.16]], error: [[220, 0.08], [165, 0.08], [220, 0.08]] };
const VIBRATION = { good: [70, 50, 70], known: [35], unknown: [200], error: [120, 60, 120, 60, 120] };

/** A short sound and vibration after a scan, so the phone can stay on the books, not on the screen. */
function signal(audio, kind) {
  try {
    navigator.vibrate?.(VIBRATION[kind]);
  } catch {
    /* no vibration on this device */
  }
  if (!audio) return;
  let at = audio.currentTime;
  for (const [frequency, length] of TONES[kind]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.18, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + length);
    at += length + 0.03;
  }
}

/**
 * „Skanuj aparatem”: the back camera reads the barcode, every book is checked at once; with
 * „Skanuj ciągle” the camera stays on for the next book (a whole box), otherwise it stops.
 */
function installCamera({ $, onCode }) {
  const toggle = $('#hunterCameraToggle');
  const wrap = $('#hunterVideoWrap');
  const video = $('#hunterVideo');
  const hint = $('#hunterCameraHint');
  const continuous = $('#hunterContinuous');
  let scanner = null;
  let starting = false;
  // Bumped by every stop: a start still waiting for the camera (the permission prompt can take
  // seconds) sees it and turns the camera off instead of leaving it on in a hidden view.
  let generation = 0;
  // Scans are checked one after another: a whole box can be scanned faster than the answers come.
  let queue = Promise.resolve();
  let audio = null;
  const say = (text) => {
    if (!hint) return;
    hint.textContent = text;
    hint.hidden = !text;
  };
  const stop = () => {
    generation += 1;
    scanner?.stop();
    scanner = null;
    if (wrap) wrap.hidden = true;
    if (toggle) {
      toggle.textContent = 'Skanuj aparatem';
      toggle.setAttribute('aria-pressed', 'false');
    }
  };
  if (!toggle || !video) return { stop, running: () => false };
  if (!cameraAvailable()) {
    toggle.disabled = true;
    say(HTTPS_HINT);
    return { stop, running: () => false };
  }
  const start = async () => {
    if (starting) return;
    starting = true;
    try {
      // Sound needs a tap to start on phones: create it on the button press.
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!audio && Audio) audio = new Audio();
      void audio?.resume?.();
      wrap.hidden = false;
      say('Uruchamianie aparatu…');
      const mine = generation;
      const started = await startBarcodeScanner(video, (code) => {
        // Single mode: the first book stops the camera at once, later frames are not checked.
        if (!continuous?.checked) stop();
        queue = queue.then(async () => {
          const result = await onCode(code);
          signal(audio, result ? scanFeedback(result) : 'error');
        });
      });
      if (mine !== generation) {
        started.stop();
        return;
      }
      scanner = started;
      toggle.textContent = 'Zatrzymaj aparat';
      toggle.setAttribute('aria-pressed', 'true');
      say(scanner.native ? 'Nakieruj na kod kreskowy z tyłu książki.' : 'Nakieruj na kod kreskowy i trzymaj go poziomo w ramce.');
    } catch (error) {
      stop();
      say(error?.name === 'NotAllowedError' ? 'Brak zgody na aparat — zezwól na nią w przeglądarce albo wpisz ISBN ręcznie.' : 'Nie udało się włączyć aparatu — wpisz ISBN ręcznie.');
    } finally {
      starting = false;
    }
  };
  toggle.addEventListener('click', () => (scanner ? (stop(), say('')) : void start()));
  // A hidden page keeps no camera on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (scanner || starting)) {
      stop();
      say('');
    }
  });
  return { stop, running: () => Boolean(scanner) };
}
