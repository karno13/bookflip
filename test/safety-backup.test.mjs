import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { backupBeforeIrreversible } from '../safety-backup.mjs';
import { mergeAutomaticDuplicates, runStartupJobs } from '../startup-jobs.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

function inTempDir(run) {
  const directory = mkdtempSync(join(tmpdir(), 'bookflip-safety-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}
const twoDuplicates = (repository) => {
  for (const id of ['w1', 'w2']) {
    repository.createWork({
      id,
      title: 'Nemezis',
      authors: ['James Swallow'],
      verificationStatus: 'verified',
    });
    repository.createEdition({
      id: 'e' + id,
      workId: id,
      title: 'Nemezis',
      verificationStatus: 'verified',
    });
  }
};
const worksOf = (repository) =>
  repository.database.prepare('SELECT count(*) AS n FROM works').get().n;

test('a copy is taken before an irreversible step, is intact and only the newest few are kept', () => {
  inTempDir((directory) => {
    const repository = new SqliteCatalogRepository(join(directory, 'bookflip-catalog.sqlite'));
    try {
      repository.createWork({ id: 'w', title: 'Mort' });
      let last;
      for (let i = 0; i < 5; i++)
        last = backupBeforeIrreversible(repository, {
          reason: 'merge',
          now: new Date(Date.UTC(2026, 10, 21, 10, i)),
        });
      const copies = readdirSync(join(directory, 'backups'));
      assert.equal(copies.length, 3);
      const copy = new DatabaseSync(last, { readOnly: true });
      assert.equal(copy.prepare('SELECT count(*) AS n FROM works').get().n, 1);
      copy.close();
    } finally {
      repository.close();
    }
    assert.equal(
      backupBeforeIrreversible(new SqliteCatalogRepository(':memory:'), { reason: 'merge' }),
      null,
    );
  });
});

test('the automatic merge takes a copy first, skips without one, and runs as before when backups are off', () => {
  inTempDir((directory) => {
    // Normal: a copy, then the merge.
    const normal = new SqliteCatalogRepository(join(directory, 'normal.sqlite'));
    try {
      twoDuplicates(normal);
      assert.equal(mergeAutomaticDuplicates(normal, { env: {} }), 1);
      assert.equal(readdirSync(join(directory, 'backups')).length, 1);
    } finally {
      normal.close();
    }
    // The copy cannot be written (a file stands where the folder should be): nothing is merged.
    mkdirSync(join(directory, 'blocked'));
    writeFileSync(join(directory, 'blocked', 'backups'), 'not a folder');
    const blocked = new SqliteCatalogRepository(join(directory, 'blocked', 'blocked.sqlite'));
    try {
      twoDuplicates(blocked);
      const quiet = console.error;
      console.error = () => {};
      try {
        assert.equal(mergeAutomaticDuplicates(blocked, { env: {} }), 0);
      } finally {
        console.error = quiet;
      }
      assert.equal(worksOf(blocked), 2);
    } finally {
      blocked.close();
    }
    // Backups switched off by the owner: the merge runs, no copy.
    const off = new SqliteCatalogRepository(join(directory, 'off.sqlite'));
    try {
      twoDuplicates(off);
      assert.equal(mergeAutomaticDuplicates(off, { env: { BOOKFLIP_AUTO_BACKUP: '0' } }), 1);
    } finally {
      off.close();
    }
  });
});

test('a merge skipped for lack of a copy is retried at the next start, and a failed copy leaves no file', () => {
  inTempDir((directory) => {
    const repository = new SqliteCatalogRepository(join(directory, 'bookflip-catalog.sqlite'));
    try {
      twoDuplicates(repository);
      // The first start: the copy cannot be written, so nothing is merged but the merge is owed.
      writeFileSync(join(directory, 'backups'), 'not a folder');
      const quiet = console.error;
      console.error = () => {};
      try {
        assert.equal(mergeAutomaticDuplicates(repository, { env: {} }), 0);
      } finally {
        console.error = quiet;
      }
      assert.equal(worksOf(repository), 2);
      const pending = () =>
        repository.database
          .prepare("SELECT count(*) AS n FROM app_preferences WHERE key='startup_merge_pending_v1'")
          .get().n;
      assert.equal(pending(), 1);
      // The next start (the upgrade is flagged done, so only the pending mark brings the merge back).
      rmSync(join(directory, 'backups'), { force: true });
      const report = runStartupJobs(repository, { env: {} });
      assert.equal(report.merged, 1);
      assert.equal(pending(), 0);
      // A merge hides the source work behind an alias row; it is recorded in catalog_work_merges.
      assert.equal(
        repository.database.prepare('SELECT count(*) AS n FROM catalog_work_merges').get().n,
        1,
      );
      assert.equal(readdirSync(join(directory, 'backups')).length, 1);
    } finally {
      repository.close();
    }
  });
  inTempDir((directory) => {
    const repository = new SqliteCatalogRepository(join(directory, 'bookflip-catalog.sqlite'));
    try {
      mkdirSync(join(directory, 'backups'));
      // A directory where the copy should go makes VACUUM INTO fail: nothing may stay behind.
      const now = new Date(Date.UTC(2026, 10, 21, 10, 0));
      const name =
        'bookflip-catalog-safety-merge-' + now.toISOString().replace(/[:.]/g, '-') + '.sqlite';
      mkdirSync(join(directory, 'backups', name));
      assert.throws(() => backupBeforeIrreversible(repository, { reason: 'merge', now }));
      assert.throws(
        () => backupBeforeIrreversible(repository, { reason: 'migration' + '_x' }),
        /REASON_INVALID/,
      );
    } finally {
      repository.close();
    }
  });
});
