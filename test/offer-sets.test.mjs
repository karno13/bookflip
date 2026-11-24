import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { listOfferSets, markOfferAsSet, updateSetEdition, unmarkOfferSet } from '../offer-sets.mjs';

test('bundle can contain multiple editions, keeps offer price and excludes single-book assignment', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const work = repo.createWork({ title: 'Test work' });
    const one = repo.createEdition({ workId: work.id, title: 'Volume One' });
    const two = repo.createEdition({ workId: work.id, title: 'Volume Two' });
    const offer = repo.upsertOffer({
      source: 'test',
      normalizedUrl: 'https://example.test/bundle',
      originalTitle: 'Two volumes',
      currentPrice: 4900,
    });
    repo.assignOfferToEdition(offer.id, one.id, { method: 'metadata' });
    markOfferAsSet(repo, offer.id);
    assert.equal(
      repo.database
        .prepare("SELECT count(*) AS n FROM offer_matches WHERE offer_id=? AND status='active'")
        .get(offer.id).n,
      0,
    );
    updateSetEdition(repo, offer.id, one.id, true);
    updateSetEdition(repo, offer.id, two.id, true);
    const list = listOfferSets(repo);
    assert.equal(list.length, 1);
    assert.equal(list[0].currentPrice, 4900);
    assert.equal(list[0].editions.length, 2);
    updateSetEdition(repo, offer.id, one.id, false);
    assert.equal(listOfferSets(repo)[0].editions.length, 1);
    unmarkOfferSet(repo, offer.id);
    assert.equal(listOfferSets(repo).length, 0);
  } finally {
    repo.close();
  }
});

test('bundle membership validates editions and offer existence', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    assert.throws(() => markOfferAsSet(repo, 'missing'), /OFFER_NOT_FOUND/);
    const offer = repo.upsertOffer({
      source: 'test',
      normalizedUrl: 'https://example.test/other',
      originalTitle: 'Set',
    });
    markOfferAsSet(repo, offer.id);
    assert.throws(() => updateSetEdition(repo, offer.id, 'missing', true), /EDITION_NOT_FOUND/);
  } finally {
    repo.close();
  }
});

test('a pasted description names the books of a set; volumes of a cycle come by range', async () => {
  const { setCandidates, cycleVolumeEditions, descriptionParts } =
    await import('../offer-sets.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const book = (title, volume) => {
      const work = repo.createWork({ title, authors: ['Terry Pratchett'] });
      const edition = repo.createEdition({ workId: work.id, title });
      repo.database
        .prepare(
          "INSERT INTO work_series_annotations(work_id,series,volume,updated_at) VALUES(?,'Rincewind',?,?)",
        )
        .run(work.id, volume, '2026-11-08T00:00:00Z');
      return edition;
    };
    const kolor = book('Kolor magii', 1);
    const blask = book('Blask fantastyczny', 2);
    book('Czarodzicielstwo', 3);
    const offer = repo.upsertOffer({
      source: 'Vinted',
      normalizedUrl: 'https://www.vinted.pl/items/9',
      originalTitle: 'Zestaw książek świat dysku',
    });
    markOfferAsSet(repo, offer.id);
    assert.deepEqual(descriptionParts('1. Kolor magii\n2) Blask fantastyczny, stan bdb'), [
      'Kolor magii',
      'Blask fantastyczny',
      'stan bdb',
    ]);
    const found = setCandidates(repo, offer.id, {
      text: 'Sprzedam:\n1. Kolor magii\n2. Blask fantastyczny\nWysyłka OLX',
    }).items;
    assert.deepEqual(found.map((item) => item.editionId).sort(), [kolor.id, blask.id].sort());
    const range = cycleVolumeEditions(repo, 'Rincewind', 2, 4);
    assert.deepEqual(
      range.items.map((item) => item.volume),
      [2, 3],
    );
    assert.deepEqual(range.missing, [4]);
    assert.throws(() => cycleVolumeEditions(repo, 'Rincewind', 3, 1), /INVALID_VOLUME_RANGE/);
  } finally {
    repo.close();
  }
});

test('unmarking a set gives back a manual assignment and an earlier exclusion', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const work = repo.createWork({ title: 'Test work' });
    const edition = repo.createEdition({ workId: work.id, title: 'Volume One' });
    const make = (name) =>
      repo.upsertOffer({
        source: 'test',
        normalizedUrl: `https://example.test/${name}`,
        originalTitle: name,
        currentPrice: 1000,
      });
    const job = (offerId) =>
      repo.database
        .prepare('SELECT status, result_json FROM identification_jobs WHERE offer_id=?')
        .get(offerId);
    const active = (offerId) =>
      repo.database
        .prepare(
          "SELECT edition_id, method FROM offer_matches WHERE offer_id=? AND status='active'",
        )
        .get(offerId);

    const manual = make('manual');
    repo.assignOfferToEdition(manual.id, edition.id, { method: 'manual', createdBy: 'local_user' });
    markOfferAsSet(repo, manual.id);
    markOfferAsSet(repo, manual.id); // marking twice must not lose the first snapshot
    assert.equal(active(manual.id), undefined);
    unmarkOfferSet(repo, manual.id);
    assert.equal(active(manual.id)?.edition_id, edition.id);
    assert.equal(active(manual.id)?.method, 'manual');
    // The finished job of the manual assignment comes back with it, not a queued one.
    assert.equal(job(manual.id).status, 'completed');

    const excluded = make('excluded');
    repo.database
      .prepare(
        "INSERT INTO identification_jobs(id, offer_id, job_type, status, attempt_count, created_at, updated_at, result_json) VALUES('jx', ?, 'identify_edition', 'completed', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', ?)",
      )
      .run(excluded.id, JSON.stringify({ decision: 'excluded', manualDecision: 'excluded' }));
    markOfferAsSet(repo, excluded.id);
    unmarkOfferSet(repo, excluded.id);
    assert.equal(job(excluded.id).status, 'completed');
    assert.equal(JSON.parse(job(excluded.id).result_json).manualDecision, 'excluded');
  } finally {
    repo.close();
  }
});
