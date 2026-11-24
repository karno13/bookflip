// @ts-check
// Sub-labels (podetykiety, migration 148) inside one label collection: the owner creates, renames and
// deletes them and moves books between them. A book of the label is in at most one sub-label
// (`work_labels.group_id`; NULL = the main list); position and volume are not touched. Deleting a
// sub-label returns its books to the main list. Organisation only.
import { clean, fail, labelKey, MAX_LENGTH } from './catalog-labels.mjs';
import { need } from './label-collections.mjs';

/** @typedef {{ database: import('node:sqlite').DatabaseSync, transaction: Function }} Repo */

const MAX_GROUPS = 50;

function validName(value) {
  const name = clean(value);
  if (!name || name.length > MAX_LENGTH || !labelKey(name)) fail('INVALID_GROUP_NAME');
  return name;
}
function needGroup(database, key, id) {
  const row = database
    .prepare('SELECT id, name FROM label_groups WHERE id=? AND normalized_label=?')
    .get(Number(id), key);
  return row ?? fail('GROUP_NOT_FOUND', 404);
}

/** The sub-labels of a label with the number of books each holds, in the owner's order. */
export function labelGroups(database, key) {
  return database
    .prepare(
      `SELECT g.id, g.name, (SELECT count(*) FROM work_labels l WHERE l.group_id=g.id
         AND NOT EXISTS (SELECT 1 FROM removed_works rw WHERE rw.work_id=l.work_id)) AS works
       FROM label_groups g WHERE g.normalized_label=? ORDER BY g.position, g.id`,
    )
    .all(key)
    .map((row) => ({ id: Number(row.id), name: String(row.name), works: Number(row.works) }));
}

/** @param {Repo} repository */
export function createGroup(repository, labelName, input = {}, { now = () => new Date() } = {}) {
  const database = repository.database;
  const found = need(database, labelName);
  const name = validName(input.name);
  if (labelGroups(database, found.key).length >= MAX_GROUPS) fail('TOO_MANY_GROUPS');
  if (
    database
      .prepare('SELECT 1 FROM label_groups WHERE normalized_label=? AND normalized_name=?')
      .get(found.key, labelKey(name))
  )
    fail('GROUP_EXISTS', 409);
  const next = database
    .prepare('SELECT coalesce(max(position),0)+1 AS n FROM label_groups WHERE normalized_label=?')
    .get(found.key);
  const result = database
    .prepare(
      'INSERT INTO label_groups(normalized_label, name, normalized_name, position, created_at) VALUES (?,?,?,?,?)',
    )
    .run(found.key, name, labelKey(name), Number(next?.n), now().toISOString());
  return { id: Number(result.lastInsertRowid), name, works: 0 };
}

/** @param {Repo} repository */
export function renameGroup(repository, labelName, groupId, input = {}) {
  const database = repository.database;
  const found = need(database, labelName);
  const group = needGroup(database, found.key, groupId);
  const name = validName(input.name);
  const same = database
    .prepare('SELECT id FROM label_groups WHERE normalized_label=? AND normalized_name=? AND id<>?')
    .get(found.key, labelKey(name), group.id);
  if (same) fail('GROUP_EXISTS', 409);
  database
    .prepare('UPDATE label_groups SET name=?, normalized_name=? WHERE id=?')
    .run(name, labelKey(name), group.id);
  return { id: Number(group.id), name };
}

/**
 * Deletes a sub-label; its books return to the main list of the label (they are never deleted).
 * @param {Repo} repository
 */
export function deleteGroup(repository, labelName, groupId) {
  const database = repository.database;
  const found = need(database, labelName);
  const group = needGroup(database, found.key, groupId);
  let released = 0;
  repository.transaction(() => {
    released = Number(
      database.prepare('UPDATE work_labels SET group_id=NULL WHERE group_id=?').run(group.id)
        .changes,
    );
    database.prepare('DELETE FROM label_groups WHERE id=?').run(group.id);
  });
  return { deleted: true, released };
}

/**
 * Puts books of the label into a sub-label, or (groupId null) back into the main list.
 * Every book must be in the label.
 * @param {Repo} repository
 */
export function assignToGroup(repository, labelName, input = {}) {
  const database = repository.database;
  const found = need(database, labelName);
  const ids = [...new Set((Array.isArray(input.workIds) ? input.workIds : []).map(String))];
  if (!ids.length || ids.length > 500) fail('INVALID_WORK_IDS');
  const groupId =
    input.groupId === null || input.groupId === undefined
      ? null
      : Number(needGroup(database, found.key, input.groupId).id);
  repository.transaction(() => {
    const set = database.prepare(
      'UPDATE work_labels SET group_id=? WHERE work_id=? AND normalized_label=?',
    );
    for (const id of ids) if (!set.run(groupId, id, found.key).changes) fail('NOT_IN_LABEL', 404);
  });
  return { groupId, assigned: ids.length };
}

/**
 * Merge helper (label-collections.mjs): the sub-labels of the old label move to the target label
 * (a name the target already has is reused). Returns old group id -> target group id.
 * @param {Repo['database']} database
 */
export function moveGroups(database, oldKey, targetKey) {
  const map = new Map();
  const rows = database
    .prepare(
      'SELECT id, normalized_name FROM label_groups WHERE normalized_label=? ORDER BY position, id',
    )
    .all(oldKey);
  for (const row of rows) {
    const same = database
      .prepare('SELECT id FROM label_groups WHERE normalized_label=? AND normalized_name=?')
      .get(targetKey, row.normalized_name);
    if (same) {
      map.set(Number(row.id), Number(same.id));
      continue;
    }
    const next = database
      .prepare('SELECT coalesce(max(position),0)+1 AS n FROM label_groups WHERE normalized_label=?')
      .get(targetKey);
    database
      .prepare('UPDATE label_groups SET normalized_label=?, position=? WHERE id=?')
      .run(targetKey, Number(next?.n), row.id);
    map.set(Number(row.id), Number(row.id));
  }
  return map;
}
