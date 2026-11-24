// @ts-check
// „Strumień” for the sniper: the newest listings of the whole Vinted books category, read through
// the gate like any scan page. A phrase search sees one work per request; the stream sees every new
// book listing at once, so the sniper learns which catalogue works got a listing since its last run
// and asks exactly those phrases first (newest first, the normal scan: language check, ISBN from the
// listing page, deals, alerts). Nothing from the stream is stored: it only picks phrases. A title
// match is never ISBN evidence; it only chooses what to read.
// Measured on the catalogue copy (2026-11-23): 82% of the Vinted offers assigned by ISBN carry every
// word of their work's phrase in the title, and 94% of the assigned offers the filter flags point at
// the right work. Measured live the same evening: about 90 new book listings a minute (501 in 5.4
// min), of which about 0.5% match a catalogue phrase (1 of 192). Reading all of them would take ~20
// pages per 20-minute run, so the stream reads at most STREAM_MAX_PAGES (the last ~3 minutes before
// each run): a sample of the freshest listings, not full coverage.
import { readSourceHtml } from './marketplaces.mjs';
import { learnedPhrases, sniperPhrase } from './market-index.mjs';
import { parseVinted } from './reference-parsers.mjs';
import { fold } from './title-proposals.mjs';

export const STREAM_URL = 'https://www.vinted.pl/catalog/2312-books?order=newest_first';
/** Pages read per run at most (96 listings each; about 3 minutes of new listings). */
export const STREAM_MAX_PAGES = 3;
/** Ids remembered between runs: a page mostly made of them means the reading caught up. */
export const STREAM_SEEN_LIMIT = 1500;
/** The whole stream reading may take this long (a gate cooldown after a refusal can be hours). */
export const STREAM_DEADLINE_MS = 40_000;
/** How often the stream is read while the sniper is on (its own tick, between sniper runs). */
export const STREAM_EVERY_MS = 5 * 60_000;
/** Phrases one stream reading may scan at most. */
export const STREAM_SLOTS = 6;

/** The page URL of the stream. @param {number} page */
export function streamPageUrl(page) {
  return page > 1 ? `${STREAM_URL}&page=${page}` : STREAM_URL;
}

