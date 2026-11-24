// @ts-check
// Etykiety as collections (migration 143): a label is created empty, renamed, merged, deleted, and
// keeps its books in the owner's order with an optional volume number. The owner's own
// organisation only: manual, never identification evidence. A label's books are rows of
// `work_labels` (position 1..n per label); the registry of names is the table `labels`.
import { setPriceTarget } from './price-targets.mjs';
import { labelGroups, moveGroups } from './label-groups.mjs';
import { attach, clean, fail, labelKey, MAX_LABELS, MAX_LENGTH } from './catalog-labels.mjs';

/** @typedef {{ database: import('node:sqlite').DatabaseSync, transaction: Function }} Repo */

function validName(value) {
  const name = clean(value);
  if (!name || name.length > MAX_LENGTH || !labelKey(name)) fail('INVALID_LABEL_NAME');
  return name;
}
function validVolume(value) {
  if (value === null || value === undefined || value === '') return null;
  const volume = Number(value);
  if (!Number.isSafeInteger(volume) || volume < 1 || volume > 10000) fail('INVALID_VOLUME');
  return volume;
}
/** The label by name (any spelling), from the registry or from its books; null when unknown. */
function findLabel(database, name) {
  const key = labelKey(clean(name));
  if (!key) return null;
  const row =
    database.prepare('SELECT label FROM labels WHERE normalized_label=?').get(key) ??
    database
      .prepare(
        'SELECT min(label) AS label FROM work_labels WHERE normalized_label=? HAVING count(*)>0',
      )
      .get(key);
  return row ? { key, label: String(row.label) } : null;
}
export const need = (database, name) => findLabel(database, name) ?? fail('LABEL_NOT_FOUND', 404);
const members = (database, key) =>
  database
    .prepare(
      'SELECT work_id FROM work_labels WHERE normalized_label=? ORDER BY position, created_at, rowid',
    )
    .all(key)
    .map((row) => String(row.work_id));
/** Positions become 1..n in the given (default: current) order. */
function renumber(database, key, order = members(database, key)) {
  const set = database.prepare(
    'UPDATE work_labels SET position=? WHERE normalized_label=? AND work_id=?',
  );
  order.forEach((id, index) => set.run(index + 1, key, id));
}

/**
 * Creates an empty label.
 * @param {Repo} repository
 */
export function createLabel(repository, input = {}, { now = () => new Date() } = {}) {
  const label = validName(input.name);
  if (findLabel(repository.database, label)) fail('LABEL_EXISTS', 409);
  repository.database
    .prepare('INSERT INTO labels(normalized_label, label, created_at) VALUES (?,?,?)')
    .run(labelKey(label), label, now().toISOString());
  return { label, works: 0 };
}

/**
 * Renames a label; its books, their order and numbers stay. A name that another label already has
 * is refused (409) unless `merge` is set: then the books join the end of that label.
 * @param {Repo} repository
 */
export function renameLabel(repository, current, input = {}, { now = () => new Date() } = {}) {
  const database = repository.database;
  const old = need(database, current);
  const label = validName(input.name);
  const key = labelKey(label);
  const target = key === old.key ? null : findLabel(database, label);
  if (target && input.merge !== true) fail('LABEL_EXISTS', 409);
  const at = now().toISOString();
  repository.transaction(() => {
    if (!target) {
      const registered = database
        .prepare('SELECT 1 FROM labels WHERE normalized_label=?')
        .get(old.key);
      if (registered)
        database
          .prepare('UPDATE labels SET normalized_label=?, label=? WHERE normalized_label=?')
          .run(key, label, old.key);
      else
        database
          .prepare('INSERT INTO labels(normalized_label, label, created_at) VALUES (?,?,?)')
          .run(key, label, at);
      database
        .prepare('UPDATE work_labels SET label=?, normalized_label=? WHERE normalized_label=?')
        .run(label, key, old.key);
      database
        .prepare('UPDATE label_groups SET normalized_label=? WHERE normalized_label=?')
        .run(key, old.key);
      return;
    }
    // Merge: the books of the old label that the target lacks follow its last book.
    // Gaps in the target's order are closed first, so the new books really come last.
    renumber(database, target.key);
    const have = new Set(members(database, target.key));
    const groupIds = moveGroups(database, old.key, target.key);
    const groupOf = database.prepare(
      'SELECT group_id FROM work_labels WHERE normalized_label=? AND work_id=?',
    );
    const move = database.prepare(
      'UPDATE work_labels SET label=?, normalized_label=?, position=?, group_id=? WHERE normalized_label=? AND work_id=?',
    );
    let position = have.size;
    for (const id of members(database, old.key))
      if (!have.has(id)) {
        const own = groupOf.get(old.key, id);
        const group = own?.group_id == null ? null : (groupIds.get(Number(own.group_id)) ?? null);
        move.run(target.label, target.key, ++position, group, old.key, id);
      }
    database.prepare('DELETE FROM work_labels WHERE normalized_label=?').run(old.key);
    database.prepare('DELETE FROM labels WHERE normalized_label=?').run(old.key);
    database.prepare('DELETE FROM label_groups WHERE normalized_label=?').run(old.key);
    renumber(database, target.key);
  });
  const final = target ?? { key, label };
  return {
    label: final.label,
    works: members(database, final.key).length,
    merged: Boolean(target),
  };
}

