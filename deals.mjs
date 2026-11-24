// @ts-check
// "Okazje": offers that can be bought now for clearly less than their edition is worth. The worth
// is the market valuation (market-valuation.mjs) of the edition counted WITHOUT the offer itself —
// otherwise a cheap listing would pull its own reference down — and brought to the offer's
// condition. The list is computed from the current offers; only the owner's verdict on an entry
// ("was it a real deal?", deal_verdicts) is stored, to measure how often the list is right.
import {
  CONDITION_FACTOR,
  estimateValue,
  marketObservations,
  valuationOptions,
} from './market-valuation.mjs';
import { offerKind, offerKindSql } from './offer-kinds.mjs';
import { proxiedImage } from './offer-images.mjs';
import { editionLiquidity, liquidityModel } from './market-index.mjs';
import { reactionMedianMinutes, triageRows, triageView } from './deal-triage.mjs';
import { activeTargets } from './price-targets.mjs';
import { priceDrops, suggestedPrice } from './price-drops.mjs';
import { rejectionHabits } from './triage-learning.mjs';
import { watchedKeys, watchKey } from './watched-sellers.mjs';

/**
 * How fast the deal's edition sells (market-index.mjs) and the expected gain: the saving times
 * the chance that a listed copy sells within 30 days. A big saving on a book nobody buys ranks
 * below a smaller one on a book that sells.
 * @param {import('./market-index.mjs').LiquidityModel} model
 */
function dealLiquidity(model, editionId, saving) {
  const liquidity = editionLiquidity(model, editionId);
  return {
    liquidity: {
      chance: liquidity.chance,
      medianDays: liquidity.medianDays,
      level: liquidity.level,
      sales: liquidity.sales,
      listings: liquidity.listings,
    },
    expected: Math.round((saving * liquidity.chance) / 100) * 100,
  };
}

/**
 * A valuation of low confidence weighs less in the ranking: the same saving on a low-confidence
 * valuation always ranks below one on a high-confidence valuation (rank = expected gain × weight).
 */
export const CONFIDENCE_WEIGHT = { high: 1, medium: 0.7, low: 0.4, none: 0.2 };
/** An offer not refreshed this long, while other offers of its work at the same source were, may be gone. */
export const MAYBE_GONE_HOURS = 48;

/** @param {string} confidence @param {number} expected */
export function dealRank(confidence, expected) {
  const weight =
    CONFIDENCE_WEIGHT[/** @type {keyof typeof CONFIDENCE_WEIGHT} */ (confidence)] ?? 0.2;
  return Number.isFinite(expected) ? Math.round(expected * weight) : 0;
}

/** An offer is a deal from this share below its worth, and at least this many grosze. */
export const DEAL_MIN_DISCOUNT = 0.2;
export const DEAL_MIN_SAVING = 500;
/** This far below the worth is more often a wrong assignment than a bargain. */
export const DEAL_SUSPICIOUS_DISCOUNT = 0.7;
/** An offer not seen for this long is probably gone (a source no longer scanned, a missed removal): no deal. */
export const STALE_DAYS = 14;
const BUYABLE = ['available', 'unconfirmed'];
/**
 * Demand for an edition: the median favourite count of its other Vinted listings, from this many.
 * On saved data (2026-11-20) a listing sold 3.4% of the time when the other listings of its edition
 * had a median of 0–1 favourites, 5.1% at 4–7 and 8.6% at 8 or more.
 */
export const DEMAND_MIN_OFFERS = 2;
export const DEMAND_LEVELS = { high: 8, medium: 4 };

/** @param {number[]} counts */
export function editionDemand(counts) {
  if (counts.length < DEMAND_MIN_OFFERS) return null;
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const level =
    median >= DEMAND_LEVELS.high ? 'high' : median >= DEMAND_LEVELS.medium ? 'medium' : 'low';
  return { median, offers: counts.length, level };
}

