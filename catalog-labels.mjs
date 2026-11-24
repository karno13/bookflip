// @ts-check
// Etykiety: the owner's own marks on a book ("Gaunt", "do sprawdzenia", "komplet"). Any text, up to
// 20 per book; one label is one mark whatever the case or accents ("Gaunt" = "gaunt"). The works
// list filters by a label (catalog-api.mjs). Since migration 143 a label is also a collection (see
// label-collections.mjs): it exists on its own (table `labels`) and keeps its books in the owner's
// order (`work_labels.position`). Display and organisation only: never identification evidence.
import { fold } from './title-proposals.mjs';

export const MAX_LABELS = 20;
export const MAX_LENGTH = 60;
export const fail = (code, statusCode = 400) => {
  throw Object.assign(Error(code), { statusCode });
};

/** "  Duchy   Gaunta " → "Duchy Gaunta"; the key ignores case and accents. */
export const labelKey = (label) => fold(label).slice(0, MAX_LENGTH);
export const clean = (label) =>
  String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Every label with its number of books, most used first.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function listLabels(repository) {
  const rows = repository.database
    .prepare(
      `SELECT k.key, k.label, count(l.work_id) AS works FROM (
         SELECT normalized_label AS key, label FROM labels
         UNION SELECT normalized_label, min(label) FROM work_labels
           WHERE normalized_label NOT IN (SELECT normalized_label FROM labels) GROUP BY normalized_label
       ) k LEFT JOIN work_labels l ON l.normalized_label=k.key
         AND NOT EXISTS (SELECT 1 FROM removed_works rw WHERE rw.work_id=l.work_id)
       GROUP BY k.key ORDER BY works DESC, k.label`,
    )
    .all();
  return {
    items: rows.map((row) => ({ label: String(row.label), works: Number(row.works) })),
  };
}

/**
 * The labels of one book, in the order they were added.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {string} workId
 */
export function workLabels(repository, workId) {
  return repository.database
    .prepare('SELECT label FROM work_labels WHERE work_id=? ORDER BY created_at, label')
    .all(workId)
    .map((row) => String(row.label));
}

/** Puts a label on a book, at the end of the label's order; the label is registered if new. */
export function attach(database, workId, label, key, at, volume = null) {
  database
    .prepare('INSERT OR IGNORE INTO labels(normalized_label, label, created_at) VALUES (?,?,?)')
    .run(key, label, at);
  const next = database
    .prepare('SELECT coalesce(max(position),0)+1 AS n FROM work_labels WHERE normalized_label=?')
    .get(key);
  database
    .prepare(
      'INSERT INTO work_labels(work_id, label, normalized_label, created_at, position, volume) VALUES (?,?,?,?,?,?)',
    )
    .run(workId, label, key, at, Number(next.n), volume);
}

/**
 * Replaces the labels of a book. A label already used elsewhere keeps its first spelling.
 * @param {{ database: import('node:sqlite').DatabaseSync, transaction: Function }} repository
 * @param {string} workId
 * @param {unknown} labels
 */
export function setWorkLabels(repository, workId, labels, { now = () => new Date() } = {}) {
  const database = repository.database;
  if (!database.prepare('SELECT 1 FROM works WHERE id=?').get(workId)) fail('WORK_NOT_FOUND', 404);
  if (!Array.isArray(labels)) return fail('INVALID_LABELS');
  const wanted = new Map();
  for (const raw of /** @type {unknown[]} */ (labels)) {
    const label = clean(raw);
    if (!label) continue;
    if (label.length > MAX_LENGTH) fail('LABEL_TOO_LONG');
    if (!wanted.has(labelKey(label))) wanted.set(labelKey(label), label);
  }
  if (wanted.size > MAX_LABELS) fail('TOO_MANY_LABELS');
  const spelling = database.prepare(
    'SELECT label FROM labels WHERE normalized_label=? UNION ALL SELECT label FROM work_labels WHERE normalized_label=? LIMIT 1',
  );
  const at = now().toISOString();
  repository.transaction(() => {
    const kept = new Set(
      database
        .prepare('SELECT normalized_label AS key FROM work_labels WHERE work_id=?')
        .all(workId)
        .map((row) => String(row.key)),
    );
    for (const key of kept)
      if (!wanted.has(key))
        database
          .prepare('DELETE FROM work_labels WHERE work_id=? AND normalized_label=?')
          .run(workId, key);
    // The labels that lost this book close the gap in their order (positions 1..n).
    for (const key of kept)
      if (!wanted.has(key)) {
        const rest = database
          .prepare(
            'SELECT work_id FROM work_labels WHERE normalized_label=? ORDER BY position, created_at, rowid',
          )
          .all(key);
        const set = database.prepare(
          'UPDATE work_labels SET position=? WHERE normalized_label=? AND work_id=?',
        );
        rest.forEach((row, index) => set.run(index + 1, key, String(row.work_id)));
      }
    for (const [key, label] of wanted)
      if (!kept.has(key))
        attach(database, workId, String(spelling.get(key, key)?.label ?? label), key, at);
  });
  return { workId, labels: workLabels(repository, workId) };
}

/**
 * Ids of the books that carry a label (any spelling).
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {string} label
 */
/** The filter value for books without any label („Bez etykiety”). */
export const NO_LABEL = '__none__';

export function labelWorkIds(repository, label) {
  const key = labelKey(clean(label));
  if (!key) return [];
  return repository.database
    .prepare('SELECT work_id FROM work_labels WHERE normalized_label=?')
    .all(key)
    .map((row) => String(row.work_id));
}

/**
 * Labels of many books at once (a list page): Map work id → labels.
 * @param {import('node:sqlite').DatabaseSync} database
 * @param {string[]} workIds
 */
export function labelsOfWorks(database, workIds) {
  const result = new Map();
  if (!workIds.length) return result;
  for (const row of database
    .prepare(
      'SELECT work_id, label FROM work_labels WHERE work_id IN (SELECT value FROM json_each(?)) ORDER BY created_at, label',
    )
    .all(JSON.stringify(workIds))) {
    const id = String(row.work_id);
    result.set(id, [...(result.get(id) ?? []), String(row.label)]);
  }
  return result;
}
