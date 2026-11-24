import assert from 'node:assert/strict';
import test from 'node:test';

import { apiRoutes } from '../api-routes.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import {
  addStock,
  addStockByIsbn,
  listEdition,
  listStock,
  median,
  moveStock,
  undoStock,
} from '../stock.mjs';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-01T10:00:00Z');
const clock = (days) => () => new Date(T0 + days * DAY);

function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  const offer = (id, edition) => {
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `Mort ${id}`,
      currentPrice: 1000,
      availability: 'available',
    });
    if (edition)
      repository.assignOfferToEdition(id, edition, {
        id: `m${id}`,
        method: 'manual',
        status: 'active',
      });
  };
  return { repository, offer };
}
const status = (error) => (error ? error.statusCode : undefined);

test('allowed moves, journal and undo of the last change', () => {
  const { repository } = world();
  try {
    const { id } = addStock(repository, { editionId: 'e' }, { now: clock(0) });
    assert.throws(
      () => moveStock(repository, id, 'sold', { now: clock(1) }),
      (e) => status(e) === 400,
    );
    moveStock(repository, id, 'listed', { now: clock(2) });
    moveStock(repository, id, 'sold', { now: clock(12) });
    assert.throws(
      () => moveStock(repository, id, 'bought'),
      (e) => status(e) === 400,
    );
    assert.throws(
      () => moveStock(repository, id, 'listed'),
      (e) => status(e) === 400,
    );
    let item = listStock(repository, { now: clock(13) }).items[0];
    assert.equal(item.status, 'sold');
    assert.equal(item.ageDays, 12);
    assert.deepEqual(item.next, ['dropped']);
    // Undo sold -> listed, then listed -> bought; the date of the undone state is cleared.
    assert.equal(undoStock(repository, id).status, 'listed');
    item = listStock(repository, { now: clock(13) }).items[0];
    assert.equal(item.soldAt, null);
    assert.ok(item.listedAt);
    assert.equal(undoStock(repository, id).status, 'bought');
    assert.equal(listStock(repository).items[0].listedAt, null);
    // Dropped is reachable from any state and final except for the undo.
    moveStock(repository, id, 'dropped');
    assert.throws(
      () => moveStock(repository, id, 'listed'),
      (e) => status(e) === 400,
    );
    assert.equal(undoStock(repository, id).status, 'bought');
    // Undoing the purchase hides the copy; the journal stays and nothing is left to undo.
    assert.equal(undoStock(repository, id).removed, true);
    assert.equal(listStock(repository).items.length, 0);
    assert.equal(
      repository.database.prepare('SELECT count(*) AS n FROM stock_events WHERE item_id=?').get(id)
        .n,
      4,
    );
    assert.throws(
      () => undoStock(repository, id),
      (e) => status(e) === 404,
    );
  } finally {
    repository.close();
  }
});

test('a copy needs an edition: unassigned offers are refused, assigned ones are not duplicated', () => {
  const { repository, offer } = world();
  try {
    offer('free', null);
    offer('mine', 'e');
    assert.throws(
      () => addStock(repository, { offerId: 'free' }),
      (e) => e.message === 'OFFER_NOT_IDENTIFIED' && status(e) === 400,
    );
    assert.throws(
      () => addStock(repository, {}),
      (e) => status(e) === 400,
    );
    assert.throws(
      () => addStock(repository, { editionId: 'nope' }),
      (e) => status(e) === 404,
    );
    assert.throws(
      () => addStock(repository, { offerId: 'mine', editionId: 'other' }),
      (e) => status(e) === 400,
    );
    const bought = addStock(repository, { offerId: 'mine' });
    assert.equal(bought.editionId, 'e');
    assert.throws(
      () => addStock(repository, { offerId: 'mine' }),
      (e) => status(e) === 409,
    );
    // A vanished source offer keeps the copy (ON DELETE SET NULL).
    repository.database.prepare('DELETE FROM offers WHERE id=?').run('mine');
    const [item] = listStock(repository).items;
    assert.equal(item.offerId, null);
    assert.equal(item.editionTitle, 'Mort');
  } finally {
    repository.close();
  }
});