/** Owner's verdicts on a deal: real, wrong book or edition, other condition or a set, worth too high. */
export const DEAL_VERDICTS = ['good', 'wrong_match', 'condition', 'overvalued'];

/**
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {{ at?: number, includeWatched?: boolean, includeNear?: boolean }} [options]
 */
export function listDeals(
  repository,
  { at = Date.now(), includeWatched = false, includeNear = false } = {},
) {
  const database = repository.database;
  const rows = database
    .prepare(
      `SELECT o.id, o.source, o.original_title AS title, o.normalized_url AS url, o.image_url AS image,
         o.current_price AS price, coalesce(o.condition_class,'unknown') AS condition,
         o.favourite_count AS favourites, o.seller_id AS sellerId, o.seller_name AS sellerName, e.publisher AS publisher,
         o.first_seen_at AS firstSeenAt, o.last_seen_at AS lastSeenAt, o.listed_at AS listedAt, m.edition_id AS editionId, e.title AS editionTitle,
         e.work_id AS workId, w.title AS workTitle
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id
         JOIN editions e ON e.id=m.edition_id JOIN works w ON w.id=e.work_id
       WHERE m.status='active' AND e.is_unknown=0 AND o.currency='PLN' AND o.current_price>0
         AND o.availability IN (${BUYABLE.map((value) => `'${value}'`).join(',')})
         AND NOT EXISTS (SELECT 1 FROM offer_sets s WHERE s.offer_id=o.id AND s.dismissed_at IS NULL)
         AND (o.last_seen_at IS NULL OR o.last_seen_at >= ?)`,
    )
    .all(new Date(at - STALE_DAYS * 86_400_000).toISOString());
  const observations = marketObservations(database, 'edition', [
    ...new Set(rows.map((row) => String(row.editionId))),
  ]);
  // Per source and work, the latest time one of its buyable offers was seen: the source was read
  // about that work then. Another work's refresh says nothing (the sniper only refreshes some works).
  const latestSeen = new Map();
  for (const row of database
    .prepare(
      `SELECT o.source AS source, e.work_id AS workId, max(o.last_seen_at) AS latest
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id JOIN editions e ON e.id=m.edition_id
       WHERE m.status='active' AND o.availability IN (${BUYABLE.map((value) => `'${value}'`).join(',')})
       GROUP BY 1, 2`,
    )
    .all())
    latestSeen.set(`${row.source}|${row.workId}`, Date.parse(String(row.latest ?? '')));
  const maybeGone = (/** @type {any} */ row) => {
    const latest = latestSeen.get(`${row.source}|${row.workId}`);
    const seen = Date.parse(String(row.lastSeenAt ?? ''));
    return (
      latest !== undefined &&
      Number.isFinite(latest) &&
      Number.isFinite(seen) &&
      latest - seen > MAYBE_GONE_HOURS * 3_600_000
    );
  };
  // Read-only flag: a used offer is no deal if a new copy of the same edition costs no more. Only a
  // mark; the ranking, the worth and the deal set do not depend on it.
  const cheapestNew = new Map();
  for (const row of database
    .prepare(
      `SELECT m.edition_id AS editionId, o.source AS source, o.normalized_url AS url, o.current_price AS price
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id JOIN editions e ON e.id=m.edition_id
       WHERE m.status='active' AND e.is_unknown=0 AND o.currency='PLN' AND o.current_price>0
         AND o.current_price<1000000 AND ${offerKindSql('o')}='new_shop'
         AND o.availability IN (${BUYABLE.map((value) => `'${value}'`).join(',')})
         AND (o.last_seen_at IS NULL OR o.last_seen_at >= ?)
         AND m.edition_id IN (SELECT value FROM json_each(?))
       ORDER BY o.current_price, o.id`,
    )
    .all(
      new Date(at - STALE_DAYS * 86_400_000).toISOString(),
      JSON.stringify([...new Set(rows.map((row) => String(row.editionId)))]),
    )) {
    const key = String(row.editionId);
    if (!cheapestNew.has(key))
      cheapestNew.set(key, {
        source: String(row.source),
        url: String(row.url),
        price: Number(row.price),
      });
  }
  const newCheaper = (/** @type {any} */ row) => {
    if (offerKind({ source: row.source, sellerName: row.sellerName }) === 'new_shop') return null;
    const found = cheapestNew.get(String(row.editionId));
    return found && found.price <= Number(row.price) ? found : null;
  };
  // Read-only flag: strictly below every other buyable live offer of the same edition (any source,
  // same freshness and unknown-price rules as above). Only a mark; ranking and worth ignore it.
  /** @type {Map<string, { id: string, price: number }[]>} */
  const livePrices = new Map();
  for (const row of database
    .prepare(
      `SELECT m.edition_id AS editionId, o.id AS id, o.current_price AS price
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id JOIN editions e ON e.id=m.edition_id
       WHERE m.status='active' AND e.is_unknown=0 AND o.currency='PLN' AND o.current_price>0
         AND o.current_price<1000000
         AND NOT EXISTS (SELECT 1 FROM offer_sets s WHERE s.offer_id=o.id AND s.dismissed_at IS NULL)
         AND o.availability IN (${BUYABLE.map((value) => `'${value}'`).join(',')})
         AND (o.last_seen_at IS NULL OR o.last_seen_at >= ?)
         AND m.edition_id IN (SELECT value FROM json_each(?))`,
    )
    .all(
      new Date(at - STALE_DAYS * 86_400_000).toISOString(),
      JSON.stringify([...new Set(rows.map((row) => String(row.editionId)))]),
    )) {
    const key = String(row.editionId);
    (livePrices.get(key) ?? livePrices.set(key, []).get(key))?.push({
      id: String(row.id),
      price: Number(row.price),
    });
  }
  const cheapestLive = (/** @type {any} */ row) =>
    (livePrices.get(String(row.editionId)) ?? []).every(
      (other) => other.id === String(row.id) || other.price > Number(row.price),
    );
  const options = valuationOptions(database);
  const liquidity = liquidityModel(database, at);
  /** @type {Map<string, { offerId: string, favourites: number }[]>} */
  const favourites = new Map();
  for (const row of database
    .prepare(
      `SELECT m.edition_id AS editionId, o.id AS offerId, o.favourite_count AS favourites
       FROM offer_matches m JOIN offers o ON o.id=m.offer_id
       WHERE m.status='active' AND o.source='Vinted' AND o.favourite_count IS NOT NULL
         AND m.edition_id IN (SELECT value FROM json_each(?))`,
    )
    .all(JSON.stringify([...observations.keys()]))) {
    const key = String(row.editionId);
    (favourites.get(key) ?? favourites.set(key, []).get(key))?.push({
      offerId: String(row.offerId),
      favourites: Number(row.favourites),
    });
  }
  // The seller lowered the price: the highest price the offer had before the current one, from its
  // price history. A cut is a signal of its own, apart from how far the price is below the worth.
  const priceBefore = new Map();
  for (const row of database
    .prepare(
      `SELECT h.offer_id AS offerId, max(h.price) AS earlier
       FROM offer_price_history h JOIN offers o ON o.id=h.offer_id
       WHERE h.offer_id IN (SELECT value FROM json_each(?)) AND h.price > o.current_price
       GROUP BY h.offer_id`,
    )
    .all(JSON.stringify(rows.map((row) => String(row.id)))))
    priceBefore.set(String(row.offerId), Number(row.earlier));
  const watchedSellers = watchedKeys(repository);
  const isWatched = (/** @type {any} */ row) =>
    Boolean(row.sellerId) && watchedSellers.has(watchKey(String(row.source), String(row.sellerId)));
  const targetFor = activeTargets(repository);
  // An extra mark must never break the list: without habits there is no mark.
  let habits = /** @type {ReturnType<typeof rejectionHabits>} */ ([]);
  try {
    habits = rejectionHabits(repository, { at });
  } catch {
    // keep the list
  }
  /** The habit that fits an offer (its publisher or seller), unless the owner asked for it by a target or a watch. */
  const habitFor = (/** @type {any} */ row, /** @type {boolean} */ exempt) => {
    if (exempt) return null;
    const found = habits.find(
      (habit) =>
        (habit.kind === 'publisher' && habit.value === String(row.publisher ?? '').trim()) ||
        (habit.kind === 'seller' &&
          habit.value === row.sellerId &&
          habit.source === String(row.source)),
    );
    return found ? { label: found.label, dismissed: found.dismissed, total: found.total } : null;
  };
  const triage = triageRows(repository);
  const verdicts = new Map(
    database
      .prepare('SELECT offer_id, verdict FROM deal_verdicts')
      .all()
      .map((row) => [String(row.offer_id), String(row.verdict)]),
  );
  // Read lazily: only an offer that fails the thresholds needs the history of price cuts.
  /** @type {ReturnType<typeof priceDrops> | null} */
  let cachedDrops = null;
  const getDrops = () => (includeNear ? (cachedDrops ??= priceDrops(repository)) : null);
  /** @type {any[]} */
  const items = [];
  /** Not deals now, but would be after a cut like sellers usually make (a filter, never an alert). @type {any[]} */
  const near = [];
  for (const row of rows) {
    const others = (observations.get(String(row.editionId)) ?? []).filter(
      (item) => item.offerId !== row.id,
    );
    // New books in shops alone say what a new copy costs, not what a used one resells for.
    if (!others.some((item) => item.kind !== 'new_shop' && item.state !== 'gone')) continue;
    const value = estimateValue(others, at, options);
    if (value.estimate == null || value.sold + value.live < 2) continue;
    const factor = CONDITION_FACTOR[String(row.condition)] ?? 1;
    const worth = Math.round(value.estimate / factor / 100) * 100;
    const price = Number(row.price);
    const saving = worth - price;
    const discount = saving / worth;
    // A watched seller's offer only has to be below the worth (not 20% and 5 zł below it), but still
    // below the low end of the range. Only the deals list asks for it (includeWatched): alerts, the
    // day plan, phrase statistics and the export keep the ordinary thresholds.
    const watched = isWatched(row);
    let nearHint = null;
    const fails =
      price >= value.low / factor ||
      ((discount < DEAL_MIN_DISCOUNT || saving < DEAL_MIN_SAVING) &&
        !(includeWatched && watched && saving > 0));
    if (fails) {
      // After the usual cut: would it be a deal? Only offers that are old or were cut before.
      const drops = getDrops();
      const hint = drops ? suggestedPrice(price, drops.medianCut) : null;
      const ageDays = (at - Date.parse(String(row.listedAt || row.firstSeenAt || ''))) / 86_400_000;
      const eligible = hint != null && (ageDays >= 14 || drops?.perOffer.has(String(row.id)));
      if (
        !eligible ||
        hint < 100 ||
        price > worth * 1.3 ||
        worth - hint < DEAL_MIN_SAVING ||
        (worth - hint) / worth < DEAL_MIN_DISCOUNT ||
        hint >= value.low / factor
      )
        continue;
      nearHint = hint;
    }
    items.push({
      offerId: String(row.id),
      title: String(row.title),
      source: String(row.source),
      url: String(row.url),
      image: row.image ? proxiedImage(String(row.image)) : null,
      price,
      condition: String(row.condition),
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt ?? null,
      maybeGone: maybeGone(row),
      editionId: String(row.editionId),
      editionTitle: String(row.editionTitle),
      workId: String(row.workId),
      workTitle: String(row.workTitle),
      worth,
      worthLow: Math.round(value.low / factor / 100) * 100,
      worthHigh: Math.round(value.high / factor / 100) * 100,
      saving,
      discount: Math.round(discount * 100),
      suspicious: discount >= DEAL_SUSPICIOUS_DISCOUNT,
      sellerId: row.sellerId ?? null,
      watched,
      habit: habitFor(
        row,
        watched || Boolean(targetFor(String(row.editionId), String(row.workId), price)),
      ),
      confidence: value.confidence,
      confidenceLabel: value.confidenceLabel,
      sold: value.sold,
      live: value.live,
      reasons: value.reasons,
      favourites: row.favourites == null ? null : Number(row.favourites),
      demand: editionDemand(
        (favourites.get(String(row.editionId)) ?? [])
          .filter((item) => item.offerId !== row.id)
          .map((item) => item.favourites),
      ),
      priceDrop: priceBefore.has(String(row.id))
        ? {
            from: priceBefore.get(String(row.id)),
            percent: Math.round(
              ((Number(priceBefore.get(String(row.id))) - price) /
                Number(priceBefore.get(String(row.id)))) *
                100,
            ),
          }
        : null,
      verdict: verdicts.get(String(row.id)) ?? null,
      triage: triageView(triage.get(String(row.id)), price, at),
      newCheaper: newCheaper(row),
      cheapestLive: cheapestLive(row),
      ...dealLiquidity(liquidity, String(row.editionId), saving),
    });
    const placed = items[items.length - 1];
    placed.rank = dealRank(placed.confidence, placed.expected);
    if (nearHint != null) {
      const nearItem = /** @type {any} */ (items.pop());
      nearItem.near = {
        suggested: nearHint,
        drops: getDrops()?.perOffer.get(String(row.id)) ?? null,
      };
      near.push(nearItem);
    }
  }
  // "Kupuję do … zł" (price-targets.mjs): an offer at or below the owner's price is a deal whatever
  // the valuation says. An offer that is already a deal only gets the mark; one that is not is added,
  // with the owner's price as its worth.
  const known = new Map(items.map((item) => [item.offerId, item]));
  for (const row of rows) {
    const price = Number(row.price);
    const target = targetFor(String(row.editionId), String(row.workId), price);
    if (!target) continue;
    const existing = known.get(String(row.id));
    if (existing) {
      existing.target = { maxPrice: target.maxPrice };
      continue;
    }
    const saving = target.maxPrice - price;
    const added = {
      offerId: String(row.id),
      title: String(row.title),
      source: String(row.source),
      url: String(row.url),
      image: row.image ? proxiedImage(String(row.image)) : null,
      price,
      condition: String(row.condition),
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt ?? null,
      maybeGone: maybeGone(row),
      editionId: String(row.editionId),
      editionTitle: String(row.editionTitle),
      workId: String(row.workId),
      workTitle: String(row.workTitle),
      worth: target.maxPrice,
      worthLow: target.maxPrice,
      worthHigh: target.maxPrice,
      saving,
      discount: Math.round((saving / target.maxPrice) * 100),
      suspicious: false,
      sellerId: row.sellerId ?? null,
      watched: isWatched(row),
      confidence: 'high',
      confidenceLabel: 'Twoja cena (cel z ustawień)',
      sold: 0,
      live: 0,
      reasons: ['owner_target'],
      favourites: row.favourites == null ? null : Number(row.favourites),
      demand: null,
      priceDrop: priceBefore.has(String(row.id))
        ? {
            from: priceBefore.get(String(row.id)),
            percent: Math.round(
              ((Number(priceBefore.get(String(row.id))) - price) /
                Number(priceBefore.get(String(row.id)))) *
                100,
            ),
          }
        : null,
      verdict: verdicts.get(String(row.id)) ?? null,
      triage: triageView(triage.get(String(row.id)), price, at),
      habit: null,
      target: { maxPrice: target.maxPrice },
      newCheaper: newCheaper(row),
      cheapestLive: cheapestLive(row),
      ...dealLiquidity(liquidity, String(row.editionId), saving),
    };
    items.push({ ...added, rank: dealRank(added.confidence, added.expected) });
  }
  items.sort((a, b) => b.rank - a.rank || b.expected - a.expected || b.saving - a.saving);
  // Visibility only: the order of the deals above is untouched (an owner-price deal joins the same
  // ranking by its expected gain). A deal with no state, or one that came back
  // (snooze over, price fell below the price it was set aside at), counts as new.
  const hidden = (/** @type {any} */ item) => Boolean(item.triage && !item.triage.visible);
  const counts = { new: 0, snoozed: 0, seen: 0, dismissed: 0 };
  for (const item of items)
    if (!hidden(item)) counts.new += 1;
    else counts[item.triage.state] += 1;
  return {
    items: items.map((item) => ({ ...item, hidden: hidden(item) })),
    near: includeNear
      ? near
          .filter((item) => !items.some((entry) => entry.offerId === item.offerId))
          .map((item) => ({ ...item, hidden: hidden(item) }))
          .sort((a, b) => b.worth - b.price - (a.worth - a.price))
      : [],
    dropEvents: cachedDrops?.events ?? null,
    verdicts: dealVerdictSummary(repository),
    triage: { counts, reactionMedianMinutes: reactionMedianMinutes(repository) },
  };
}

