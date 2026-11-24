// A manual assignment that appears between the resolver's check and its write is a review case, not a failure.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CatalogResolver } from '../catalog-resolver.mjs';
import { IdentificationWorker } from '../identification-worker.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const ISBN = '9780306406157';
const offline = async () => ({
  bn: { source: 'bn', status: 'not_found', records: [] },
  openLibrary: { source: 'open_library', status: 'not_found', records: [] },
  comparison: { status: 'not_found', conflicts: [] },
});

test('a manual assignment appearing before the write parks the job for review without a decision row', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const work = repository.createWork({ title: 'Theoretical Physics', authors: ['Georg Joos'] });
    const candidate = repository.createEdition({ workId: work.id, title: 'Theoretical Physics' });
    repository.attachIdentifier(candidate.id, 'isbn13', ISBN, { source: 'fixture' });
    const other = repository.createEdition({ workId: work.id, title: 'Other' });
    repository.upsertOffer({
      id: 'o',
      source: 'fixture',
      normalizedUrl: 'https://example.test/o',
      originalTitle: 'Theoretical Physics',
      observedIsbn: ISBN,
    });
    repository.putIdentificationJob({ id: 'j-o', offerId: 'o', status: 'queued' });

    const resolver = new CatalogResolver({ repository, lookupMetadata: offline });
    let armed = false;
    const realTransaction = repository.transaction.bind(repository);
    repository.transaction = (fn) => {
      if (armed) {
        // The owner assigns by hand right after the resolver's check, before its write.
        armed = false;
        repository.assignOfferToEdition('o', other.id, {
          id: 'manual-1',
          method: 'manual',
          createdBy: 'local_user',
        });
      }
      return realTransaction(fn);
    };
    const worker = new IdentificationWorker({
      repository,
      resolver: { resolve: (input) => ((armed = true), resolver.resolve(input)) },
    });

    const { job, result } = await worker.processJobId('j-o');
    assert.equal(job.status, 'review_required');
    assert.equal(job.last_error, null);
    assert.deepEqual(result.reason, ['manual_assignment_conflicts_with_candidate']);

    const active = repository.database
      .prepare(
        "SELECT id,edition_id,method FROM offer_matches WHERE offer_id='o' AND status='active'",
      )
      .all();
    assert.equal(active.length, 1);
    assert.equal(active[0].id, 'manual-1');
    assert.equal(active[0].edition_id, other.id);
    assert.equal(
      repository.database
        .prepare("SELECT count(*) n FROM review_decisions WHERE created_by LIKE 'auto_isbn%'")
        .get().n,
      0,
    );

    // No retry loop: the job is not claimable again.
    assert.equal(worker.claim(), null);
    assert.equal((await worker.processBatch(5)).processed, 0);
  } finally {
    repository.close();
  }
});
