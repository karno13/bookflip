import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { createProductionCatalog } from '../catalog-production.mjs';
import { persistSqliteScan } from '../sqlite-single-store.mjs';
import { decideIdentificationJob } from '../review-queue.mjs';
import { runOnce } from '../startup-jobs.mjs';
import { mergeCatalogWorks } from '../api-routes.mjs';
import { setWorkLabels, workLabels } from '../catalog-labels.mjs';
import { rejectRepeatsOfRejectedOffers } from '../rejected-offers.mjs';

test('runOnce: a job that fails after writing leaves neither its data nor the flag, and runs again', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  const db = repository.database;
  const write = (key) =>
    db
      .prepare('INSERT INTO app_preferences(key,value_json,updated_at) VALUES(?,?,?)')
      .run(key, '{}', '2026-11-21T00:00:00Z');
  assert.throws(
    () =>
      runOnce(repository, 'probe_v1', () => {
        write('half_done');
        throw Error('INTERRUPTED');
      }),
    /INTERRUPTED/,
  );
  assert.equal(
    db
      .prepare("SELECT count(*) AS c FROM app_preferences WHERE key IN ('half_done','probe_v1')")
      .get().c,
    0,
  );
  assert.equal(repository.depth, 0);
  let ran = 0;
  assert.deepEqual(
    runOnce(repository, 'probe_v1', () => ({ ran: ++ran })),
    { ran: 1 },
  );
  assert.deepEqual(
    runOnce(repository, 'probe_v1', () => ({ ran: ++ran })),
    { skipped: true },
  );
  assert.equal(ran, 1);
});

test('two automatic repeat-rejections of one job with an identical timestamp do not collide', () => {
  const c = createProductionCatalog({
    databasePath: ':memory:',
    fetcher: async () => {
      throw Error('NETWORK_NOT_ALLOWED');
    },
  });
  try {
    const context = {
      queries: ['Warcraft'],
      sources: ['Vinted'],
      results: [{ source: 'Vinted', query: 'Warcraft', status: 'ok' }],
    };
    const db = c.repository.database;
    const item = (n) => ({
      source: 'Vinted',
      url: `https://www.vinted.pl/items/${n}-kubek`,
      title: 'World of Warcraft kubek ceramiczny Horda',
      price: 2500,
    });
    persistSqliteScan(c, {
      offers: [item(1)],
      searchedAt: '2026-11-01T00:00:00Z',
      scanContext: context,
    });
    db.prepare(
      'UPDATE identification_jobs SET status=\'review_required\', result_json=\'{"decision":"review_required","reason":["no_isbn"]}\'',
    ).run();
    const first = db.prepare('SELECT id FROM identification_jobs').get();
    decideIdentificationJob(c.repository, first.id, { action: 'excluded' });
    persistSqliteScan(c, {
      offers: [item(2)],
      searchedAt: '2026-11-02T00:00:00Z',
      scanContext: context,
    });
    const copy = db
      .prepare(
        "SELECT j.id FROM identification_jobs j JOIN offers o ON o.id=j.offer_id WHERE o.normalized_url LIKE '%/2-kubek'",
      )
      .get();
    const now = () => new Date('2026-11-03T00:00:00Z');
    for (let pass = 0; pass < 2; pass++) {
      db.prepare("UPDATE identification_jobs SET status='review_required' WHERE id=?").run(copy.id);
      assert.deepEqual(rejectRepeatsOfRejectedOffers(c.repository, { now }), { rejected: 1 });
    }
    const rows = db
      .prepare(
        "SELECT id FROM review_decisions WHERE job_id=? AND created_by='auto_same_as_rejected'",
      )
      .all(copy.id);
    // One from the scan itself plus the two forced passes; ids are distinct and keep the prefix.
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((row) => row.id)).size, 3);
    assert.ok(rows.every((row) => row.id.startsWith('auto_reject_')));
  } finally {
    c.close();
  }
});

test('merging works moves labels to the target without duplicates and leaves manual assignments alone', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  const db = repository.database;
  repository.createWork({ id: 'src', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createWork({ id: 'tgt', title: 'Mort', authors: ['Pratchett, Terry'] });
  setWorkLabels(repository, 'src', ['Fantasy', 'Do sprzedaży']);
  setWorkLabels(repository, 'tgt', ['fantasy']);
  const edition = repository.createEdition({ workId: 'src', title: 'Mort' });
  const offer = repository.upsertOffer({
    source: 'Vinted',
    url: 'https://www.vinted.pl/items/9-mort',
    title: 'Mort',
    price: 1000,
  });
  repository.assignOfferToEdition(offer.id, edition.id, {
    method: 'manual',
    createdBy: 'local_user',
  });
  const matchesBefore = db.prepare('SELECT * FROM offer_matches ORDER BY id').all();

  assert.equal(mergeCatalogWorks(repository, 'src', 'tgt', true).merged, true);

  assert.deepEqual(workLabels(repository, 'tgt').sort(), ['Do sprzedaży', 'Fantasy']);
  assert.deepEqual(workLabels(repository, 'src'), []);
  assert.equal(
    db.prepare("SELECT count(*) AS c FROM work_labels WHERE normalized_label='fantasy'").get().c,
    1,
  );
  assert.deepEqual(db.prepare('SELECT * FROM offer_matches ORDER BY id').all(), matchesBefore);
  assert.equal(
    db.prepare('SELECT work_id FROM editions WHERE id=?').get(edition.id).work_id,
    'tgt',
  );
});

test('labels left on works merged earlier move to the end of the alias chain', async () => {
  const { moveLabelsOfMergedWorks } = await import('../startup-jobs.mjs');
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const [a, b, c] = ['A', 'B', 'C'].map((title) =>
      repository.createWork({ title, authors: ['Autor'] }),
    );
    const db = repository.database;
    const label = db.prepare(
      "INSERT INTO work_labels(work_id,label,normalized_label,created_at) VALUES(?,?,?,'2026-11-01T00:00:00Z')",
    );
    label.run(a.id, 'Fantasy', 'fantasy');
    label.run(a.id, 'Do sprzedaży', 'do sprzedaży');
    label.run(b.id, 'Zestaw', 'zestaw');
    label.run(c.id, 'fantasy', 'fantasy');
    const merge = db.prepare(
      "INSERT INTO catalog_work_merges(source_id,target_id,created_at) VALUES(?,?,'2026-11-02T00:00:00Z')",
    );
    merge.run(a.id, b.id);
    merge.run(b.id, c.id);
    const labelsOf = (id) =>
      db
        .prepare('SELECT label FROM work_labels WHERE work_id=? ORDER BY label')
        .all(id)
        .map((r) => r.label);
    moveLabelsOfMergedWorks(repository);
    assert.deepEqual(labelsOf(c.id), ['Do sprzedaży', 'Zestaw', 'fantasy']);
    assert.deepEqual(labelsOf(a.id), []);
    assert.deepEqual(labelsOf(b.id), []);
  } finally {
    repository.close();
  }
});
