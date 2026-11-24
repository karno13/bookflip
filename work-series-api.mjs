// @ts-check
// Series are user annotations, not automatically validated bibliographic facts. A book belongs to
// at most one series (work_series_annotations), with a volume number when it is known. The owner
// can also create a series first and add books to it later (own_series): such a series shows in
// „Serie” even while empty, under its group ("Warhammer") or as a group of its own.
import { fold } from './title-proposals.mjs';
import { labelWorkIds } from './catalog-labels.mjs';

const MAX_NAME = 120;
const fail = (code, statusCode = 400) => {
  throw Object.assign(Error(code), { statusCode });
};
const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
/** The key of a series name: case, accents and punctuation do not matter. */
export const seriesKey = (name) => fold(name);
function validName(value) {
  const name = clean(value);
  if (!name || name.length > MAX_NAME || !seriesKey(name)) fail('INVALID_SERIES_NAME');
  return name;
}
function validVolume(value) {
  if (value === null || value === undefined || value === '') return null;
  const volume = Number(value);
  if (!Number.isSafeInteger(volume) || volume < 1 || volume > 10000) fail('INVALID_SERIES_VOLUME');
  return volume;
}

export function listWorkSeries(repository) {
  return repository.database
    .prepare(
      'SELECT work_id AS workId, series, volume FROM work_series_annotations ORDER BY series, volume',
    )
    .all();
}

export function updateWorkSeries(repository, workId, input) {
  if (typeof workId !== 'string' || !workId || workId.length > 200)
    throw Object.assign(Error('INVALID_WORK_ID'), { statusCode: 400 });
  const exists = repository.database.prepare('SELECT id FROM works WHERE id = ?').get(workId);
  if (!exists) throw Object.assign(Error('WORK_NOT_FOUND'), { statusCode: 404 });
  const name = typeof input?.series === 'string' ? input.series.trim() : '';
  const volume = input?.volume;
  if (!name && (volume === null || volume === undefined || volume === '')) {
    repository.database
      .prepare('DELETE FROM work_series_annotations WHERE work_id = ?')
      .run(workId);
    return { workId, series: null, volume: null };
  }
  // The volume may be left out: the book is in the series, its number comes later.
  if (
    !name ||
    name.length > MAX_NAME ||
    (volume != null && (!Number.isSafeInteger(volume) || volume < 1 || volume > 10000))
  )
    throw Object.assign(Error('INVALID_SERIES_ANNOTATION'), { statusCode: 400 });
  repository.database
    .prepare(
      `INSERT INTO work_series_annotations (work_id,series,volume,updated_at)
     VALUES (?,?,?,?) ON CONFLICT(work_id) DO UPDATE SET
     series=excluded.series,volume=excluded.volume,updated_at=excluded.updated_at`,
    )
    .run(workId, name, volume ?? null, new Date().toISOString());
  return { workId, series: name, volume: volume ?? null };
}

/**
 * The owner's series with their group and number of books.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function listOwnSeries(repository) {
  const database = repository.database;
  const counts = new Map();
  for (const row of database.prepare('SELECT series FROM work_series_annotations').all()) {
    const key = seriesKey(row.series);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    items: database
      .prepare('SELECT normalized_name AS key, name, grouping FROM own_series ORDER BY name')
      .all()
      .map((row) => ({
        name: String(row.name),
        grouping: row.grouping == null ? null : String(row.grouping),
        works: counts.get(String(row.key)) ?? 0,
      })),
  };
}

/** @param {{ database: import('node:sqlite').DatabaseSync }} repository */
export function ownSeriesMap(repository) {
  return new Map(
    repository.database
      .prepare('SELECT normalized_name AS key, name, grouping FROM own_series')
      .all()
      .map((row) => [
        String(row.key),
        { name: String(row.name), grouping: row.grouping == null ? null : String(row.grouping) },
      ]),
  );
}

/**
 * Creates a series; books can be added at once (`workIds`).
 * @param {{ database: import('node:sqlite').DatabaseSync, transaction: Function }} repository
 */
export function createOwnSeries(repository, input = {}, { now = () => new Date() } = {}) {
  const name = validName(input.name);
  const grouping = clean(input.grouping) || null;
  if (grouping && grouping.length > 100) fail('INVALID_SERIES_GROUP');
  const key = seriesKey(name);
  const database = repository.database;
  if (database.prepare('SELECT 1 FROM own_series WHERE normalized_name=?').get(key))
    fail('SERIES_EXISTS', 409);
  const at = now().toISOString();
  return repository.transaction(() => {
    database
      .prepare(
        'INSERT INTO own_series(normalized_name, name, grouping, created_at, updated_at) VALUES (?,?,?,?,?)',
      )
      .run(key, name, grouping, at, at);
    // From a label: every book that carries it.
    const workIds = input.label ? labelWorkIds(repository, String(input.label)) : input.workIds;
    const added =
      Array.isArray(workIds) && workIds.length
        ? addToSeries(repository, name, { workIds, move: input.move === true }, { now })
        : { added: 0, inOtherSeries: [] };
    return { name, grouping, ...added };
  });
}

