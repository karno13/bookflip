// @ts-check
// A copy of the catalogue taken right before an operation that cannot be undone (the automatic
// merge of duplicate works at start). Synchronous (VACUUM INTO), integrity-checked, in the
// "backups" folder next to the database under a name the daily rotation never touches; the newest
// few per reason are kept. A failed copy throws: the caller must not go on without it.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * @param {{ database: any, path: string }} repository
 * @param {{ reason: string, now?: Date, keep?: number }} options
 * @returns {string | null} the copy, or null for an in-memory catalogue
 */
export function backupBeforeIrreversible(repository, { reason, now = new Date(), keep = 3 }) {
  if (!/^[a-z]+$/.test(reason)) throw Error('SAFETY_BACKUP_REASON_INVALID');
  if (repository.path === ':memory:') return null;
  const source = resolve(repository.path);
  const directory = join(dirname(source), 'backups');
  mkdirSync(directory, { recursive: true });
  const base = basename(source, extname(source));
  // "-safety-", not "-pre-": the pre-migration copies are never rotated away.
  const prefix = `${base}-safety-${reason}-`;
  const target = join(directory, `${prefix}${now.toISOString().replace(/[:.]/g, '-')}.sqlite`);
  try {
    repository.database.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    const check = new DatabaseSync(target, { readOnly: true });
    try {
      if (check.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok')
        throw Error('SAFETY_BACKUP_INTEGRITY_CHECK_FAILED');
    } finally {
      check.close();
    }
  } catch (error) {
    // A half-written copy must not stay: it would count among the newest and push good ones out.
    rmSync(target, { force: true });
    throw error;
  }
  const copies = readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sqlite'))
    .sort();
  for (const old of copies.slice(0, Math.max(0, copies.length - keep)))
    rmSync(join(directory, old), { force: true });
  return target;
}