test('medians and "sold in 30 days" on a known set; no data is null, not 0', () => {
  const { repository } = world();
  try {
    assert.deepEqual(listStock(repository, { now: clock(0) }).medians, {
      boughtToListed: null,
      listedToSold: null,
    });
    assert.deepEqual(listStock(repository).soldIn30, { sold: 0, of: 0 });
    // a: bought 0, listed 2, sold 12 (10 days). b: bought 0, listed 4, sold 54 (50 days).
    // c: bought 0, listed 6, still listed. d: bought 0, not listed. e: listed 2, dropped.
    const copy = (listed, sold, drop) => {
      const { id } = addStock(repository, { editionId: 'e' }, { now: clock(0) });
      if (listed != null) moveStock(repository, id, 'listed', { now: clock(listed) });
      if (sold != null) moveStock(repository, id, 'sold', { now: clock(sold) });
      if (drop != null) moveStock(repository, id, 'dropped', { now: clock(drop) });
      return id;
    };
    copy(2, 12);
    copy(4, 54);
    copy(6);
    copy();
    copy(2, null, 20);
    const report = listStock(repository, { now: clock(60) });
    assert.deepEqual(report.counts, { bought: 1, listed: 1, sold: 2, dropped: 1 });
    // To listing: 2, 4, 6, 2 -> median 3. To sale: 10 and 50 -> median 30.
    assert.deepEqual(report.medians, { boughtToListed: 3, listedToSold: 30 });
    // Listed >= 30 days ago or sold: a, b, c (60-6=54 days) -> 3; e was dropped unsold, so it is no
    // try. Sold within 30: only a.
    assert.deepEqual(report.soldIn30, { sold: 1, of: 3 });
    assert.equal(median([]), null);
    assert.equal(median([4]), 4);
    assert.equal(median([1, 2, 9]), 2);
  } finally {
    repository.close();
  }
});

test('HTTP-style routes: create, move, undo, and 400 for a forbidden move', async () => {
  const { repository, offer } = world();
  try {
    offer('mine', 'e');
    const call = (method, path, input) => {
      const found = apiRoutes.match(method, path);
      assert.ok(found?.handler, `${method} ${path}`);
      return found.handler({ repo: repository, method, input, params: found.params });
    };
    const created = call('POST', '/api/stock', { offerId: 'mine' });
    assert.equal(created.status, 'bought');
    assert.throws(
      () => call('POST', `/api/stock/${created.id}/move`, { to: 'sold' }),
      (e) => status(e) === 400,
    );
    assert.equal(call('POST', `/api/stock/${created.id}/move`, { to: 'listed' }).status, 'listed');
    assert.equal(call('GET', '/api/stock').items.length, 1);
    assert.equal(call('POST', `/api/stock/${created.id}/undo`).status, 'bought');
  } finally {
    repository.close();
  }
});

test('"Wystawiłem" on an edition lists the waiting copy, or adds one; undo hides the added copy', () => {
  const { repository } = world();
  try {
    const waiting = addStock(repository, { editionId: 'e' }, { now: clock(0) });
    const first = listEdition(repository, 'e', { now: clock(3) });
    assert.deepEqual([first.id, first.created], [waiting.id, false]);
    const second = listEdition(repository, 'e', { now: clock(4) });
    assert.equal(second.created, true);
    assert.notEqual(second.id, waiting.id);
    assert.equal(listStock(repository, { now: clock(5) }).counts.listed, 2);
    assert.throws(
      () => listEdition(repository, 'nope'),
      (e) => status(e) === 404,
    );
    undoStock(repository, second.id);
    assert.equal(listStock(repository, { now: clock(5) }).items.length, 1);
  } finally {
    repository.close();
  }
});

test('a copy added by "Wystawiłem" is not a purchase: no artificial 0 in the median', () => {
  const { repository } = world();
  try {
    const bought = addStock(repository, { editionId: 'e' }, { now: clock(0) });
    moveStock(repository, bought.id, 'listed', { now: clock(4) });
    const direct = listEdition(repository, 'e', { now: clock(5) });
    assert.equal(direct.created, true);
    const report = listStock(repository, { now: clock(6) });
    assert.equal(report.counts.listed, 2);
    assert.equal(report.medians.boughtToListed, 4);
    const item = report.items.find((i) => i.id === direct.id);
    assert.equal(item.boughtKnown, false);
    assert.equal(item.ageDays, 1);
    // Only such copies: the median has no data.
    const second = world();
    try {
      listEdition(second.repository, 'e', { now: clock(1) });
      assert.equal(listStock(second.repository).medians.boughtToListed, null);
    } finally {
      second.repository.close();
    }
  } finally {
    repository.close();
  }
});

