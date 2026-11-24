import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewQueueSummary, updateReviewSkipped } from '../review-queue.mjs';
import { reviewUnlockPlan } from '../review-unlock.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { todaySummary } from '../today.mjs';

/** Offers waiting for a decision: [name, isbn, price grosze, reason, source]. */
function queue(rows) {
  const repo = new SqliteCatalogRepository(':memory:');
  const jobs = {};
  for (const [name, isbn, price, reason, source = 'Vinted'] of rows) {
    const offer = repo.upsertOffer({
      id: name,
      source,
      normalizedUrl: `https://example.test/${name}`,
      originalTitle: name,
      currentPrice: price,
      observedIsbn: isbn,
    });
    jobs[name] = `job-${name}`;
    repo.database
      .prepare(
        "INSERT INTO identification_jobs(id, offer_id, job_type, status, attempt_count, created_at, updated_at, result_json) VALUES(?,?,'identify_edition','review_required',0,'2026-11-01T00:00:00Z','2026-11-01T00:00:00Z',?)",
      )
      .run(jobs[name], offer.id, JSON.stringify({ decision: 'review_required', reason: [reason] }));
  }
  return { repo, jobs };
}
const SAME = 'isbn_not_found_in_metadata_sources';

test('an empty queue unlocks nothing and divides by nothing', () => {
  const { repo } = queue([]);
  try {
    assert.deepEqual(reviewUnlockPlan(repo), {
      decisions: 0,
      totalOffers: 0,
      top: 0,
      topOffers: 0,
      share: 0,
      items: [],
    });
  } finally {
    repo.close();
  }
});

test('offers sharing an ISBN are one decision, counted like the queue summary; Empik is left out', () => {
  const { repo } = queue([
    ['a1', '9788372988461', 1000, SAME],
    ['a2', '978-83-7298-846-1', 2000, SAME],
    ['a3', '9788372988461', null, SAME],
    ['b1', null, 500, 'weak_title_match'],
    ['e1', null, 700, 'weak_title_match', 'Empik'],
  ]);
  try {
    const plan = reviewUnlockPlan(repo);
    const summary = reviewQueueSummary(repo);
    assert.equal(plan.decisions, summary.decisions);
    assert.equal(plan.totalOffers, summary.offers);
    assert.equal(plan.decisions, 2);
    // The biggest decision first: 3 offers, 3000 grosze (the unknown price is skipped).
    assert.deepEqual(plan.items[0], {
      key: 'isbn:9788372988461',
      offers: 3,
      price: 3000,
      reason: SAME,
    });
  } finally {
    repo.close();
  }
});

test('the top decisions clear their share; ties are broken the same way every time', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push([`x${i}`, '9780306406157', 100, SAME]);
  for (let i = 0; i < 3; i++) rows.push([`y${i}`, '9788301160425', 100, SAME]);
  rows.push(['z0', '9781234567897', 100, SAME]);
  const { repo } = queue(rows);
  try {
    const plan = reviewUnlockPlan(repo, { top: 2 });
    assert.equal(plan.topOffers, 8);
    assert.equal(plan.totalOffers, 9);
    assert.equal(plan.share, 0.889);
    assert.deepEqual(reviewUnlockPlan(repo, { top: 2 }), plan);
    assert.equal(reviewUnlockPlan(repo, { top: 0 }).topOffers, 0);
  } finally {
    repo.close();
  }
});

test('games and foreign editions unlock nothing; unrealistic prices are not summed; skipped ones are not offered', () => {
  const { repo, jobs } = queue([
    ['g1', null, 100, 'game_rulebook'],
    ['g2', null, 100, 'foreign_edition'],
    ['p1', '9780306406157', 1_000_000, SAME],
    ['p2', '9780306406157', 2000, SAME],
    ['s1', null, 100, 'weak_title_match'],
  ]);
  try {
    updateReviewSkipped(repo, { add: [jobs.s1] });
    const plan = reviewUnlockPlan(repo);
    assert.equal(plan.totalOffers, 5);
    assert.deepEqual(
      plan.items.map((item) => item.key),
      ['isbn:9780306406157'],
    );
    assert.equal(plan.items[0].price, 2000);
    assert.equal(plan.topOffers, 2);
  } finally {
    repo.close();
  }
});

test('Dziś carries the plan next to the existing queue counts', () => {
  const { repo } = queue([['a1', '9788372988461', 1000, SAME]]);
  try {
    const { queue: summary } = todaySummary(repo, { since: null, sources: ['Vinted'] });
    assert.equal(summary.decisions, 1);
    assert.equal(summary.offers, 1);
    assert.equal(summary.unlock.topOffers, 1);
  } finally {
    repo.close();
  }
});

test('ties go to the dearer decision, then to the key; a group is offered while one of its offers is not skipped', () => {
  const { repo, jobs } = queue([
    ['a1', '9780306406157', 100, SAME],
    ['a2', '9780306406157', 100, SAME],
    ['b1', '9788301160425', 900, SAME],
    ['b2', '9788301160425', 900, SAME],
    ['c1', '9781234567897', 900, SAME],
    ['c2', '9781234567897', 900, SAME],
    ['d1', '9788372988461', 50, 'metadata_isbn_mismatch'],
    ['d2', '9788372988461', 50, 'metadata_isbn_mismatch'],
  ]);
  try {
    // One offer of the "d" group is skipped; the group is still offered through the other.
    updateReviewSkipped(repo, { add: [jobs.d1] });
    const plan = reviewUnlockPlan(repo, { top: 10 });
    assert.deepEqual(
      plan.items.map((item) => item.key),
      ['isbn:9781234567897', 'isbn:9788301160425', 'isbn:9780306406157', 'isbn:9788372988461'],
    );
    assert.equal(plan.decisions, reviewQueueSummary(repo).decisions);
    updateReviewSkipped(repo, { add: [jobs.d2] });
    assert.ok(
      !reviewUnlockPlan(repo, { top: 10 }).items.some((item) => item.key.endsWith('88461')),
    );
  } finally {
    repo.close();
  }
});

test('the review list can be sorted by the decisions that clear the most offers', async () => {
  const { listIdentificationJobs } = await import('../review-queue.mjs');
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push([`big${i}`, '9780306406157', 100, SAME]);
  for (let i = 0; i < 2; i++) rows.push([`mid${i}`, '9788301160425', 900, SAME]);
  rows.push(['solo', '9781234567897', 5000, SAME]);
  rows.push(['plain', null, 100, 'weak_title_match']);
  const { repo } = queue(rows);
  try {
    const list = listIdentificationJobs(repo, {
      status: 'review_required',
      view: 'list',
      sort: 'unlock',
      limit: 50,
    });
    // One row per decision, the biggest first: 3 offers, then 2, then the single ones by price.
    assert.deepEqual(
      list.items.map((item) => item.offerId),
      ['big0', 'mid0', 'solo', 'plain'],
    );
    assert.deepEqual(
      list.items.map((item) => item.sameIsbnCount),
      [3, 2, 1, 1],
    );
  } finally {
    repo.close();
  }
});