/**
 * All verdicts so far, also on offers that are no longer deals: counts per verdict and, per
 * valuation confidence at the time of the verdict, how many were real deals.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 */
export function dealVerdictSummary(repository) {
  const rows = repository.database
    .prepare(
      `SELECT verdict, coalesce(confidence,'none') AS confidence, count(*) AS n
       FROM deal_verdicts GROUP BY 1, 2`,
    )
    .all();
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(DEAL_VERDICTS.map((verdict) => [verdict, 0]));
  /** @type {Record<string, { total: number, good: number }>} */
  const byConfidence = {};
  let total = 0;
  for (const row of rows) {
    const n = Number(row.n);
    total += n;
    counts[String(row.verdict)] += n;
    const bucket = (byConfidence[String(row.confidence)] ??= { total: 0, good: 0 });
    bucket.total += n;
    if (row.verdict === 'good') bucket.good += n;
  }
  return { total, counts, byConfidence };
}

/**
 * Stores the owner's verdict on a deal, with the deal's price, worth and confidence as listed now
 * (null when the offer is no longer on the list). A new verdict replaces the previous one.
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {string} offerId
 * @param {unknown} verdict
 */
export function saveDealVerdict(repository, offerId, verdict, { at = Date.now() } = {}) {
  if (typeof verdict !== 'string' || !DEAL_VERDICTS.includes(verdict))
    throw Object.assign(Error('INVALID_DEAL_VERDICT'), { statusCode: 400 });
  const database = repository.database;
  if (!database.prepare('SELECT 1 FROM offers WHERE id=?').get(offerId))
    throw Object.assign(Error('OFFER_NOT_FOUND'), { statusCode: 404 });
  const deal = listDeals(repository, { at }).items.find((item) => item.offerId === offerId);
  database
    .prepare(
      `INSERT INTO deal_verdicts(offer_id, verdict, price, worth, confidence, created_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(offer_id) DO UPDATE SET verdict=excluded.verdict, price=excluded.price,
         worth=excluded.worth, confidence=excluded.confidence, created_at=excluded.created_at`,
    )
    .run(
      offerId,
      verdict,
      deal?.price ?? null,
      deal?.worth ?? null,
      deal?.confidence ?? null,
      new Date(at).toISOString(),
    );
  return { verdict, verdicts: dealVerdictSummary(repository) };
}

/** Takes a verdict back. @param {{ database: import('node:sqlite').DatabaseSync }} repository */
export function removeDealVerdict(repository, offerId) {
  repository.database.prepare('DELETE FROM deal_verdicts WHERE offer_id=?').run(offerId);
  return { verdict: null, verdicts: dealVerdictSummary(repository) };
}
