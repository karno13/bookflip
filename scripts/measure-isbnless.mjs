// Measures how much of the Vinted market the ISBN-only rule leaves blind, and how precise a title
// rule would be as a SUGGESTION (never an assignment): offers without an ISBN, how many have a
// single candidate edition by title, and how often that candidate equals the edition the owner
// confirmed by hand. Read only; works on a COPY of the catalogue (node scripts/backup-catalog.mjs
// <copy>), and refuses the owner's data folder.
//
//   node scripts/measure-isbnless.mjs <copy.sqlite>
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCatalogPath } from '../catalog-data-location.mjs';
import { fold } from '../title-proposals.mjs';

/** An edition title shorter than this says too little to be a candidate. */
export const MIN_TITLE_LENGTH = 8;
/** Below this precision the suggestion is not worth showing (the ISBN-only rule stays). */
export const PRECISION_THRESHOLD = 0.99;

/** @param {string} path @param {string} dataPath */
export function isOwnerData(path, dataPath = defaultCatalogPath()) {
  const target = resolve(path).toLowerCase();
  const folder = dirname(resolve(dataPath)).toLowerCase();
  return target === resolve(dataPath).toLowerCase() || target.startsWith(folder + sep);
}

/** @param {{ prepare: (sql: string) => any }} database */
export function measureIsbnless(database) {
  const sources = database
    .prepare(
      `SELECT source, count(*) AS total,
         sum(CASE WHEN coalesce(observed_isbn,'')='' THEN 1 ELSE 0 END) AS withoutIsbn
       FROM offers GROUP BY source ORDER BY total DESC`,
    )
    .all()
    .map((/** @type {any} */ row) => ({
      source: String(row.source),
      total: Number(row.total),
      withoutIsbn: Number(row.withoutIsbn),
      share: row.total
        ? Math.round((Number(row.withoutIsbn) / Number(row.total)) * 1000) / 1000
        : 0,
    }));
  const editions = database
    .prepare(
      `SELECT e.id AS editionId, e.work_id AS workId, e.title AS title
       FROM editions e WHERE e.is_unknown=0 AND coalesce(e.title,'')<>''`,
    )
    .all()
    .map((/** @type {any} */ row) => ({
      editionId: String(row.editionId),
      workId: String(row.workId),
      folded: fold(row.title),
    }))
    .filter((/** @type {any} */ edition) => edition.folded.length >= MIN_TITLE_LENGTH);
  /** The editions whose title the offer title contains; a candidate only when they are one work. */
  const candidatesOf = (/** @type {string} */ title) => {
    const folded = fold(title);
    const works = new Set();
    const found = [];
    for (const edition of editions)
      if (folded.includes(edition.folded)) {
        works.add(edition.workId);
        found.push(edition);
      }
    return works.size === 1 ? found : [];
  };
  const offers = database
    .prepare(
      `SELECT o.original_title AS title, m.edition_id AS editionId, m.method AS method,
         e.work_id AS workId
       FROM offers o LEFT JOIN offer_matches m ON m.offer_id=o.id AND m.status='active'
         LEFT JOIN editions e ON e.id=m.edition_id
       WHERE coalesce(o.observed_isbn,'')=''`,
    )
    .all();
  let candidates = 0,
    confirmed = 0,
    sameWork = 0,
    sameEdition = 0;
  for (const offer of offers) {
    const found = candidatesOf(String(offer.title));
    if (!found.length) continue;
    candidates += 1;
    // Only the owner's own confirmations count as the truth.
    if (!['manual', 'legacy_manual'].includes(String(offer.method))) continue;
    confirmed += 1;
    if (found[0].workId === String(offer.workId)) sameWork += 1;
    if (found.some((edition) => edition.editionId === String(offer.editionId))) sameEdition += 1;
  }
  const rate = (/** @type {number} */ part) =>
    confirmed ? Math.round((part / confirmed) * 1000) / 1000 : null;
  const precision = rate(sameWork);
  return {
    sources,
    withoutIsbn: offers.length,
    candidates,
    confirmedSample: confirmed,
    workPrecision: precision,
    editionPrecision: rate(sameEdition),
    // Too small a sample says nothing: at least 30 confirmed offers are needed for a verdict.
    verdict:
      confirmed < 30
        ? 'za_mala_proba'
        : (precision ?? 0) >= PRECISION_THRESHOLD
          ? 'tylko_podpowiedz_w_polu_isbn'
          : 'zostaje_isbn_only',
  };
}

/** @param {ReturnType<typeof measureIsbnless>} r */
export function formatReport(r) {
  const pct = (/** @type {number | null} */ v) =>
    v == null ? 'brak danych' : `${(v * 100).toFixed(1)}%`;
  return [
    'Oferty bez ISBN wg źródła:',
    ...r.sources.map((s) => `  ${s.source}: ${s.withoutIsbn} z ${s.total} (${pct(s.share)})`),
    `Razem bez ISBN: ${r.withoutIsbn}; z jednoznacznym kandydatem po tytule: ${r.candidates}.`,
    `Próba potwierdzona ręcznie: ${r.confirmedSample}; trafność dzieła: ${pct(r.workPrecision)}, wydania: ${pct(r.editionPrecision)}.`,
    `Werdykt: ${r.verdict} (próg ${PRECISION_THRESHOLD * 100}%; to tylko podpowiedź, nigdy przypisanie).`,
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('Użycie: node scripts/measure-isbnless.mjs <kopia.sqlite>');
    process.exit(2);
  }
  if (isOwnerData(path)) {
    console.error(
      'Odmowa: to jest folder danych właściciela. Zrób kopię: node scripts/backup-catalog.mjs <kopia.sqlite>',
    );
    process.exit(2);
  }
  const database = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    console.log(formatReport(measureIsbnless(database)));
  } finally {
    database.close();
  }
}
