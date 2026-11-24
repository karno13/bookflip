// Ustawienia → „Dane i kopie zapasowe”: checks the newest backup (POST /api/data/backup/verify) and
// says the result in Polish. The CSV exports are plain links in index.html (/api/export/*.csv).

const ERRORS = {
  NO_BACKUPS: 'Nie ma jeszcze żadnej kopii. Utwórz pierwszą kopię zapasową.',
  BACKUP_NOT_FOUND: 'Plik kopii zniknął z dysku.',
  BACKUP_TOO_SMALL: 'Kopia jest uszkodzona: plik jest zbyt mały.',
  BACKUP_NOT_SQLITE: 'Kopia jest uszkodzona: to nie jest plik bazy danych.',
  BACKUP_TRUNCATED: 'Kopia jest niepełna (plik ucięty). Utwórz nową kopię.',
  BACKUP_INTEGRITY_CHECK_FAILED: 'Kopia jest uszkodzona: test spójności bazy nie przeszedł. Utwórz nową kopię.',
  BACKUP_EMPTY: 'Kopia jest pusta: nie zawiera żadnych tabel.',
  BACKUP_UNREADABLE: 'Nie udało się otworzyć kopii. Utwórz nową kopię.',
  BACKUP_REQUIRES_FILE: 'Kopie są dostępne tylko dla bazy zapisanej w pliku.',
  INVALID_BACKUP_NAME: 'Nieprawidłowa nazwa pliku kopii.',
};

function bytesLabel(bytes) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The sentence for a backup-verify reply (or an error code). Pure (tested). */
export function backupVerifyMessage(result) {
  if (result?.ok) {
    const name = result.name ? ` ${result.name}` : '';
    return `Kopia${name} jest w porządku: ${bytesLabel(result.bytes)}, ${result.tables} tabel, ${result.rows} wierszy.`;
  }
  const code = result?.error || '';
  return ERRORS[code] || 'Nie udało się sprawdzić kopii.';
}

export function installDataTools({ $, json }) {
  const button = $('#verifyBackup');
  if (!button) return;
  button.addEventListener('click', async () => {
    const out = $('#verifyResult');
    button.disabled = true;
    out.textContent = 'Sprawdzanie ostatniej kopii…';
    try {
      out.textContent = backupVerifyMessage(await json('/api/data/backup/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    } catch (error) {
      out.textContent = backupVerifyMessage({ ok: false, error: String(error?.message || '') });
    } finally {
      button.disabled = false;
    }
  });
}
