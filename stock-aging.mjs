// @ts-check
// Przypomnienie o obniżce: a copy in "listed" that has been up longer than the market index says an
// edition takes to sell (median days to a sale) gets a marker "leży N dni, przewidywane M; sugerowana
// obniżka do X zł". The suggestion comes from the listing card's tiers (middle -> "szybka sprzedaż")
// and is only displayed: nothing is stored as profit or cost; the owner's own price is not stored.
// "Obniżyłem cenę" stores a date (silent for 7 days), "Zostaw" stores the market price at that moment
// and keeps the reminder silent until it changes. Calibration (own 30-day chance against the index)
// needs at least 20 sold copies, below that it says "za mało danych" with no number.
import { editionLiquidity, liquidityModel } from './market-index.mjs';
import { listingCard } from './listing-card.mjs';
import { listStock } from './stock.mjs';

const DAY = 86_400_000;
export const QUIET_DAYS = 7;
export const MIN_CALIBRATION_SOLD = 20;
/** SQL: copies whose first event was undone are hidden (same rule as stock.mjs). */
const VISIBLE =
  'NOT EXISTS (SELECT 1 FROM stock_events h WHERE h.item_id=s.id AND h.from_status IS NULL AND h.undone_at IS NOT NULL)';

/** @param {string} code @param {number} [status] */
const fail = (code, status = 400) => {
  throw Object.assign(Error(code), { statusCode: status });
};

/**
 * The middle tier moves with every new offer and with `at`, so "unchanged" means within the larger of
 * 1 zł and 5%. @param {number | null} before @param {number | null} now grosze
 */
function sameMarket(before, now) {
  if (before == null || now == null) return before === now;
  return Math.abs(now - before) < Math.max(100, before * 0.05);
}

/**
 * Pure rule. Returns null when no reminder is due (not listed, not older than the median, quiet
 * after a repricing, or left alone while the market price is unchanged).
 * @param {{ status: string, listedAt: string | null, repricedAt?: string | null, snoozedAt?: string | null, snoozedMarket?: number | null }} item
 * @param {{ medianDays: number | null, tiers: { quick: number, middle: number } | null }} market grosze
 * @param {number} now ms
 */
export function stockAging(item, market, now) {
  if (item.status !== 'listed' || !item.listedAt || !market.medianDays) return null;
  const listed = Date.parse(item.listedAt);
  if (!Number.isFinite(listed)) return null;
  const daysListed = Math.floor((now - listed) / DAY);
  if (daysListed <= market.medianDays) return null;
  if (item.repricedAt) {
    // A date in the future (clock change, bad data) does not silence anything.
    const since = now - Date.parse(item.repricedAt);
    if (Number.isFinite(since) && since >= 0 && since < QUIET_DAYS * DAY) return null;
  }
  const marketPrice = market.tiers ? market.tiers.middle : null;
  if (item.snoozedAt && sameMarket(item.snoozedMarket ?? null, marketPrice)) return null;
  // The owner's price is not stored and the middle tier (always above the quick one) stands for it,
  // so the suggestion is simply the "szybka sprzedaż" tier.
  const suggestion = market.tiers ? market.tiers.quick : null;
  const reason = market.tiers ? null : 'za_malo_ofert';
  return { daysListed, expectedDays: market.medianDays, suggestion, reason };
}

/** Wilson 95% interval of a share. @param {number} hits @param {number} n */
function wilson(hits, n) {
  const z = 1.96;
  const p = hits / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)].map(
    (value) => Math.round(value * 1000) / 1000,
  );
}

/**
 * Reminders for listed copies plus the calibration of the owner's chance against the index.
 * @param {any} repository
 * @param {{ now?: () => Date }} [options]
 */
