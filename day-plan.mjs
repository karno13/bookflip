// @ts-check
// "Plan dnia": what to do today, in the order of work, from models that already exist. Each card
// says what it is, how much there is, the top few entries and where it opens. Cards with nothing to
// do are left out, so an empty list means nothing is waiting. Read only (no costs, no profit).
import { listDeals } from './deals.mjs';
import { marketIndex } from './market-index.mjs';
import { reviewUnlockPlan } from './review-unlock.mjs';
import { getScanSchedule } from './scan-schedule.mjs';

/** How many entries a card shows; the rest is behind its link. */
export const CARD_ENTRIES = 3;
/** An edition sells fast when its 30-day sale chance reaches this (market-index LIQUIDITY_LEVELS.fast). */
const FAST = 0.25;

/**
 * @param {{ database: any }} repository
 * @param {{ at?: number, entries?: number }} [options]
 */
export function dayPlan(repository, { at = Date.now(), entries = CARD_ENTRIES } = {}) {
  /** @type {any[]} */
  const cards = [];

  // 1. Deals worth a look now: clear saving, a valuation that can be trusted, not rated yet.
  const deals = listDeals(repository, { at }).items.filter(
    (deal) => deal.confidence !== 'low' && !deal.suspicious && !deal.verdict && !deal.hidden,
  );
  if (deals.length)
    cards.push({
      id: 'deals',
      title: 'Okazje do obejrzenia',
      count: deals.length,
      entries: deals.slice(0, entries).map((deal) => ({
        offerId: deal.offerId,
        title: deal.title,
        source: deal.source,
        url: deal.url,
        price: deal.price,
        worth: deal.worth,
        saving: deal.saving,
        chance: deal.liquidity?.chance ?? null,
      })),
      go: { view: 'deals' },
    });

  // 2. Decisions that clear the most of the review queue.
  const unlock = reviewUnlockPlan(repository);
  if (unlock.topOffers > 0 && unlock.items.length)
    cards.push({
      id: 'unlock',
      title: 'Decyzje, które odblokowują najwięcej',
      count: unlock.decisions,
      entries: unlock.items.slice(0, entries).map((item) => ({
        key: item.key,
        offers: item.offers,
        price: item.price,
      })),
      summary: { top: unlock.top, topOffers: unlock.topOffers, totalOffers: unlock.totalOffers },
      go: { view: 'review', sort: 'unlock' },
    });

  // 3. Fast editions nobody lists right now: a copy found for them would sell quickly.
  const market = marketIndex(repository, {
    at,
    limit: 200,
    sort: 'turnover',
    confidence: 'medium',
  });
  const empty = market.items.filter(
    (item) => (item.liquidity?.chance ?? 0) >= FAST && (item.liquidity?.live ?? 0) === 0,
  );
  if (empty.length)
    cards.push({
      id: 'fast-markets',
      title: 'Szybko schodzące książki bez podaży',
      count: empty.length,
      entries: empty.slice(0, entries).map((item) => ({
        editionId: item.editionId,
        title: item.title,
        value: item.value,
        chance: item.liquidity.chance,
        turnover: item.turnover,
      })),
      go: { view: 'market' },
    });

  // 4. The sniper is off: new listings are seen only at the next full scan (hours), not within
  // minutes. One card with a switch, so the start view says it (2026-11-23: off on the owner's
  // catalogue copy, so the stream, ISBN slot and learned phrases did nothing).
  const watchable = repository.database
    .prepare(
      `SELECT 1 FROM works w WHERE EXISTS (SELECT 1 FROM editions e WHERE e.work_id=w.id AND e.is_unknown=0)
         AND NOT EXISTS (SELECT 1 FROM removed_works r WHERE r.work_id=w.id) LIMIT 1`,
    )
    .get();
  // First: the other cards are about what was found, this one about finding it in time.
  if (watchable && !getScanSchedule(repository).sniper.enabled)
    cards.unshift({
      id: 'sniper-off',
      title: 'Snajper jest wyłączony',
      count: 1,
      entries: [],
      go: { view: 'deals' },
    });

  return { at: new Date(at).toISOString(), cards };
}