/** Item id from a listing URL („/items/10945535819-…”), or null. @param {unknown} url */
export function itemId(url) {
  const match = String(url ?? '').match(/\/items\/(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Reads stream pages until one is mostly made of listings seen in the previous run (caught up), or
 * STREAM_MAX_PAGES. `readPage(page)` resolves the parsed listings of a page ({ url, title }).
 * Newest-first also brings bumped old listings, so ids are compared as a set, not by size.
 * @param {(page: number) => Promise<{ url: string, title: string }[]>} readPage
 * @param {{ seen?: Iterable<number>, maxPages?: number }} [options]
 */
export async function readStream(readPage, { seen = [], maxPages = STREAM_MAX_PAGES } = {}) {
  const known = new Set(seen);
  /** @type {{ id: number, title: string }[]} */
  const listings = [];
  const ids = new Set();
  let pages = 0;
  let caughtUp = known.size === 0;
  for (let page = 1; page <= maxPages; page++) {
    const rows = await readPage(page);
    pages += 1;
    let old = 0;
    for (const row of rows) {
      const id = itemId(row.url);
      if (id == null || ids.has(id)) continue;
      ids.add(id);
      if (known.has(id)) old += 1;
      else listings.push({ id, title: String(row.title ?? '') });
    }
    // A first run (nothing remembered) reads one page: there is no "since" to catch up to.
    if (!rows.length || caughtUp || old * 2 >= rows.length) {
      caughtUp = true;
      break;
    }
  }
  return {
    listings,
    pages,
    caughtUp,
    // What the next run compares with: this run's ids first, then the older ones, capped.
    seen: [...ids, ...[...known].filter((id) => !ids.has(id))].slice(0, STREAM_SEEN_LIMIT),
  };
}

/**
 * Every catalogue work (not removed, with an edition) as its sniper phrase and the folded words a
 * title must contain, when there are at least two. One-letter words are ignored („I”, „W”).
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function catalogPhrases(repository) {
  const rows = repository.database
    .prepare(
      `SELECT w.id, w.title, w.authors_json AS authors FROM works w
       WHERE NOT EXISTS (SELECT 1 FROM removed_works r WHERE r.work_id=w.id)
         AND EXISTS (SELECT 1 FROM editions e WHERE e.work_id=w.id AND e.is_unknown=0)
       ORDER BY w.rowid`,
    )
    .all();
  /** @type {Map<string, { phrase: string, words: string[] }>} */
  const phrases = new Map();
  const learned = learnedPhrases(repository);
  for (const row of rows) {
    let authors = [];
    try {
      authors = JSON.parse(String(row.authors || '[]'));
    } catch {}
    const phrase = learned.get(String(row.id)) ?? sniperPhrase(String(row.title ?? ''), authors);
    const words = fold(phrase)
      .split(' ')
      .filter((word) => word.length > 1);
    // A one-word phrase (a work titled „Fantasy”, „Pakiet”, „Codex” with no author) matches any
    // listing that uses the word: live, 23.11, „Fantasy” fired on the first stream with a match.
    // Those works stay in the sniper rotation; the stream needs two words.
    if (words.length >= 2 && !phrases.has(fold(phrase)))
      phrases.set(fold(phrase), { phrase, words });
  }
  return [...phrases.values()];
}

/**
 * Phrases of the works new listings point at, newest listing first, each once. A title matches a
 * phrase when it has every word of it; with several matches the longest phrase wins (the most
 * specific work: „Smoki jesiennego zmierzchu” over „Smoki”).
 * @param {{ title: string }[]} listings @param {{ phrase: string, words: string[] }[]} phrases
 */
export function streamPhrases(listings, phrases) {
  /** @type {string[]} */
  const out = [];
  const taken = new Set();
  for (const listing of listings) {
    const words = new Set(fold(listing.title).split(' ').filter(Boolean));
    let best = null;
    for (const candidate of phrases)
      if (
        candidate.words.every((word) => words.has(word)) &&
        (!best || candidate.words.length > best.words.length)
      )
        best = candidate;
    if (best && !taken.has(fold(best.phrase))) {
      taken.add(fold(best.phrase));
      out.push(best.phrase);
    }
  }
  return out;
}

/**
 * A stream page as listings, read through the gate (readSourceHtml) like any Vinted scan page.
 * Every listing is kept here: the catalogue filter is streamPhrases.
 * @param {number} page
 */
export async function vintedStreamPage(
  page,
  {
    read = /** @type {(url: string, options: { source: string, signal?: AbortSignal | null }) => Promise<string>} */ (
      readSourceHtml
    ),
    signal = /** @type {AbortSignal | null | undefined} */ (null),
  } = {},
) {
  const html = await read(streamPageUrl(page), { source: 'Vinted', signal: signal ?? null });
  return parseVinted(
    html,
    { title: '', query: '', accept: () => true },
    new Date().toISOString(),
  ).map((/** @type {any} */ row) => ({ url: String(row.url), title: String(row.title ?? '') }));
}

const SEEN_KEY = 'vinted_stream_seen_v1';

/** @param {{ database: import('node:sqlite').DatabaseSync }} repository @returns {number[]} */
function loadSeen(repository) {
  try {
    const row = repository.database
      .prepare('SELECT value_json FROM app_preferences WHERE key=?')
      .get(SEEN_KEY);
    const data = row ? JSON.parse(String(row.value_json)) : [];
    return Array.isArray(data) ? data.filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

/** @param {{ database: import('node:sqlite').DatabaseSync }} repository @param {number[]} seen */
function saveSeen(repository, seen, at = new Date()) {
  repository.database
    .prepare(
      'INSERT INTO app_preferences(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at',
    )
    .run(SEEN_KEY, JSON.stringify(seen), at.toISOString());
}

/**
 * One stream reading for the sniper: the new listings since the previous run and the catalogue
 * phrases they point at. `readPage(page)` gives the parsed listings of a stream page (through the
 * gate in the app; injected in tests). The remembered ids are saved only after a full reading.
 * `extra`: more phrases a listing may pick (the sniper's universe phrases).
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {(page: number) => Promise<{ url: string, title: string }[]>} readPage
 */
export async function sniperStream(
  repository,
  readPage,
  { now = () => new Date(), extra = /** @type {string[]} */ ([]) } = {},
) {
  const read = await readStream(readPage, { seen: loadSeen(repository) });
  saveSeen(repository, read.seen, now());
  // The owner's universe phrases („Warhammer”) count too; a work's own phrase is longer, so it wins.
  const candidates = [...catalogPhrases(repository)];
  const known = new Set(candidates.map((candidate) => fold(candidate.phrase)));
  for (const phrase of extra) {
    const words = fold(phrase)
      .split(' ')
      .filter((word) => word.length > 1);
    if (words.length && !known.has(fold(phrase))) candidates.push({ phrase, words });
  }
  return {
    phrases: streamPhrases(read.listings, candidates),
    listings: read.listings.length,
    pages: read.pages,
    caughtUp: read.caughtUp,
  };
}
