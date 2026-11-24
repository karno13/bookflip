// @ts-check
// „Obserwowany sprzedawca”: a mark on a seller id of a source. Read by the deals list (mark and
// filter) and the seller bundles; it sends no request and changes no ranking. An offer without a
// seller id cannot be watched.

/** @param {string} code @param {number} [status] */
const fail = (code, status = 400) => {
  throw Object.assign(Error(code), { statusCode: status });
};

/** @param {{ database: any }} repository @returns {Set<string>} keys `source\u0000sellerId` */
export function watchedKeys(repository) {
  return new Set(
    repository.database
      .prepare('SELECT source, seller_id FROM watched_sellers')
      .all()
      .map((/** @type {any} */ row) => `${row.source}\u0000${row.seller_id}`),
  );
}

/** @param {string} source @param {string} sellerId */
export const watchKey = (source, sellerId) => `${source}\u0000${sellerId}`;

/** @param {{ database: any }} repository */
export function listWatched(repository) {
  return {
    items: repository.database
      .prepare(
        'SELECT source, seller_id AS sellerId, note, created_at AS createdAt FROM watched_sellers ORDER BY created_at DESC, seller_id',
      )
      .all(),
  };
}

/**
 * @param {{ database: any }} repository
 * @param {{ source?: string, sellerId?: string, note?: string }} input
 * @param {{ now?: () => Date }} [options]
 */
export function watchSeller(repository, input, { now = () => new Date() } = {}) {
  const source = String(input?.source ?? '').trim();
  const sellerId = String(input?.sellerId ?? '').trim();
  if (!source || !sellerId) fail('SELLER_ID_REQUIRED');
  if (source.length > 100 || sellerId.length > 100) fail('SELLER_ID_TOO_LONG');
  const note = input?.note == null ? null : String(input.note).trim().slice(0, 200) || null;
  repository.database
    .prepare(
      'INSERT INTO watched_sellers(source, seller_id, note, created_at) VALUES (?,?,?,?) ON CONFLICT(source, seller_id) DO UPDATE SET note=excluded.note',
    )
    .run(source, sellerId, note, now().toISOString());
  return { source, sellerId, watched: true };
}

/** @param {{ database: any }} repository @param {string} source @param {string} sellerId */
export function unwatchSeller(repository, source, sellerId) {
  repository.database
    .prepare('DELETE FROM watched_sellers WHERE source=? AND seller_id=?')
    .run(String(source ?? ''), String(sellerId ?? ''));
  return { source, sellerId, watched: false };
}
