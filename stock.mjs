// @ts-check
// Rejestr zapasu: the owner's copies as states and dates only (bought -> listed -> sold, or
// dropped), no amounts. A copy needs an edition (ISBN evidence): "bought" from an offer that is not
// assigned to an edition is refused and the owner is sent to the review queue. Every change is a
// row in stock_events; the last change that is not undone can be taken back (optionally only that
// exact event: expectedEventId, else 409). Undoing the first event hides the copy (its first event
// gets undone_at) instead of deleting it: the journal stays, lists and counts skip it. A copy added
// by "Wystawiłem" has no "bought" event (it starts with null -> listed), so it has no real purchase
// date and stays out of the bought -> listed median. Medians come from the dates; no data is null.
import { randomUUID } from 'node:crypto';
import { editionRowByIsbn } from './hunter.mjs';
import { normalizeISBN } from './isbn-normalization.mjs';

const DAY = 86_400_000;
/** Allowed forward moves; "dropped" is reachable from every state but itself. */
export const TRANSITIONS = {
  bought: ['listed', 'dropped'],
  listed: ['sold', 'dropped'],
  sold: ['dropped'],
  dropped: [],
};
/** SQL: copies whose first event (the purchase or first listing) was undone are hidden. */
const HIDDEN = (/** @type {string} */ alias) =>
  `EXISTS (SELECT 1 FROM stock_events h WHERE h.item_id=${alias}.id AND h.from_status IS NULL AND h.undone_at IS NOT NULL)`;
const DATE_COLUMN = { listed: 'listed_at', sold: 'sold_at', dropped: 'dropped_at' };

/** @param {string} code @param {number} [status] */
const fail = (code, status = 400) => {
  throw Object.assign(Error(code), { statusCode: status });
};

/** Median of a list of numbers, or null for an empty list. @param {number[]} values */
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Whole days between two ISO times (rounded), or null when one is missing. */
function days(from, to) {
  if (!from || !to) return null;
  const span = Date.parse(to) - Date.parse(from);
  return Number.isFinite(span) && span >= 0 ? Math.round(span / DAY) : null;
}

/** Id of the newest event of a copy that is not undone, or null. @param {any} database @param {string} id */
function lastEventId(database, id) {
  const row = database
    .prepare(
      'SELECT id FROM stock_events WHERE item_id=? AND undone_at IS NULL ORDER BY id DESC LIMIT 1',
    )
    .get(id);
  return row ? Number(row.id) : null;
}

/** A visible copy or a 404 (hidden copies are gone for the owner). @param {any} database @param {string} id */
function visibleItem(database, id) {
  const item = database
    .prepare(`SELECT id, status FROM stock_items s WHERE id=? AND NOT ${HIDDEN('s')}`)
    .get(String(id));
  if (!item) fail('STOCK_NOT_FOUND', 404);
  return item;
}

/** @param {any} repository @param {() => any} work */
function atomic(repository, work) {
  return typeof repository.transaction === 'function' ? repository.transaction(work) : work();
}

/**
 * A new copy in state "bought". Either an offer (its active edition is used) or an edition.
 * @param {any} repository
 * @param {{ offerId?: string, editionId?: string, note?: string }} input
 * @param {{ now?: () => Date }} [options]
 */
