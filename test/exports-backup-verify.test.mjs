import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyBackup } from '../backup-verify.mjs';
import { toCsv } from '../exports.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { backupCatalog } from '../scripts/backup-catalog.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

test('toCsv: BOM, semicolons, decimal comma, grosze, unknown price is empty', () => {
  const csv = toCsv(
    [
      { title: 'Żółć; "cytat"', price: 1234, saving: -50, share: 0.25, off: true },
      { title: 'Wiersz\ndwa', price: null, saving: null, share: null, off: false },
      { title: '=HYPERLINK("x")', price: 0, saving: 100, share: 3, off: false },
      { title: 'Drogie', price: 1_000_000, saving: 5, share: 1, off: false },
    ],
    [
      { key: 'title', label: 'Tytuł' },
      { key: 'price', label: 'Cena', kind: 'price' },
      { key: 'saving', label: 'Zysk', kind: 'money' },
      { key: 'share', label: 'Udział', kind: 'number' },
      { key: 'off', label: 'Wył.', kind: 'flag' },
    ],
  );
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(
    csv.slice(1),
    [
      'Tytuł;Cena;Zysk;Udział;Wył.',
      '"Żółć; ""cytat""";12,34;-0,50;0,25;tak',
      '"Wiersz\ndwa";;;;nie',
      `"'=HYPERLINK(""x"")";;1,00;3;nie`,
      'Drogie;;0,05;1;nie',
      '',
    ].join('\r\n'),
  );
});

test('CSV routes return downloads for deals and phrases', async () => {
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [path, header] of [
      ['deals.csv', 'ID oferty;Źródło;Tytuł oferty'],
      ['phrases.csv', 'Fraza;Oferty'],
    ]) {
      const response = await fetch(`${base}/api/export/${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/csv/);
      assert.match(response.headers.get('content-disposition'), /attachment/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM');
      assert.ok(bytes.toString('utf8').startsWith('﻿' + header));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    repo.close();
  }
});

test('verifyBackup accepts a good copy and detects a truncated or foreign file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookflip-verify-'));
  try {
    const source = join(directory, 'bookflip-catalog.sqlite');
    new SqliteCatalogRepository(source).close();
    const copy = await backupCatalog({ source, destination: join(directory, 'copy.sqlite') });
    const good = await verifyBackup(copy);
    assert.equal(good.ok, true);
    assert.ok(good.tables > 10, `tables: ${good.tables}`);
    assert.equal(good.error, null);

    const bytes = readFileSync(copy);
    const cut = join(directory, 'cut.sqlite');
    writeFileSync(cut, bytes);
    truncateSync(cut, Math.floor(bytes.length * 0.6));
    assert.deepEqual(
      [(await verifyBackup(cut)).ok, (await verifyBackup(cut)).error],
      [false, 'BACKUP_TRUNCATED'],
    );
    const odd = join(directory, 'odd.sqlite');
    writeFileSync(odd, bytes);
    truncateSync(odd, bytes.length - 1);
    assert.equal((await verifyBackup(odd)).ok, false);

    const foreign = join(directory, 'foreign.sqlite');
    writeFileSync(foreign, 'x'.repeat(4096));
    assert.equal((await verifyBackup(foreign)).error, 'BACKUP_NOT_SQLITE');
    assert.equal((await verifyBackup(join(directory, 'none.sqlite'))).error, 'BACKUP_NOT_FOUND');
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('POST /api/data/backup/verify checks the newest copy in the backups folder only', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bookflip-verify-route-'));
  const repo = new SqliteCatalogRepository(join(directory, 'bookflip-catalog.sqlite'));
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (body) =>
      fetch(`${base}/api/data/backup/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify(body),
      });
    assert.equal((await (await post({})).json()).error, 'NO_BACKUPS');
    await backupCatalog({
      source: repo.path,
      destination: join(directory, 'backups', 'bookflip-manual-1.sqlite'),
    });
    const ok = await (await post({})).json();
    assert.equal(ok.ok, true);
    assert.equal(ok.name, 'bookflip-manual-1.sqlite');
    assert.equal((await post({ name: '../bookflip-catalog.sqlite' })).status, 400);
    assert.equal((await post({ name: 'bookflip-manual-1.txt' })).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    repo.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
