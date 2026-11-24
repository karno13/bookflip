// @ts-check
// "Sprawdź kopię": opens a backup read-only and checks that it can be restored from. Detects a
// truncated file (header page count against file size), runs integrity_check and counts tables.
import { open, readdir, stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { basename, dirname, join } from 'node:path';

/**
 * @param {string} path
 * @returns {Promise<{ ok: boolean, path: string, bytes: number, tables: number, rows: number, error: string | null }>}
 */
export async function verifyBackup(path) {
  /** @param {string} error @param {number} bytes */
  const bad = (error, bytes = 0) => ({ ok: false, path, bytes, tables: 0, rows: 0, error });
  let bytes;
  try {
    bytes = (await stat(path)).size;
  } catch {
    return bad('BACKUP_NOT_FOUND');
  }
  if (bytes < 512) return bad('BACKUP_TOO_SMALL', bytes);
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(100);
    await handle.read(header, 0, 100, 0);
    if (header.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0')
      return bad('BACKUP_NOT_SQLITE', bytes);
    const pageSize = header.readUInt16BE(16) === 1 ? 65536 : header.readUInt16BE(16);
    const pages = header.readUInt32BE(28);
    if (pages > 0 && bytes < pages * pageSize) return bad('BACKUP_TRUNCATED', bytes);
  } finally {
    await handle.close();
  }
  /** @type {DatabaseSync | null} */
  let database = null;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    const integrity = /** @type {any} */ (database.prepare('PRAGMA integrity_check').get());
    if (integrity?.integrity_check !== 'ok') return bad('BACKUP_INTEGRITY_CHECK_FAILED', bytes);
    const tables = /** @type {any[]} */ (
      database
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()
    );
    if (!tables.length) return bad('BACKUP_EMPTY', bytes);
    let rows = 0;
    for (const table of tables)
      rows += Number(
        /** @type {any} */ (
          database
            .prepare(`SELECT count(*) AS n FROM "${String(table.name).replace(/"/g, '""')}"`)
            .get()
        ).n,
      );
    return { ok: true, path, bytes, tables: tables.length, rows, error: null };
  } catch {
    return bad('BACKUP_UNREADABLE', bytes);
  } finally {
    database?.close();
  }
}

/**
 * Verifies a file of the "backups" folder next to the catalogue: by plain file name, or the newest
 * one when no name is given. Never reads outside that folder.
 * @param {string} databasePath
 * @param {string | undefined} name
 */
export async function verifyBackupInFolder(databasePath, name) {
  const folder = join(dirname(databasePath), 'backups');
  let chosen = name;
  if (chosen === undefined || chosen === null || chosen === '') {
    const names = (await readdir(folder).catch(() => [])).filter((file) =>
      file.endsWith('.sqlite'),
    );
    const dated = await Promise.all(
      names.map(async (file) => ({ file, at: (await stat(join(folder, file))).mtimeMs })),
    );
    chosen = dated.sort((a, b) => b.at - a.at)[0]?.file;
    if (!chosen)
      return { ok: false, path: folder, bytes: 0, tables: 0, rows: 0, error: 'NO_BACKUPS' };
  }
  if (basename(chosen) !== chosen || !chosen.endsWith('.sqlite'))
    throw Object.assign(Error('INVALID_BACKUP_NAME'), { statusCode: 400 });
  return { name: chosen, ...(await verifyBackup(join(folder, chosen))) };
}
