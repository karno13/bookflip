// The repository refuses an automatic active assignment over a manual one (last line of defence).
import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

function setup() {
  const repo = new SqliteCatalogRepository(':memory:');
  const work = repo.createWork({ title: 'Guard' });
  const one = repo.createEdition({ workId: work.id, title: 'One' });
  const two = repo.createEdition({ workId: work.id, title: 'Two' });
  const offer = repo.upsertOffer({
    source: 'test',
    normalizedUrl: 'https://example.test/guard',
    originalTitle: 'Guard',
  });
  return { repo, one, two, offer };
}
const active = (repo, offerId) =>
  repo.getOfferMatchHistory(offerId).filter((row) => row.status === 'active');

test('automatic assignment does not supersede a manual one', () => {
  const { repo, one, two, offer } = setup();
  try {
    repo.assignOfferToEdition(offer.id, one.id, {
      method: 'manual',
      createdBy: 'local_user',
    });
    for (const method of ['metadata', 'structured_isbn'])
      assert.throws(
        () =>
          repo.assignOfferToEdition(offer.id, two.id, { method, createdBy: 'catalog_resolver' }),
        { message: 'MANUAL_ASSIGNMENT_CONFLICT' },
      );
    const rows = active(repo, offer.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].edition_id, one.id);
    assert.equal(repo.getOfferMatchHistory(offer.id).length, 1);
  } finally {
    repo.close();
  }
});

test('the owner can override a manual assignment; a rejection by automation leaves it intact', () => {
  const { repo, one, two, offer } = setup();
  try {
    repo.assignOfferToEdition(offer.id, one.id, { method: 'manual', createdBy: 'local_user' });
    repo.assignOfferToEdition(offer.id, two.id, {
      method: 'manual',
      createdBy: 'local_user',
    });
    assert.equal(active(repo, offer.id)[0].edition_id, two.id);
    // A rejected row is only a record: the manual match stays active.
    repo.assignOfferToEdition(offer.id, one.id, {
      method: 'metadata',
      status: 'rejected',
      createdBy: 'catalog_resolver',
    });
    assert.equal(active(repo, offer.id).length, 1);
    assert.equal(active(repo, offer.id)[0].edition_id, two.id);
  } finally {
    repo.close();
  }
});

test('without an active manual match automation assigns as before', () => {
  const { repo, one, two, offer } = setup();
  try {
    repo.assignOfferToEdition(offer.id, one.id, { method: 'metadata', createdBy: 'a' });
    repo.assignOfferToEdition(offer.id, two.id, { method: 'metadata', createdBy: 'b' });
    assert.equal(active(repo, offer.id)[0].edition_id, two.id);
    repo.assignOfferToEdition(offer.id, two.id, {
      method: 'manual',
      status: 'rejected',
      createdBy: 'local_user',
    });
    assert.equal(active(repo, offer.id).length, 1);
  } finally {
    repo.close();
  }
});

test('legacy_manual counts as an active manual assignment', () => {
  const { repo, one, two, offer } = setup();
  try {
    repo.assignOfferToEdition(offer.id, one.id, { method: 'legacy_manual', createdBy: 'import' });
    assert.throws(() => repo.assignOfferToEdition(offer.id, two.id, { method: 'metadata' }), {
      message: 'MANUAL_ASSIGNMENT_CONFLICT',
    });
    assert.equal(active(repo, offer.id)[0].edition_id, one.id);
  } finally {
    repo.close();
  }
});

test('the default createdBy (system) does not bypass the guard', () => {
  const { repo, one, two, offer } = setup();
  try {
    repo.assignOfferToEdition(offer.id, one.id, { method: 'manual', createdBy: 'local_user' });
    assert.throws(() => repo.assignOfferToEdition(offer.id, two.id), {
      message: 'MANUAL_ASSIGNMENT_CONFLICT',
    });
    assert.equal(active(repo, offer.id).length, 1);
  } finally {
    repo.close();
  }
});

test('local_user may assign with a metadata method over a manual match; an existing id is not an error', () => {
  const { repo, one, two, offer } = setup();
  try {
    repo.assignOfferToEdition(offer.id, one.id, { method: 'manual', createdBy: 'local_user' });
    repo.assignOfferToEdition(offer.id, two.id, {
      id: 'same',
      method: 'metadata',
      status: 'active',
      createdBy: 'local_user',
    });
    assert.equal(active(repo, offer.id)[0].edition_id, two.id);
    // Same id again: returned as already existing, the guard is not consulted.
    repo.assignOfferToEdition(offer.id, one.id, { id: 'same', method: 'metadata' });
    assert.equal(active(repo, offer.id).length, 1);
  } finally {
    repo.close();
  }
});