/**
 * Renames a series (its books follow) or changes its group. Works for every series with books,
 * also one typed in „Seria i tom”; the group only for a series the owner created.
 * @param {{ database: import('node:sqlite').DatabaseSync, transaction: Function }} repository
 */
export function updateOwnSeries(
  repository,
  currentName,
  input = {},
  { now = () => new Date() } = {},
) {
  const database = repository.database;
  const oldKey = seriesKey(currentName);
  const name = input.name === undefined ? clean(currentName) : validName(input.name);
  const key = seriesKey(name);
  const own = database.prepare('SELECT * FROM own_series WHERE normalized_name=?').get(oldKey);
  const members = database
    .prepare('SELECT work_id, series FROM work_series_annotations')
    .all()
    .filter((row) => seriesKey(row.series) === oldKey);
  if (!own && !members.length) fail('SERIES_NOT_FOUND', 404);
  if (
    key !== oldKey &&
    database.prepare('SELECT 1 FROM own_series WHERE normalized_name=?').get(key)
  )
    fail('SERIES_EXISTS', 409);
  const grouping =
    input.grouping === undefined ? (own?.grouping ?? null) : clean(input.grouping) || null;
  const at = now().toISOString();
  repository.transaction(() => {
    if (own)
      database
        .prepare(
          'UPDATE own_series SET normalized_name=?, name=?, grouping=?, updated_at=? WHERE normalized_name=?',
        )
        .run(key, name, grouping, at, oldKey);
    else if (input.grouping !== undefined)
      database
        .prepare(
          'INSERT INTO own_series(normalized_name, name, grouping, created_at, updated_at) VALUES (?,?,?,?,?)',
        )
        .run(key, name, grouping, at, at);
    const rename = database.prepare(
      'UPDATE work_series_annotations SET series=?, updated_at=? WHERE work_id=?',
    );
    for (const row of members) rename.run(name, at, row.work_id);
  });
  return { name, grouping, works: members.length };
}

/**
 * Deletes a series: its books leave it (they stay in the catalogue).
 * @param {{ database: import('node:sqlite').DatabaseSync, transaction: Function }} repository
 */
export function deleteOwnSeries(repository, name) {
  const database = repository.database;
  const key = seriesKey(name);
  const members = database
    .prepare('SELECT work_id, series FROM work_series_annotations')
    .all()
    .filter((row) => seriesKey(row.series) === key);
  const own = database.prepare('SELECT 1 FROM own_series WHERE normalized_name=?').get(key);
  if (!own && !members.length) fail('SERIES_NOT_FOUND', 404);
  repository.transaction(() => {
    database.prepare('DELETE FROM own_series WHERE normalized_name=?').run(key);
    const remove = database.prepare('DELETE FROM work_series_annotations WHERE work_id=?');
    for (const row of members) remove.run(row.work_id);
  });
  return { deleted: true, works: members.length };
}

/**
 * Adds books to a series. A book already in another series stays there unless `move` is set:
 * it is reported, not moved silently. A single book can get its volume number at once.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function addToSeries(repository, name, input = {}, { now = () => new Date() } = {}) {
  const series = validName(name);
  const key = seriesKey(series);
  const database = repository.database;
  const source = input.label ? labelWorkIds(repository, String(input.label)) : input.workIds;
  const ids = [...new Set((Array.isArray(source) ? source : []).map(String))];
  if (!ids.length || ids.length > 500) fail('INVALID_WORK_IDS');
  const volume = ids.length === 1 ? validVolume(input.volume) : null;
  const work = database.prepare('SELECT id FROM works WHERE id=?');
  const current = database.prepare(
    'SELECT series, volume FROM work_series_annotations WHERE work_id=?',
  );
  const save = database.prepare(
    `INSERT INTO work_series_annotations (work_id,series,volume,updated_at) VALUES (?,?,?,?)
     ON CONFLICT(work_id) DO UPDATE SET series=excluded.series, volume=excluded.volume, updated_at=excluded.updated_at`,
  );
  const at = now().toISOString();
  let added = 0;
  const inOtherSeries = [];
  for (const id of ids) {
    if (!work.get(id)) fail('WORK_NOT_FOUND', 404);
    const existing = current.get(id);
    const same = existing && seriesKey(existing.series) === key;
    if (existing && !same && input.move !== true) {
      inOtherSeries.push({ workId: id, series: String(existing.series) });
      continue;
    }
    save.run(id, series, volume ?? (same ? (existing.volume ?? null) : null), at);
    added += 1;
  }
  return { added, inOtherSeries };
}

/**
 * Takes a book out of a series (only out of that one).
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function removeFromSeries(repository, name, workId) {
  const database = repository.database;
  const row = database
    .prepare('SELECT series FROM work_series_annotations WHERE work_id=?')
    .get(workId);
  if (!row || seriesKey(row.series) !== seriesKey(name)) fail('NOT_IN_SERIES', 404);
  database.prepare('DELETE FROM work_series_annotations WHERE work_id=?').run(workId);
  return { removed: true };
}
