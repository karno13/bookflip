// A new automatic ISBN assignment leaves one reversible, visible review_decisions row (created_by 'auto_isbn_v1').
import assert from 'node:assert/strict';
import test from 'node:test';

import { recentReviewDecisions, reopenReviewDecision } from '../api-routes.mjs';
import { CatalogResolver } from '../catalog-resolver.mjs';
import { IdentificationWorker } from '../identification-worker.mjs';
import { retryIdentificationJobs } from '../identification-retry.mjs';
import { operatorRejectedEditions } from '../offer-assignment.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const ISBN = '9780306406157';
const offline = async () => ({
  bn: { source: 'bn', status: 'not_found', records: [] },
  openLibrary: { source: 'open_library', status: 'not_found', records: [] },
  comparison: { status: 'not_found', conflicts: [] },
});
const bnKnows = async () => ({
  bn: {
    source: 'bn',
    status: 'found',
    records: [
      {
        source: 'bn',
        externalRecordId: 'BN-1',
        workExternalId: null,
        isbn13: ISBN,
        isbn10: null,
        title: 'Theoretical Physics',
        authors: ['Georg Joos'],
        publisher: null,
        publicationYear: null,
        language: null,
        binding: null,
        materialType: 'book',
        sourceUrl: 'https://example.test',
        fetchedAt: '2026-01-01T00:00:00Z',
        payloadHash: 'hash',
        payload: { id: 1 },
      },
    ],
  },
  openLibrary: { source: 'open_library', status: 'not_found', records: [] },
  comparison: { status: 'single_source', conflicts: [] },
});

function addOffer(repository, id = 'o', isbn = ISBN) {
  repository.upsertOffer({
    id,
    source: 'fixture',
    normalizedUrl: `https://example.test/${id}`,
    originalTitle: 'Theoretical Physics',
    observedIsbn: isbn,
  });
  repository.putIdentificationJob({ id: `j-${id}`, offerId: id, status: 'queued' });
}
function knownEdition(repository) {
  const work = repository.createWork({ title: 'Theoretical Physics', authors: ['Georg Joos'] });
  const edition = repository.createEdition({ workId: work.id, title: 'Theoretical Physics' });
  repository.attachIdentifier(edition.id, 'isbn13', ISBN, { source: 'fixture' });
  return edition;
}
const workerFor = (repository, lookupMetadata = offline) =>
  new IdentificationWorker({
    repository,
    resolver: new CatalogResolver({ repository, lookupMetadata }),
  });
const autoRows = (repository, offerId = 'o') =>
  repository.database
    .prepare("SELECT * FROM review_decisions WHERE offer_id=? AND created_by LIKE 'auto_isbn%'")
    .all(offerId);
const activeCount = (repository, offerId = 'o') =>
  repository.database
    .prepare("SELECT count(*) n FROM offer_matches WHERE offer_id=? AND status='active'")
    .get(offerId).n;

test('a new automatic assignment writes one approved decision row', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const edition = knownEdition(repository);
    addOffer(repository);
    const { result } = await workerFor(repository).processJobId('j-o');
    assert.equal(result.decision, 'matched_existing');
    assert.equal(result.assigned, true);
    const rows = autoRows(repository);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'approved');
    assert.equal(rows[0].edition_id, edition.id);
    assert.equal(rows[0].job_id, 'j-o');
    assert.equal(rows[0].created_by, 'auto_isbn_v1');
    assert.match(rows[0].reason, /^Automat/);
    const listed = recentReviewDecisions(repository).find((d) => d.id === rows[0].id);
    assert.equal(listed.createdBy, 'auto_isbn_v1');
  } finally {
    repository.close();
  }
});

test('a repeated pass over the same assignment adds no second row', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    knownEdition(repository);
    addOffer(repository);
    const worker = workerFor(repository);
    await worker.processJobId('j-o');
    assert.equal((await worker.processJobId('j-o')).reused, true);
    repository.database
      .prepare("UPDATE identification_jobs SET status='queued' WHERE id='j-o'")
      .run();
    const again = await worker.processJobId('j-o');
    assert.equal(again.result.decision, 'matched_existing');
    assert.notEqual(again.result.assigned, true);
    assert.equal(autoRows(repository).length, 1);
  } finally {
    repository.close();
  }
});

