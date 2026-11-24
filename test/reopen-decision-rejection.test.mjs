// Undoing an automatic decision must not be repeated by a later retry; manual assignments stay as they are.
import assert from 'node:assert/strict';
import test from 'node:test';

import { reopenReviewDecision } from '../api-routes.mjs';
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

function setup(repository) {
  const work = repository.createWork({ title: 'Theoretical Physics', authors: ['Georg Joos'] });
  const edition = repository.createEdition({ workId: work.id, title: 'Theoretical Physics' });
  repository.attachIdentifier(edition.id, 'isbn13', ISBN, { source: 'fixture' });
  repository.upsertOffer({
    id: 'o',
    source: 'fixture',
    normalizedUrl: 'https://example.test/o',
    originalTitle: 'Theoretical Physics',
    observedIsbn: ISBN,
  });
  repository.putIdentificationJob({ id: 'j', offerId: 'o', status: 'queued' });
  return edition;
}
const decide = (repository, editionId, createdBy) =>
  repository.database
    .prepare(
      `INSERT INTO review_decisions(id,job_id,offer_id,edition_id,action,reason,created_by,created_at)
       VALUES('d','j','o',?,'approved','test',?,'2026-11-21T10:00:00.000Z')`,
    )
    .run(editionId, createdBy);
const activeCount = (repository) =>
  repository.database
    .prepare("SELECT count(*) n FROM offer_matches WHERE offer_id='o' AND status='active'")
    .get().n;

test('an undone automatic assignment is not put back by a retry', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const edition = setup(repository);
    const resolver = new CatalogResolver({ repository, lookupMetadata: offline });
    const worker = new IdentificationWorker({ repository, resolver });
    assert.equal((await worker.processJobId('j')).result.decision, 'matched_existing');
    assert.equal(activeCount(repository), 1);
    // The worker itself recorded the decision (created_by 'auto_isbn_v1').
    const row = repository.database
      .prepare("SELECT id FROM review_decisions WHERE offer_id='o' AND created_by='auto_isbn_v1'")
      .get();
    assert.ok(row);

    reopenReviewDecision(repository, row.id);
    assert.equal(activeCount(repository), 0);
    assert.deepEqual([...operatorRejectedEditions(repository, 'o')], [edition.id]);

    assert.equal(retryIdentificationJobs(repository, 'review_required').queued, 1);
    const again = await worker.processJobId('j');
    assert.equal(again.result.decision, 'review_required');
    assert.deepEqual(again.result.reason, ['operator_rejected_edition']);
    assert.equal(activeCount(repository), 0);
  } finally {
    repository.close();
  }
});

test('undoing a decision made by the owner records no rejection even for a metadata match', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const edition = setup(repository);
    repository.assignOfferToEdition('o', edition.id, { method: 'metadata', createdBy: 'catalog' });
    repository.database
      .prepare("UPDATE identification_jobs SET status='completed' WHERE id='j'")
      .run();
    decide(repository, edition.id, 'local_user');

    reopenReviewDecision(repository, 'd');
    assert.equal(activeCount(repository), 0);
    assert.equal(operatorRejectedEditions(repository, 'o').size, 0);
  } finally {
    repository.close();
  }
});

test('undoing a decision backed by a manual assignment records no rejection', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const edition = setup(repository);
    repository.assignOfferToEdition('o', edition.id, {
      method: 'manual',
      createdBy: 'local_user',
    });
    repository.database
      .prepare("UPDATE identification_jobs SET status='completed' WHERE id='j'")
      .run();
    decide(repository, edition.id, 'local_user');

    reopenReviewDecision(repository, 'd');
    assert.equal(operatorRejectedEditions(repository, 'o').size, 0);
    assert.equal(
      repository.database
        .prepare("SELECT count(*) n FROM offer_matches WHERE status='rejected'")
        .get().n,
      0,
    );
  } finally {
    repository.close();
  }
});
