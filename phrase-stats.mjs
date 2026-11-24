// @ts-check
// "Frazy": what each scan phrase brings and the owner's switch to turn a noisy one off. Statistics
// come from the saved offers (offer_queries) and the current deals; nothing is requested. Turning a
// phrase off is reversible and only affects the SCHEDULED scans (full, quick, sniper): a scan the
// owner types by hand always runs what was typed.
import { listDeals } from './deals.mjs';
import { normalizeSearch } from './search-policy.mjs';

const DAY = 86_400_000;
const KEY = 'scan_disabled_phrases_v1';
/** A phrase with this many new offers in the window and no deal at all is noise. */
export const NOISE_MIN_NEW_OFFERS = 9;
/** Fewer scans than this (distinct days with offers) is too little to judge. */
export const MIN_ACTIVE_DAYS = 3;

/** @param {string} phrase */
const keyOf = (phrase) => normalizeSearch(phrase);

/** The switched-off phrases, as written. @param {{ database: any }} repository @returns {string[]} */
export function disabledPhrases(repository) {
  try {
    const row = repository.database
      .prepare('SELECT value_json FROM app_preferences WHERE key=?')
      .get(KEY);
    const list = row ? JSON.parse(String(row.value_json)) : [];
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Switches a phrase off or on again.
 * @param {{ database: any }} repository
 * @param {string} phrase
 * @param {boolean} disabled
 * @param {{ now?: () => Date }} [options]
 */
export function setPhraseDisabled(repository, phrase, disabled, { now = () => new Date() } = {}) {
  const text = String(phrase ?? '').trim();
  if (!text || text.length > 200) throw Object.assign(Error('INVALID_PHRASE'), { statusCode: 400 });
  const key = keyOf(text);
  const rest = disabledPhrases(repository).filter((item) => keyOf(item) !== key);
  const next = disabled ? [...rest, text] : rest;
  repository.database
    .prepare(
      'INSERT INTO app_preferences(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at',
    )
    .run(KEY, JSON.stringify(next), now().toISOString());
  return { phrase: text, disabled: Boolean(disabled) };
}

/** The phrases a scheduled scan may run: the given ones without the switched-off. */
export function enabledPhrases(
  /** @type {{ database: any }} */ repository,
  /** @type {string[]} */ phrases,
) {
  const off = new Set(disabledPhrases(repository).map(keyOf));
  return phrases.filter((phrase) => !off.has(keyOf(phrase)));
}

/**
 * Per phrase: offers first seen in the last `days`, how many are deals now, the share without an
 * ISBN, the last time it brought an offer and a verdict.
 * @param {{ database: any }} repository
 * @param {{ at?: number, days?: number }} [options]
 */
export function phraseStats(repository, { at = Date.now(), days = 14 } = {}) {
  const database = repository.database;
  const from = new Date(at - days * DAY).toISOString();
  const rows = database
    .prepare(
      `SELECT q.query AS phrase, o.id AS offerId, o.first_seen_at AS firstSeen, o.last_seen_at AS lastSeen,
         coalesce(o.observed_isbn,'') AS isbn
       FROM offer_queries q JOIN offers o ON o.id=q.offer_id`,
    )
    .all();
  const dealOffers = new Set(listDeals(repository, { at }).items.map((deal) => deal.offerId));
  const off = new Set(disabledPhrases(repository).map(keyOf));
  /** @type {Map<string, any>} */
  const stats = new Map();
  for (const row of rows) {
    const key = keyOf(String(row.phrase));
    const entry = stats.get(key) ?? {
      phrase: String(row.phrase),
      offers: 0,
      newOffers: 0,
      deals: 0,
      withoutIsbn: 0,
      lastSeenAt: null,
      days: new Set(),
    };
    stats.set(key, entry);
    entry.offers += 1;
    if (row.lastSeen && (!entry.lastSeenAt || String(row.lastSeen) > entry.lastSeenAt))
      entry.lastSeenAt = String(row.lastSeen);
    if (row.firstSeen && String(row.firstSeen) >= from) {
      entry.newOffers += 1;
      entry.days.add(String(row.firstSeen).slice(0, 10));
      if (!row.isbn) entry.withoutIsbn += 1;
      if (dealOffers.has(String(row.offerId))) entry.deals += 1;
    }
  }
  const items = [...stats.entries()].map(([key, entry]) => {
    const enough = entry.days.size >= MIN_ACTIVE_DAYS;
    const verdict = !enough
      ? 'za_malo_danych'
      : entry.newOffers >= NOISE_MIN_NEW_OFFERS && entry.deals === 0
        ? 'szum'
        : 'ok';
    return {
      phrase: entry.phrase,
      offers: entry.offers,
      newOffers: entry.newOffers,
      deals: entry.deals,
      withoutIsbnShare: entry.newOffers
        ? Math.round((entry.withoutIsbn / entry.newOffers) * 1000) / 1000
        : 0,
      activeDays: entry.days.size,
      lastSeenAt: entry.lastSeenAt,
      verdict,
      disabled: off.has(key),
    };
  });
  // The noisiest first, then by what each brings.
  const order = { szum: 0, ok: 1, za_malo_danych: 2 };
  items.sort(
    (a, b) =>
      Number(a.disabled) - Number(b.disabled) ||
      order[a.verdict] - order[b.verdict] ||
      b.newOffers - a.newOffers ||
      a.phrase.localeCompare(b.phrase),
  );
  return { days, items };
}