/**
 * Deletes a label; its books stay in the catalogue.
 * @param {Repo} repository
 */
export function deleteLabel(repository, name) {
  const database = repository.database;
  const found = need(database, name);
  const works = members(database, found.key).length;
  repository.transaction(() => {
    database.prepare('DELETE FROM work_labels WHERE normalized_label=?').run(found.key);
    database.prepare('DELETE FROM labels WHERE normalized_label=?').run(found.key);
    database.prepare('DELETE FROM label_groups WHERE normalized_label=?').run(found.key);
  });
  return { deleted: true, works };
}

/**
 * The books of a label in the owner's order.
 * @param {Repo} repository
 */
export function labelBooks(repository, name) {
  const database = repository.database;
  const found = need(database, name);
  const rows = database
    .prepare(
      `SELECT w.id, w.title, w.authors_json, l.volume, l.group_id FROM work_labels l JOIN works w ON w.id=l.work_id
       WHERE l.normalized_label=? AND NOT EXISTS (SELECT 1 FROM removed_works rw WHERE rw.work_id=l.work_id)
       ORDER BY l.position, l.created_at, l.rowid`,
    )
    .all(found.key);
  return {
    label: found.label,
    groups: labelGroups(database, found.key),
    works: rows.map((row, index) => ({
      id: String(row.id),
      title: String(row.title),
      authors: JSON.parse(String(row.authors_json || '[]')),
      position: index + 1,
      volume: row.volume == null ? null : Number(row.volume),
      groupId: row.group_id == null ? null : Number(row.group_id),
    })),
  };
}

/**
 * Adds books at the end of a label (already in it: left where they are).
 * @param {Repo} repository
 */
export function addToLabel(repository, name, input = {}, { now = () => new Date() } = {}) {
  const database = repository.database;
  const found = need(database, name);
  const ids = [...new Set((Array.isArray(input.workIds) ? input.workIds : []).map(String))];
  if (!ids.length || ids.length > 500) fail('INVALID_WORK_IDS');
  const volume = ids.length === 1 ? validVolume(input.volume) : null;
  const at = now().toISOString();
  let added = 0;
  repository.transaction(() => {
    for (const id of ids) {
      if (!database.prepare('SELECT 1 FROM works WHERE id=?').get(id)) fail('WORK_NOT_FOUND', 404);
      if (
        database
          .prepare('SELECT 1 FROM work_labels WHERE work_id=? AND normalized_label=?')
          .get(id, found.key)
      )
        continue;
      const own = database.prepare('SELECT count(*) AS n FROM work_labels WHERE work_id=?').get(id);
      if (Number(own?.n) >= MAX_LABELS) fail('TOO_MANY_LABELS');
      attach(database, id, found.label, found.key, at, volume);
      added += 1;
    }
  });
  return { label: found.label, added };
}

/**
 * Takes a book out of a label (only out of that one).
 * @param {Repo} repository
 */
export function removeFromLabel(repository, name, workId) {
  const database = repository.database;
  const found = need(database, name);
  repository.transaction(() => {
    const result = database
      .prepare('DELETE FROM work_labels WHERE work_id=? AND normalized_label=?')
      .run(workId, found.key);
    if (!result.changes) fail('NOT_IN_LABEL', 404);
    renumber(database, found.key);
  });
  return { removed: true };
}