export function agingReport(repository, { now = () => new Date() } = {}) {
  const at = now().getTime();
  const database = repository.database;
  const { items } = listStock(repository, { now });
  const extra = new Map(
    database
      .prepare('SELECT id, repriced_at, aging_snoozed_at, aging_snoozed_market FROM stock_items')
      .all()
      .map((/** @type {any} */ row) => [String(row.id), row]),
  );
  const model = liquidityModel(database, at);
  /** @type {Map<string, { quick: number, middle: number } | null>} */
  const tiersByEdition = new Map();
  const tiersOf = (/** @type {string} */ editionId) => {
    if (!tiersByEdition.has(editionId)) {
      tiersByEdition.set(editionId, marketTiers(repository, editionId, at));
    }
    return tiersByEdition.get(editionId) ?? null;
  };
  const reminders = [];
  for (const item of items) {
    if (item.status !== 'listed') continue;
    const row = extra.get(item.id);
    const result = stockAging(
      {
        status: item.status,
        listedAt: item.listedAt,
        repricedAt: row?.repriced_at ?? null,
        snoozedAt: row?.aging_snoozed_at ?? null,
        snoozedMarket: row?.aging_snoozed_market == null ? null : Number(row.aging_snoozed_market),
      },
      {
        medianDays: editionLiquidity(model, item.editionId).medianDays,
        tiers: tiersOf(item.editionId),
      },
      at,
    );
    if (result) reminders.push({ itemId: item.id, ...result });
  }
  const soldCount = items.filter((item) => item.soldAt && item.listedAt).length;
  /** @type {any} */
  let calibration = { enough: false };
  if (soldCount >= MIN_CALIBRATION_SOLD) {
    const tried = items.filter(
      (item) =>
        item.listedAt &&
        (item.soldAt || (item.status !== 'dropped' && Date.parse(item.listedAt) <= at - 30 * DAY)),
    );
    const hits = tried.filter(
      (item) =>
        item.soldAt && Date.parse(item.soldAt) - Date.parse(String(item.listedAt)) <= 30 * DAY,
    ).length;
    const index =
      tried.reduce((sum, item) => sum + editionLiquidity(model, item.editionId).chance, 0) /
      tried.length;
    const [low, high] = wilson(hits, tried.length);
    calibration = {
      enough: true,
      tries: tried.length,
      sold30: hits,
      own: Math.round((hits / tried.length) * 1000) / 1000,
      low,
      high,
      index: Math.round(index * 1000) / 1000,
    };
  }
  return { reminders, calibration };
}

/** Quick and middle price of the listing card in grosze, or null without a reliable valuation. */
function marketTiers(
  /** @type {any} */ repository,
  /** @type {string} */ editionId,
  /** @type {number} */ at,
) {
  let card;
  try {
    card = listingCard(repository, editionId, { at });
  } catch (error) {
    // An edition that is gone is expected (no valuation); anything else is logged, not swallowed.
    if (/** @type {any} */ (error)?.statusCode !== 404)
      console.error('stock-aging: listingCard', error);
    return null;
  }
  if (!card.tiers) return null;
  const price = (/** @type {string} */ id) =>
    card.tiers.find((/** @type {any} */ t) => t.id === id)?.price;
  const quick = Number(price('szybko'));
  const middle = Number(price('srodek'));
  if (!Number.isFinite(quick) || !Number.isFinite(middle)) {
    console.error('stock-aging: listing card tiers "szybko"/"srodek" missing');
    return null;
  }
  return { quick, middle };
}

/** "Obniżyłem cenę": stores the date only. @param {any} repository @param {string} id @param {{ now?: () => Date }} [options] */
export function markRepriced(repository, id, { now = () => new Date() } = {}) {
  const at = now().toISOString();
  const result = repository.database
    .prepare(
      `UPDATE stock_items AS s SET repriced_at=?, aging_snoozed_at=NULL, aging_snoozed_market=NULL, updated_at=?
       WHERE s.id=? AND s.status='listed' AND ${VISIBLE}`,
    )
    .run(at, at, String(id));
  if (!result.changes) fail('STOCK_NOT_LISTED', 404);
  return { id: String(id), repricedAt: at };
}

/** "Zostaw": silent until the market price of the edition changes. @param {any} repository @param {string} id @param {{ now?: () => Date }} [options] */
export function keepPrice(repository, id, { now = () => new Date() } = {}) {
  const row = repository.database
    .prepare(
      `SELECT s.edition_id FROM stock_items s WHERE s.id=? AND s.status='listed' AND ${VISIBLE}`,
    )
    .get(String(id));
  if (!row) fail('STOCK_NOT_LISTED', 404);
  const at = now();
  const middle = marketTiers(repository, String(row.edition_id), at.getTime())?.middle ?? null;
  repository.database
    .prepare(
      'UPDATE stock_items SET aging_snoozed_at=?, aging_snoozed_market=?, updated_at=? WHERE id=?',
    )
    .run(at.toISOString(), middle, at.toISOString(), String(id));
  return { id: String(id), snoozedAt: at.toISOString() };
}
