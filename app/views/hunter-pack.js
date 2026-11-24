// „Łowca bez sieci”: the pack from /api/hunter/pack (hunter-pack.mjs) kept on this device, and the
// answer Łowca gives from it when the computer cannot be reached. The answer has the shape of
// /api/hunter, so the same card, session row and scan signal are used, plus `offline` (the pack's
// date) for the „bez sieci” note. Pure functions except loadPack/savePack (localStorage).

export const PACK_KEY = 'bookflip.hunterPack.v1';
export const PACK_VERSION = 3;
/** An older pack is refreshed in the background when Łowca is opened with a connection. */
export const PACK_STALE_MS = 6 * 60 * 60 * 1000;
export const FLAG = { outside: 1, removed: 2, isbnOffers: 4 };
const CONFIDENCE_LABELS = { high: 'wysoka', medium: 'średnia', low: 'niska' };

/** ISBN-13 (barcode form) of a typed or scanned ISBN-10/13, or null when it is not a valid ISBN. */
export function isbn13(text) {
  const clean = String(text ?? '').replace(/^ISBN(?:-1[03])?:?/i, '').replace(/[\s-]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(clean)) {
    const sum = [...clean.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(clean[12]) ? clean : null;
  }
  if (/^\d{9}[\dX]$/.test(clean)) {
    const sum = [...clean].reduce((total, digit, index) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
    if (sum % 11) return null;
    const stem = '978' + clean.slice(0, 9);
    const check = [...stem].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return stem + ((10 - (check % 10)) % 10);
  }
  return null;
}

/** A stored pack that this version can read, else null. */
export function validPack(pack) {
  // A v2 pack (before authors and series) still answers by ISBN: fields 0–14 are the same.
  return pack && pack.version >= 2 && pack.version <= PACK_VERSION && Array.isArray(pack.entries) && Array.isArray(pack.verdicts) ? pack : null;
}

const indexes = new WeakMap();
function indexOf(pack) {
  let index = indexes.get(pack);
  if (!index) {
    index = new Map(pack.entries.map((entry) => [entry[0], entry]));
    indexes.set(pack, index);
  }
  return index;
}

export function verdictOf(pack, estimate, price) {
  if (!(price > 0) || !(estimate > 0)) return null;
  const ratio = price / estimate;
  const [, verdict, label] = pack.verdicts.find(([max]) => max == null || ratio <= max) ?? pack.verdicts.at(-1);
  return { verdict, label, ratio: Math.round(ratio * 100) / 100 };
}

export function worthUpTo(pack, estimate) {
  if (!(estimate > 0)) return null;
  const zloty = Math.floor((estimate * pack.worthUpToShare) / 100 + 1e-9);
  return zloty >= 1 ? zloty * 100 : null;
}

/**
 * Łowca's answer from the pack. price in grosze or null.
 * @returns {any} the /api/hunter shape with `offline: generatedAt`
 */
export function packLookup(pack, isbnText, price = null) {
  const offline = pack.generatedAt;
  const isbn = isbn13(isbnText);
  if (!isbn) return { found: false, reason: 'invalid_isbn', isbn: null, offline };
  const entry = indexOf(pack).get(isbn);
  if (!entry) return { found: false, reason: 'not_in_catalogue', isbn, offline };
  const [, title, estimate, low, high, confidence, target, inStock, flags, chance, level, medianDays, listedCount, cheapest, offers, authors, publisher, year] = entry;
  const value = estimate == null ? null : { estimate, low, high, confidence, confidenceLabel: CONFIDENCE_LABELS[confidence] || confidence, sold: null };
  const shelf = Number.isFinite(price) && price > 0 ? price : null;
  const common = {
    isbn,
    price: shelf,
    verdict: verdictOf(pack, estimate, shelf),
    worthUpTo: worthUpTo(pack, estimate),
    caution: !value ? 'no_valuation' : confidence === 'low' ? 'low_confidence' : null,
    offline,
  };
  const listed = { count: listedCount, cheapest };
  if (flags & FLAG.outside) return { found: false, reason: 'not_in_catalogue', market: { title, offers, value, listed }, ...common };
  return {
    found: true,
    edition: { id: null, title, authors: authors ? [authors] : [], publisher: publisher ?? null, year: year ?? null },
    value,
    // Only an edition with listings of its own carries a chance (as huntLiquidityLabel expects).
    liquidity: chance == null ? null : { chance, level, medianDays, sales: null, live: null, basis: 'pack' },
    valueBasis: flags & FLAG.isbnOffers ? 'isbn_offers' : 'edition',
    listed,
    target,
    targetMet: target != null && shelf != null && shelf <= target,
    inStock,
    removed: Boolean(flags & FLAG.removed),
    ...common,
  };
}

/** „23.11, 19:40” for the pack's date. */
export function packDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const two = (value) => String(value).padStart(2, '0');
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Status line under the camera controls. */
export function packStatusText(pack, { refreshing = false, failed = false, unsaved = false } = {}) {
  if (refreshing) return 'Pobieranie danych do pracy bez sieci…';
  if (!pack) return failed ? 'Nie udało się pobrać danych do pracy bez sieci.' : 'Dane do pracy bez sieci nie są jeszcze pobrane.';
  const count = pack.entries.length;
  const word = count === 1 ? 'książka' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'książki' : 'książek';
  return `Bez sieci: ${count.toLocaleString('pl-PL')} ${word}, dane z ${packDate(pack.generatedAt)}${failed ? ' (odświeżenie nie udało się)' : ''}${unsaved ? ' — nie zapisano na tym urządzeniu (brak miejsca lub tryb prywatny), zniknie po zamknięciu strony' : ''}.`;
}

/** The pack needs refreshing: none, another version, or older than PACK_STALE_MS. */
export function packIsStale(pack, now = Date.now()) {
  return !pack || pack.version !== PACK_VERSION || !(now - Date.parse(pack.generatedAt) < PACK_STALE_MS);
}

/**
 * A failed request that means "no connection": the network failed (TypeError) or the answer took
 * too long (a hung connection with one bar of signal). A server error with a code is not one.
 */
export function isConnectionError(error) {
  return error instanceof TypeError || error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

/** How long Łowca waits for the computer before answering from the pack. */
export const LOOKUP_TIMEOUT_MS = 6000;

export function loadPack(storage = globalThis.localStorage) {
  try {
    return validPack(JSON.parse(storage.getItem(PACK_KEY)));
  } catch {
    return null;
  }
}

/** true when stored; a full or blocked storage keeps the pack for this page only. */
export function savePack(pack, storage = globalThis.localStorage) {
  try {
    storage.setItem(PACK_KEY, JSON.stringify(pack));
    return true;
  } catch {
    return false;
  }
}
