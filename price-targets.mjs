// @ts-check
// "Kupuję do … zł": a price the owner names for an edition, or for a work (its Polish editions).
// An offer at or below it, still on sale, is a deal ("Twoja cena") whatever the market valuation
// says; it enters the deal list, and so the alerts and the inbox, once like any other deal. A price
// of 10 000 zł or more, or an unknown one, never counts. Comparison of the price with a number the
// owner chose: no costs and no profit.
import { randomUUID } from 'node:crypto';

/** CLAUDE.md: a price of 10 000 zł or more is treated as unknown. */
export const PRICE_LIMIT = 1_000_000;
const POLISH = /^(?:pl|pol|polish|polski|język polski)$/i;

/** An edition with no language stated counts as Polish, as in the work target. @param {unknown} language */
export const isPolishLanguage = (language) =>
  language == null || language === '' || POLISH.test(String(language));

/** @param {string} code @param {number} [status] */
const fail = (code, status = 400) => {
  throw Object.assign(Error(code), { statusCode: status });
};

/**
 * Sets (or changes) the target of an edition or a work; maxPrice in grosze.
 * @param {{ database: any }} repository
 * @param {{ editionId?: string, workId?: string, maxPrice: number, active?: boolean | undefined }} input
 * @param {{ now?: () => Date }} [options]
 */
export function setPriceTarget(repository, input, { now = () => new Date() } = {}) {
  const database = repository.database;
  const editionId = input.editionId ? String(input.editionId) : null;
  const workId = input.workId ? String(input.workId) : null;
  if (Boolean(editionId) === Boolean(workId)) fail('EDITION_OR_WORK_REQUIRED');
  const maxPrice = Number(input.maxPrice);
  if (!Number.isInteger(maxPrice) || maxPrice <= 0 || maxPrice >= PRICE_LIMIT)
    fail('INVALID_TARGET_PRICE');
  if (editionId && !database.prepare('SELECT 1 FROM editions WHERE id=?').get(editionId))
    fail('EDITION_NOT_FOUND', 404);
  if (workId && !database.prepare('SELECT 1 FROM works WHERE id=?').get(workId))
    fail('WORK_NOT_FOUND', 404);
  const at = now().toISOString();
  const existing = database
    .prepare(`SELECT id FROM price_targets WHERE ${editionId ? 'edition_id' : 'work_id'}=?`)
    .get(editionId ?? workId);
  // Without "active" an edit keeps the state the target has; a new target starts active.
  const active = input.active === undefined ? null : input.active === false ? 0 : 1;
  if (existing)
    database
      .prepare(
        'UPDATE price_targets SET max_price=?, active=coalesce(?, active), updated_at=? WHERE id=?',
      )
      .run(maxPrice, active, at, existing.id);
  else
    database
      .prepare(
        'INSERT INTO price_targets(id, scope, edition_id, work_id, max_price, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        editionId ? 'edition' : 'work',
        editionId,
        workId,
        maxPrice,
        active ?? 1,
        at,
        at,
      );
  const state = database
    .prepare(`SELECT active FROM price_targets WHERE ${editionId ? 'edition_id' : 'work_id'}=?`)
    .get(editionId ?? workId);
  return { editionId, workId, maxPrice, active: Boolean(state?.active) };
}

/** Switches a target off (kept, with its alerts) or on again. */
export function setPriceTargetActive(
  /** @type {{ database: any }} */ repository,
  /** @type {string} */ id,
  /** @type {boolean} */ active,
  { now = () => new Date() } = {},
) {
  const result = repository.database
    .prepare('UPDATE price_targets SET active=?, updated_at=? WHERE id=?')
    .run(active ? 1 : 0, now().toISOString(), id);
  if (!result.changes) fail('TARGET_NOT_FOUND', 404);
  return { id, active };
}

/** @param {{ database: any }} repository */
export function listPriceTargets(repository) {
  return repository.database
    .prepare(
      `SELECT t.id, t.scope, t.edition_id AS editionId, t.work_id AS workId, t.max_price AS maxPrice,
         t.active, coalesce(e.title, w.title) AS title
       FROM price_targets t LEFT JOIN editions e ON e.id=t.edition_id LEFT JOIN works w ON w.id=t.work_id
       ORDER BY t.updated_at DESC`,
    )
    .all()
    .map((/** @type {any} */ row) => ({
      id: String(row.id),
      scope: String(row.scope),
      editionId: row.editionId ?? null,
      workId: row.workId ?? null,
      maxPrice: Number(row.maxPrice),
      active: Boolean(row.active),
      title: String(row.title ?? ''),
    }));
}

/**
 * The active targets, ready to match an offer: by edition, and by work for Polish editions.
 * @param {{ database: any }} repository
 */
export function activeTargets(repository) {
  const byEdition = new Map();
  const byWork = new Map();
  for (const row of repository.database
    .prepare('SELECT edition_id, work_id, max_price FROM price_targets WHERE active=1')
    .all()) {
    if (row.edition_id) byEdition.set(String(row.edition_id), Number(row.max_price));
    else byWork.set(String(row.work_id), Number(row.max_price));
  }
  const languages = new Map(
    repository.database
      .prepare('SELECT id, language FROM editions')
      .all()
      .map((/** @type {any} */ row) => [
        String(row.id),
        row.language == null ? '' : String(row.language),
      ]),
  );
  /**
   * The target an offer on this edition of this work meets at this price, or null. A work target
   * covers editions in Polish (or with no language stated), never a foreign one.
   * @param {string} editionId @param {string} workId @param {number} price grosze
   */
  return (editionId, workId, price) => {
    if (!(price > 0) || price >= PRICE_LIMIT) return null;
    const own = byEdition.get(editionId);
    const polish = languages.has(editionId) && isPolishLanguage(languages.get(editionId));
    const forWork = polish ? byWork.get(workId) : undefined;
    const max = Math.max(own ?? 0, forWork ?? 0);
    return max > 0 && price <= max ? { maxPrice: max } : null;
  };
}
