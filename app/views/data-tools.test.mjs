import assert from 'node:assert/strict';
import test from 'node:test';

import { backupVerifyMessage } from './data-tools.js';

test('a good backup is reported with size, tables and rows', () => {
  assert.equal(backupVerifyMessage({ ok: true, name: 'a.sqlite', bytes: 5_242_880, tables: 12, rows: 3400 }), 'Kopia a.sqlite jest w porządku: 5,0 MB, 12 tabel, 3400 wierszy.');
  assert.match(backupVerifyMessage({ ok: true, bytes: 2048, tables: 1, rows: 0 }), /2 KB/);
});

test('each failure code gets a Polish message, an unknown one a generic message', () => {
  assert.match(backupVerifyMessage({ ok: false, error: 'NO_BACKUPS' }), /Nie ma jeszcze żadnej kopii/);
  for (const code of ['BACKUP_NOT_FOUND', 'BACKUP_TOO_SMALL', 'BACKUP_NOT_SQLITE', 'BACKUP_TRUNCATED', 'BACKUP_INTEGRITY_CHECK_FAILED', 'BACKUP_EMPTY', 'BACKUP_UNREADABLE', 'BACKUP_REQUIRES_FILE'])
    assert.doesNotMatch(backupVerifyMessage({ ok: false, error: code }), /BACKUP_/);
  assert.equal(backupVerifyMessage({ ok: false, error: 'HTTP_500' }), 'Nie udało się sprawdzić kopii.');
});