test('manual assignments and sets get no automatic decision row', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const edition = knownEdition(repository);
    addOffer(repository, 'manual');
    repository.assignOfferToEdition('manual', edition.id, {
      method: 'manual',
      createdBy: 'local_user',
    });
    addOffer(repository, 'set');
    repository.database
      .prepare("INSERT INTO offer_sets(offer_id,created_at,updated_at) VALUES('set','t','t')")
      .run();
    const worker = workerFor(repository);
    await worker.processJobId('j-manual');
    await worker.processJobId('j-set');
    assert.equal(autoRows(repository, 'manual').length, 0);
    assert.equal(autoRows(repository, 'set').length, 0);
    const [match] = repository.database
      .prepare("SELECT method FROM offer_matches WHERE offer_id='manual' AND status='active'")
      .all();
    assert.equal(match.method, 'manual');
  } finally {
    repository.close();
  }
});

test('review_required and not_found leave no automatic decision row', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const work = repository.createWork({ title: 'Cooking', authors: ['Anna Nowak'] });
    const edition = repository.createEdition({ workId: work.id, title: 'Cooking' });
    repository.attachIdentifier(edition.id, 'isbn13', ISBN, { source: 'fixture' });
    // The listing names another book than the ISBN edition: held back for review.
    addOffer(repository, 'mismatch');
    // Unknown ISBN in every source: not_found.
    addOffer(repository, 'unknown', '9788324631766');
    const worker = workerFor(repository);
    const mismatch = await worker.processJobId('j-mismatch');
    const unknown = await worker.processJobId('j-unknown');
    assert.equal(mismatch.result.decision, 'review_required');
    assert.equal(unknown.result.decision, 'not_found');
    assert.equal(repository.database.prepare('SELECT count(*) n FROM review_decisions').get().n, 0);
  } finally {
    repository.close();
  }
});

test('undoing the automatic decision supersedes the match and a retry is not repeated', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const edition = knownEdition(repository);
    addOffer(repository);
    const worker = workerFor(repository);
    await worker.processJobId('j-o');
    const [row] = autoRows(repository);
    assert.equal(activeCount(repository), 1);

    reopenReviewDecision(repository, row.id);
    assert.equal(activeCount(repository), 0);
    assert.equal(
      repository.database
        .prepare("SELECT status FROM offer_matches WHERE offer_id='o' ORDER BY rowid")
        .all()
        .map((m) => m.status)
        .includes('superseded'),
      true,
    );
    assert.deepEqual([...operatorRejectedEditions(repository, 'o')], [edition.id]);

    assert.equal(retryIdentificationJobs(repository, 'review_required').queued, 1);
    const again = await worker.processJobId('j-o');
    assert.equal(again.result.decision, 'review_required');
    assert.deepEqual(again.result.reason, ['operator_rejected_edition']);
    assert.equal(activeCount(repository), 0);
    assert.equal(autoRows(repository).length, 1);
  } finally {
    repository.close();
  }
});

test('a newly created work and edition also leaves an automatic decision row', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    addOffer(repository);
    const { result } = await workerFor(repository, bnKnows).processJobId('j-o');
    assert.equal(result.decision, 'created_work_and_edition');
    assert.equal(result.assigned, true);
    const rows = autoRows(repository);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].edition_id, result.editionId);
    assert.equal(activeCount(repository), 1);
  } finally {
    repository.close();
  }
});

test('forty automatic rows do not push the owner decisions off the list', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    knownEdition(repository);
    addOffer(repository);
    const insert = repository.database.prepare(
      `INSERT INTO review_decisions(id,job_id,offer_id,edition_id,action,reason,created_by,created_at)
       VALUES(?,NULL,'o',NULL,'approved','t',?,?)`,
    );
    for (let i = 0; i < 3; i += 1)
      insert.run(`manual-${i}`, 'local_user', `2026-11-01T10:00:0${i}.000Z`);
    for (let i = 0; i < 40; i += 1)
      insert.run(
        `auto-${i}`,
        'auto_isbn_v1',
        `2026-11-20T10:00:${String(i).padStart(2, '0')}.000Z`,
      );
    const items = recentReviewDecisions(repository);
    assert.equal(items.filter((d) => d.createdBy === 'local_user').length, 3);
    assert.equal(items.filter((d) => d.createdBy === 'auto_isbn_v1').length, 10);
    assert.ok(items.length <= 40);
  } finally {
    repository.close();
  }
});