export function addStock(repository, input, { now = () => new Date() } = {}) {
  const database = repository.database;
  const offerId = input?.offerId ? String(input.offerId) : null;
  let editionId = input?.editionId ? String(input.editionId) : null;
  if (!offerId && !editionId) fail('OFFER_OR_EDITION_REQUIRED');
  if (offerId) {
    if (!database.prepare('SELECT 1 FROM offers WHERE id=?').get(offerId))
      fail('OFFER_NOT_FOUND', 404);
    const match = database
      .prepare(
        `SELECT m.edition_id AS editionId FROM offer_matches m JOIN editions e ON e.id=m.edition_id
         WHERE m.offer_id=? AND m.status='active' AND e.is_unknown=0`,
      )
      .get(offerId);
    // Only ISBN evidence makes a copy: an unassigned offer goes through the review queue first.
    if (!match) fail('OFFER_NOT_IDENTIFIED');
    if (editionId && editionId !== match.editionId) fail('EDITION_MISMATCH');
    editionId = String(match.editionId);
    if (
      database
        .prepare(
          `SELECT 1 FROM stock_items s WHERE offer_id=? AND status<>'dropped' AND NOT ${HIDDEN('s')}`,
        )
        .get(offerId)
    )
      fail('ALREADY_IN_STOCK', 409);
  } else if (!database.prepare('SELECT 1 FROM editions WHERE id=? AND is_unknown=0').get(editionId))
    fail('EDITION_NOT_FOUND', 404);
  const note = input?.note == null ? null : String(input.note).trim().slice(0, 500) || null;
  const at = now().toISOString();
  const id = randomUUID();
  // Where it came from, kept as a snapshot: the offer may disappear (stock-attribution.mjs).
  const origin = offerId
    ? database
        .prepare(
          `SELECT source, seller_id AS sellerId,
             CASE WHEN json_valid(matched_queries_json) THEN substr(json_extract(matched_queries_json, '$[0]'), 1, 300) END AS phrase
           FROM offers WHERE id=?`,
        )
        .get(offerId)
    : null;
  atomic(repository, () => {
    database
      .prepare(
        `INSERT INTO stock_items(id, edition_id, offer_id, status, bought_at, note, created_at, updated_at, source, source_seller_id, source_phrase)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        editionId,
        offerId,
        'bought',
        at,
        note,
        at,
        at,
        origin?.source ?? null,
        origin?.sellerId ?? null,
        origin?.phrase ?? null,
      );
    database
      .prepare('INSERT INTO stock_events(item_id, from_status, to_status, at) VALUES (?,?,?,?)')
      .run(id, null, 'bought', at);
  });
  return {
    id,
    editionId,
    offerId,
    status: 'bought',
    boughtAt: at,
    eventId: lastEventId(database, id),
  };
}

export const BATCH_LIMIT = 100;

/**
 * "Kupiłem zaznaczone" in a Łowca session: one copy per ISBN, through addStock. An ISBN that is not
 * valid or has no edition in the catalogue is skipped with a reason (the owner is sent to the review
 * queue), never an error for the whole batch.
 * @param {any} repository
 * @param {{ isbn?: string }[]} items
 * @param {{ now?: () => Date }} [options]
 */
export function addStockByIsbn(repository, items, options = {}) {
  if (!Array.isArray(items) || !items.length) fail('ISBN_LIST_REQUIRED');
  if (items.length > BATCH_LIMIT) fail('TOO_MANY_ITEMS');
  /** @type {{ isbn: string, id: string, editionId: string, eventId: number | null }[]} */
  const created = [];
  /** @type {{ isbn: string, reason: string }[]} */
  const skipped = [];
  for (const item of items) {
    const typed = String(item?.isbn ?? '').trim();
    const isbn = normalizeISBN(typed);
    if (!isbn) {
      skipped.push({ isbn: typed, reason: 'invalid_isbn' });
      continue;
    }
    const row = editionRowByIsbn(repository.database, isbn);
    if (!row) {
      skipped.push({ isbn, reason: 'not_in_catalogue' });
      continue;
    }
    const copy = addStock(repository, { editionId: String(row.editionId) }, options);
    created.push({ isbn, id: copy.id, editionId: copy.editionId, eventId: copy.eventId });
  }
  return { created, skipped };
}

/**
 * Moves a copy to the next state (see TRANSITIONS); anything else is a 400.
 * @param {any} repository
 * @param {string} id
 * @param {string} to
 * @param {{ now?: () => Date }} [options]
 */
export function moveStock(repository, id, to, { now = () => new Date() } = {}) {
  const database = repository.database;
  const item = visibleItem(database, id);
  if (!Object.hasOwn(DATE_COLUMN, to)) fail('INVALID_STOCK_STATE');
  if (!TRANSITIONS[/** @type {keyof typeof TRANSITIONS} */ (item.status)].includes(to))
    fail('INVALID_STOCK_TRANSITION');
  const at = now().toISOString();
  atomic(repository, () => {
    database
      .prepare(
        `UPDATE stock_items SET status=?, ${DATE_COLUMN[/** @type {'listed'} */ (to)]}=?, updated_at=? WHERE id=?`,
      )
      .run(to, at, at, item.id);
    database
      .prepare('INSERT INTO stock_events(item_id, from_status, to_status, at) VALUES (?,?,?,?)')
      .run(item.id, item.status, to, at);
  });
  return { id: item.id, status: to, at, eventId: lastEventId(database, item.id) };
}

/**
 * Takes back the last change that is not undone. Undoing the first event hides the copy (the
 * journal stays). With expectedEventId the undo happens only if that event is still the last one,
 * else 409 STOCK_CHANGED and nothing changes (a toast must not undo a later move).
 * @param {any} repository
 * @param {string} id
 * @param {{ now?: () => Date, expectedEventId?: number | string | null }} [options]
 */
export function undoStock(repository, id, { now = () => new Date(), expectedEventId = null } = {}) {
  const database = repository.database;
  const item = visibleItem(database, id);
  const last = database
    .prepare(
      'SELECT * FROM stock_events WHERE item_id=? AND undone_at IS NULL ORDER BY id DESC LIMIT 1',
    )
    .get(item.id);
  if (!last) fail('NOTHING_TO_UNDO');
  if (expectedEventId != null && Number(expectedEventId) !== Number(last.id))
    fail('STOCK_CHANGED', 409);
  const at = now().toISOString();
  return atomic(repository, () => {
    if (last.from_status == null) {
      database.prepare('UPDATE stock_events SET undone_at=? WHERE id=?').run(at, last.id);
      return { id: item.id, removed: true, status: null };
    }
    database
      .prepare(
        `UPDATE stock_items SET status=?, ${DATE_COLUMN[/** @type {'listed'} */ (last.to_status)]}=NULL, updated_at=? WHERE id=?`,
      )
      .run(last.from_status, at, item.id);
    database.prepare('UPDATE stock_events SET undone_at=? WHERE id=?').run(at, last.id);
    return { id: item.id, removed: false, status: last.from_status };
  });
}

/**
 * The register: copies (newest first), counts per state and the time medians in days.
 * "Sold within 30 days: N of M" counts copies listed at least 30 days ago, plus every sold copy.
 * @param {any} repository
 * @param {{ now?: () => Date }} [options]
 */
export function listStock(repository, { now = () => new Date() } = {}) {
  const at = now();
  const rows = repository.database
    .prepare(
      `SELECT s.*, e.title AS editionTitle, e.work_id AS workId, w.title AS workTitle,
         (SELECT count(*) FROM stock_events v WHERE v.item_id=s.id AND v.undone_at IS NULL) AS events,
         (SELECT max(v.id) FROM stock_events v WHERE v.item_id=s.id AND v.undone_at IS NULL) AS lastEventId,
         EXISTS (SELECT 1 FROM stock_events v WHERE v.item_id=s.id AND v.to_status='bought') AS boughtKnown
       FROM stock_items s JOIN editions e ON e.id=s.edition_id JOIN works w ON w.id=e.work_id
       WHERE NOT ${HIDDEN('s')}
       ORDER BY s.bought_at DESC, s.id`,
    )
    .all();
  const items = rows.map((row) => ({
    id: String(row.id),
    editionId: String(row.edition_id),
    editionTitle: String(row.editionTitle),
    workId: String(row.workId),
    workTitle: String(row.workTitle),
    offerId: row.offer_id ?? null,
    status: String(row.status),
    boughtAt: String(row.bought_at),
    boughtKnown: Boolean(row.boughtKnown),
    listedAt: row.listed_at ?? null,
    soldAt: row.sold_at ?? null,
    droppedAt: row.dropped_at ?? null,
    note: row.note ?? null,
    ageDays: days(
      row.boughtKnown ? row.bought_at : row.listed_at,
      row.sold_at ?? row.dropped_at ?? at.toISOString(),
    ),
    next: TRANSITIONS[/** @type {keyof typeof TRANSITIONS} */ (row.status)] ?? [],
    canUndo: Number(row.events) > 0,
    lastEventId: row.lastEventId == null ? null : Number(row.lastEventId),
  }));
  const counts = { bought: 0, listed: 0, sold: 0, dropped: 0 };
  for (const item of items) counts[/** @type {keyof typeof counts} */ (item.status)] += 1;
  /** @param {(number | null)[]} list */
  const known = (list) => list.filter((value) => value != null);
  // Only copies with a real "bought" event: one added by "Wystawiłem" would give an artificial 0.
  const toListed = known(
    items.map((item) => (item.boughtKnown ? days(item.boughtAt, item.listedAt) : null)),
  );
  const toSold = known(
    items.map((item) => (item.soldAt ? days(item.listedAt, item.soldAt) : null)),
  );
  const cutoff = at.getTime() - 30 * DAY;
  // A try is a copy that was sold, or is still on sale and listed 30+ days ago; a copy dropped
  // without ever being sold is not a try (it left the stock, it says nothing about the market).
  const tried = items.filter(
    (item) =>
      item.listedAt &&
      (item.soldAt || (item.status !== 'dropped' && Date.parse(item.listedAt) <= cutoff)),
  );
  const soldIn30 = tried.filter((item) => {
    const span = days(item.listedAt, item.soldAt);
    return item.soldAt && span != null && span <= 30;
  });
  return {
    items,
    counts,
    medians: {
      boughtToListed: median(/** @type {number[]} */ (toListed)),
      listedToSold: median(/** @type {number[]} */ (toSold)),
    },
    soldIn30: { sold: soldIn30.length, of: tried.length },
  };
}

/**
 * "Wystawiłem" on an edition page: the oldest copy of that edition still in "bought" goes to
 * "listed"; without one a copy is added that starts as listed (no "bought" event, so no purchase date).
 * @param {any} repository
 * @param {string} editionId
 * @param {{ now?: () => Date }} [options]
 */
export function listEdition(
  repository,
  editionId,
  options = /** @type {{ now?: () => Date }} */ ({}),
) {
  const id = String(editionId ?? '');
  if (!id) fail('OFFER_OR_EDITION_REQUIRED');
  return atomic(repository, () => {
    const waiting = repository.database
      .prepare(
        "SELECT id FROM stock_items WHERE edition_id=? AND status='bought' ORDER BY bought_at, id LIMIT 1",
      )
      .get(id);
    if (waiting) {
      const moved = moveStock(repository, String(waiting.id), 'listed', options);
      return { id: String(waiting.id), status: 'listed', created: false, eventId: moved.eventId };
    }
    const database = repository.database;
    if (!database.prepare('SELECT 1 FROM editions WHERE id=? AND is_unknown=0').get(id))
      fail('EDITION_NOT_FOUND', 404);
    const at = (options.now ?? (() => new Date()))().toISOString();
    const itemId = randomUUID();
    // bought_at is NOT NULL: it holds the listing time and is ignored without a "bought" event.
    database
      .prepare(
        `INSERT INTO stock_items(id, edition_id, offer_id, status, bought_at, listed_at, note, created_at, updated_at)
         VALUES (?,?,NULL,'listed',?,?,NULL,?,?)`,
      )
      .run(itemId, id, at, at, at, at);
    database
      .prepare('INSERT INTO stock_events(item_id, from_status, to_status, at) VALUES (?,?,?,?)')
      .run(itemId, null, 'listed', at);
    return { id: itemId, status: 'listed', created: true, eventId: lastEventId(database, itemId) };
  });
}