/**
 * Saves the order of a label: the listed books come first in that order, books not listed (hidden
 * ones) follow. Every listed book must be in the label.
 * @param {Repo} repository
 */
export function reorderLabel(repository, name, input = {}) {
  const database = repository.database;
  const found = need(database, name);
  const ids = [...new Set((Array.isArray(input.workIds) ? input.workIds : []).map(String))];
  const current = members(database, found.key);
  if (!ids.length || ids.some((id) => !current.includes(id))) fail('INVALID_ORDER');
  repository.transaction(() =>
    renumber(database, found.key, [...ids, ...current.filter((id) => !ids.includes(id))]),
  );
  return labelBooks(repository, name);
}

/**
 * Sets or clears the volume number of one book in a label.
 * @param {Repo} repository
 */
export function setLabelVolume(repository, name, workId, input = {}) {
  const database = repository.database;
  const found = need(database, name);
  const volume = validVolume(input.volume);
  const result = database
    .prepare('UPDATE work_labels SET volume=? WHERE work_id=? AND normalized_label=?')
    .run(volume, workId, found.key);
  if (!result.changes) fail('NOT_IN_LABEL', 404);
  return { workId, volume };
}

/**
 * Once at start: every own series (work-series-api.mjs) becomes a label of the same name, its books
 * ordered by volume number (without a number: after them, by title). The series stay untouched
 * (undo = delete the label); a book already in the label keeps its place.
 * @param {Repo} repository
 */
export function copySeriesToLabels(repository, { now = () => new Date() } = {}) {
  const database = repository.database;
  const at = now().toISOString();
  // One key everywhere: the key of the name as it will be stored (cleaned, at most 60 characters).
  const keyOf = (raw) => labelKey(clean(raw).slice(0, MAX_LENGTH));
  const names = new Map();
  let merged = 0; // different series whose names share the first 60 characters: one label, counted
  const note = (raw) => {
    const key = keyOf(raw);
    if (!names.has(key)) names.set(key, String(raw));
    else if (clean(names.get(key)) !== clean(raw)) merged += 1;
  };
  for (const row of database.prepare('SELECT name FROM own_series').all()) note(row.name);
  for (const row of database.prepare('SELECT DISTINCT series FROM work_series_annotations').all())
    note(row.series);
  const annotated = database
    .prepare(
      `SELECT a.work_id, a.series, a.volume FROM work_series_annotations a JOIN works w ON w.id=a.work_id
       ORDER BY a.volume IS NULL, a.volume, w.title`,
    )
    .all();
  let labels = 0;
  let books = 0;
  for (const [key, raw] of names) {
    const name = clean(raw).slice(0, MAX_LENGTH);
    if (!key || !name) continue;
    const found = findLabel(database, name);
    if (!found) {
      database
        .prepare('INSERT INTO labels(normalized_label, label, created_at) VALUES (?,?,?)')
        .run(key, name, at);
      labels += 1;
    }
    for (const row of annotated.filter((item) => keyOf(item.series) === key)) {
      const id = String(row.work_id);
      if (
        database
          .prepare('SELECT 1 FROM work_labels WHERE work_id=? AND normalized_label=?')
          .get(id, key)
      )
        continue;
      const own = database.prepare('SELECT count(*) AS n FROM work_labels WHERE work_id=?').get(id);
      if (Number(own?.n) >= MAX_LABELS) continue;
      attach(
        database,
        id,
        found?.label ?? name,
        found?.key ?? key,
        at,
        row.volume == null ? null : Number(row.volume),
      );
      books += 1;
    }
  }
  return { labels, books, merged };
}

/**
 * „Kupuję do … zł” for every book of a label at once: the same work targets as price-targets.mjs
 * (Polish editions of each book), set one by one, no extra storage. A target the owner set on a
 * book earlier is replaced by this price; the edition targets stay. maxPrice in grosze.
 * @param {Repo} repository
 */
export function setLabelPriceTarget(repository, name, input = {}, { now = () => new Date() } = {}) {
  const found = need(repository.database, name);
  const ids = labelBooks(repository, found.label).works.map((work) => work.id);
  if (!ids.length) fail('LABEL_EMPTY');
  repository.transaction(() => {
    for (const id of ids)
      setPriceTarget(repository, { workId: id, maxPrice: Number(input.maxPrice) }, { now });
  });
  return { label: found.label, works: ids.length, maxPrice: Number(input.maxPrice) };
}