test('undo with expectedEventId: 409 and no change when the copy moved on', () => {
  const { repository } = world();
  try {
    const listed = listEdition(repository, 'e', { now: clock(1) });
    moveStock(repository, listed.id, 'sold', { now: clock(2) });
    assert.throws(
      () => undoStock(repository, listed.id, { expectedEventId: listed.eventId }),
      (e) => e.message === 'STOCK_CHANGED' && status(e) === 409,
    );
    let item = listStock(repository, { now: clock(3) }).items[0];
    assert.equal(item.status, 'sold');
    assert.equal(item.lastEventId > listed.eventId, true);
    // The route passes it on; the matching id undoes exactly that change.
    const found = apiRoutes.match('POST', `/api/stock/${listed.id}/undo`);
    const call = (input) =>
      found.handler({ repo: repository, method: 'POST', input, params: found.params });
    assert.throws(
      () => call({ expectedEventId: listed.eventId }),
      (e) => status(e) === 409,
    );
    assert.equal(call({ expectedEventId: item.lastEventId }).status, 'listed');
    item = listStock(repository, { now: clock(3) }).items[0];
    assert.equal(item.status, 'listed');
  } finally {
    repository.close();
  }
});

test('an undone purchase is hidden, keeps its journal, frees the offer and stays out of the week report', async () => {
  const { weekReport } = await import('../week-report.mjs');
  const { repository, offer } = world();
  try {
    offer('mine', 'e');
    const now = Date.parse('2026-10-08T12:00:00Z');
    const created = addStock(
      repository,
      { offerId: 'mine' },
      { now: () => new Date(now - 2 * DAY) },
    );
    const stockLine = () =>
      weekReport(repository, { now: () => now, to: '2026-10-07' }).sections.find(
        (section) => section.id === 'stock',
      )?.lines[0].text;
    assert.match(stockLine(), /Kupione: 1/);
    undoStock(repository, created.id, { expectedEventId: created.eventId });
    assert.equal(listStock(repository).items.length, 0);
    assert.equal(listStock(repository).counts.bought, 0);
    assert.equal(stockLine(), undefined);
    assert.equal(
      repository.database
        .prepare('SELECT count(*) AS n FROM stock_events WHERE item_id=?')
        .get(created.id).n,
      1,
    );
    assert.throws(
      () => moveStock(repository, created.id, 'listed'),
      (e) => status(e) === 404,
    );
    // The offer can be bought again; the hidden copy does not block it.
    assert.equal(addStock(repository, { offerId: 'mine' }).status, 'bought');
    assert.equal(listStock(repository).items.length, 1);
  } finally {
    repository.close();
  }
});

test('batch from a Łowca session: ISBN -> edition, unknown ISBNs are skipped with a reason, undo by event id', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
    repository.createEditionForISBN({ workId: 'w', isbn: '9788373196032', title: 'Mort' });
    const batch = addStockByIsbn(
      repository,
      [{ isbn: '978-83-7319-603-2' }, { isbn: '9788324000012' }, { isbn: 'abc' }],
      { now: clock(0) },
    );
    assert.equal(batch.created.length, 1);
    assert.equal(batch.created[0].isbn, '9788373196032');
    assert.deepEqual(
      batch.skipped.map((entry) => entry.reason),
      ['not_in_catalogue', 'invalid_isbn'],
    );
    const stock = listStock(repository, { now: clock(0) });
    assert.equal(stock.counts.bought, 1);
    assert.equal(stock.items[0].offerId, null);
    // the event id of the batch undoes exactly that copy; a later move makes it a 409
    const { id, eventId } = batch.created[0];
    moveStock(repository, id, 'listed', { now: clock(1) });
    assert.equal(
      status(
        (() => {
          try {
            undoStock(repository, id, { expectedEventId: eventId });
          } catch (error) {
            return error;
          }
        })(),
      ),
      409,
    );
    const found = apiRoutes.match('POST', '/api/stock/batch');
    assert.ok(found?.handler);
    const viaRoute = found.handler({
      repo: repository,
      method: 'POST',
      input: { items: [{ isbn: '9788373196032' }] },
      params: found.params,
    });
    assert.equal(viaRoute.created.length, 1);
    assert.throws(() => addStockByIsbn(repository, []), /ISBN_LIST_REQUIRED/);
    assert.throws(
      () =>
        addStockByIsbn(
          repository,
          Array.from({ length: 101 }, () => ({ isbn: '1' })),
        ),
      /TOO_MANY_ITEMS/,
    );
  } finally {
    repository.close?.();
  }
});
