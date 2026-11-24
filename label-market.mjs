// @ts-check
// „Rynek” of a label (collection): for each book of the label the cheapest buyable Polish offer now
// (price, source, link, worth and saving as in „Okazje”), "no offers" when there is none, and the
// gaps in the owner's own volume numbers (1, 2, 4 → 3 is missing; only between numbers the owner
// typed, never guessed). For buying, not a list of missing volumes. Read only, from the scanned
// offers; no network, no costs, no profit.
import { labelBooks } from './label-collections.mjs';
import { isPolishLanguage } from './price-targets.mjs';
import {
  CONDITION_FACTOR,
  estimateValue,
  marketObservations,
  valuationOptions,
} from './market-valuation.mjs';

const PRICE_LIMIT = 1_000_000; // grosze; CLAUDE.md: 10 000 zł and more is unknown
const MAX_GAPS = 100;

/**
 * Volume numbers missing between the lowest and the highest number the owner gave. Pure.
 * @param {(number|null|undefined)[]} volumes
 */
export function volumeGaps(volumes) {
  const have = new Set(volumes.filter((volume) => Number.isInteger(volume)));
  if (have.size < 2) return { gaps: [], more: 0 };
  const numbers = [...have];
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  /** @type {number[]} */
  const gaps = [];
  let more = 0;
  for (let n = low + 1; n < high; n += 1)
    if (!have.has(n)) {
      if (gaps.length < MAX_GAPS) gaps.push(n);
      else more += 1;
    }
  return { gaps, more };
}

/**
 * @param {{ database: import('node:sqlite').DatabaseSync }} repository
 * @param {string} name label name
 * @param {{ at?: number }} [options]
 */
export function labelMarket(repository, name, { at = Date.now() } = {}) {
  const database = repository.database;
  const { label, works } = labelBooks(/** @type {any} */ (repository), name);
  const ids = works.map((work) => work.id);
  const rows = ids.length
    ? database
        .prepare(
          `SELECT e.work_id AS workId, o.id AS offerId, o.source, o.original_title AS title,
             o.normalized_url AS url, o.current_price AS price, coalesce(o.condition_class,'unknown') AS condition,
             m.edition_id AS editionId, e.title AS editionTitle, e.language
           FROM offer_matches m JOIN offers o ON o.id=m.offer_id JOIN editions e ON e.id=m.edition_id
           WHERE m.status='active' AND e.is_unknown=0 AND o.currency='PLN'
             AND o.current_price>0 AND o.current_price<${PRICE_LIMIT}
             AND o.availability IN ('available','unconfirmed')
             AND e.work_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (SELECT 1 FROM offer_sets s WHERE s.offer_id=o.id AND s.dismissed_at IS NULL)`,
        )
        .all(JSON.stringify(ids))
        .filter((row) => isPolishLanguage(row.language))
    : [];
  /** @type {Map<string, any[]>} */
  const byWork = new Map();
  for (const row of rows)
    (
      byWork.get(String(row.workId)) ?? byWork.set(String(row.workId), []).get(String(row.workId))
    )?.push(row);
  const observations = marketObservations(database, 'edition', [
    ...new Set(rows.map((row) => String(row.editionId))),
  ]);
  const options = valuationOptions(database);
  const targets = new Map(
    database
      .prepare(
        'SELECT work_id, max_price FROM price_targets WHERE active=1 AND work_id IS NOT NULL',
      )
      .all()
      .map((row) => [String(row.work_id), Number(row.max_price)]),
  );
  const books = works.map((work) => {
    const offers = byWork.get(work.id) ?? [];
    const cheapest = offers.reduce(
      (best, row) => (!best || Number(row.price) < Number(best.price) ? row : best),
      null,
    );
    let offer = null;
    if (cheapest) {
      const price = Number(cheapest.price);
      // As in „Okazje”: the offer is not part of the market that values it.
      const others = (observations.get(String(cheapest.editionId)) ?? []).filter(
        (item) => item.offerId !== cheapest.offerId,
      );
      const value = estimateValue(others, at, options);
      const valued =
        value.estimate != null &&
        value.sold + value.live >= 2 &&
        others.some((item) => item.kind !== 'new_shop' && item.state !== 'gone');
      const factor =
        /** @type {Record<string, number>} */ (CONDITION_FACTOR)[String(cheapest.condition)] ?? 1;
      const worth = valued ? Math.round(Number(value.estimate) / factor / 100) * 100 : null;
      offer = {
        offerId: String(cheapest.offerId),
        title: String(cheapest.title),
        source: String(cheapest.source),
        url: String(cheapest.url),
        price,
        condition: String(cheapest.condition),
        editionId: String(cheapest.editionId),
        editionTitle: String(cheapest.editionTitle),
        worth,
        saving: worth == null ? null : worth - price,
        confidenceLabel: valued ? value.confidenceLabel : null,
      };
    }
    return {
      workId: work.id,
      title: work.title,
      volume: work.volume,
      position: work.position,
      liveOffers: offers.length,
      cheapest: offer,
      target: targets.get(work.id) ?? null,
    };
  });
  return {
    label,
    books,
    ...volumeGaps(works.map((work) => work.volume)),
    withoutOffers: books.filter((book) => !book.cheapest).length,
  };
}
