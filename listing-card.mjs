// @ts-check
// "Karta wystawienia": a book bought, to be listed on Vinted. For an edition it gives three prices
// (quick sale / middle / patient) with the sale chance in 30 days at each, the competition now, and
// a title and description ready to copy. The chance is rough: it comes from how fast the edition sold
// so far and an assumed sensitivity to the price (ELASTICITY), not from a measured price curve.
// Catalogue only: no network, no costs and no profit.
import { editionCovers } from './catalog-api.mjs';
import { editionLiquidity, HORIZON_DAYS, liquidityModel } from './market-index.mjs';
import { CONDITION_FACTOR, marketValuations } from './market-valuation.mjs';

/** How fast the sale rate falls as the price rises above the valuation (assumption, not measured). */
export const ELASTICITY = 1.5;
/** The three prices as a share of the valuation: quick, middle, patient. */
export const TIERS = [
  { id: 'szybko', label: 'Szybka sprzedaż', factor: 0.85 },
  { id: 'srodek', label: 'Środek', factor: 1 },
  { id: 'cierpliwie', label: 'Cierpliwie', factor: 1.2 },
];
export const CONDITION_LABELS = {
  new: 'Nowa',
  very_good: 'Bardzo dobry',
  good: 'Dobry',
  satisfactory: 'Zadowalający',
};

/** Whole złoty in grosze, at least 1 zł. @param {number} grosze */
const wholeZloty = (grosze) => Math.max(100, Math.round(grosze / 100) * 100);

/**
 * The 30-day sale chance at `price` for an edition whose chance at the valuation is `chanceAtWorth`.
 * @param {number} chanceAtWorth @param {number} worth @param {number} price
 */
export function chanceAtPrice(chanceAtWorth, worth, price) {
  const base = Math.min(0.999, Math.max(0, chanceAtWorth));
  const rate = -Math.log(1 - base) / HORIZON_DAYS;
  const scaled = rate * Math.pow(worth / price, ELASTICITY);
  return Math.round((1 - Math.exp(-HORIZON_DAYS * scaled)) * 1000) / 1000;
}

/**
 * Title and description to paste into a listing; only what the catalogue has.
 * @param {{ title: string, authors: string[], publisher: string | null, year: number | null }} book
 * @param {string} isbn
 * @param {string | null} condition
 */
export function listingText(book, isbn, condition) {
  const authors = book.authors.map((name) => String(name).trim()).filter(Boolean);
  const heading = authors.length ? `${book.title} — ${authors.join(', ')}` : book.title;
  const lines = [
    authors.length ? `Autor: ${authors.join(', ')}` : null,
    `Tytuł: ${book.title}`,
    book.publisher ? `Wydawnictwo: ${book.publisher}` : null,
    book.year ? `Rok wydania: ${book.year}` : null,
    isbn ? `ISBN: ${isbn}` : null,
    // The state is the seller's to judge: the list gives the wording, otherwise a gap to fill.
    `Stan: ${condition ? (CONDITION_LABELS[/** @type {keyof typeof CONDITION_LABELS} */ (condition)] ?? '[uzupełnij]') : '[uzupełnij]'}`,
  ].filter((line) => line !== null);
  return { title: heading.slice(0, 100), description: lines.join('\n') };
}

/**
 * @param {{ database: any }} repository
 * @param {string} editionId
 * @param {{ condition?: string | null, at?: number }} [options]
 */
export function listingCard(repository, editionId, { condition = null, at = Date.now() } = {}) {
  const database = repository.database;
  const row = database
    .prepare(
      `SELECT e.id AS editionId, e.title AS editionTitle, e.publisher, e.publication_year AS year,
         w.title AS workTitle, w.authors_json AS authors,
         (SELECT normalized_value FROM edition_identifiers i
           WHERE i.edition_id=e.id AND i.scheme IN ('isbn13','isbn10') ORDER BY i.scheme DESC LIMIT 1) AS isbn
       FROM editions e JOIN works w ON w.id=e.work_id WHERE e.id=? AND e.is_unknown=0`,
    )
    .get(editionId);
  if (!row) throw Object.assign(Error('EDITION_NOT_FOUND'), { statusCode: 404 });
  let authors = [];
  try {
    authors = JSON.parse(String(row.authors || '[]'));
  } catch {}
  const knownCondition = condition && condition in CONDITION_LABELS ? condition : null;
  const book = {
    title: String(row.editionTitle || row.workTitle),
    authors,
    publisher: row.publisher ?? null,
    year: row.year ?? null,
  };
  const valuation = marketValuations(database, 'edition', [editionId], at).get(editionId);
  const liquidity = editionLiquidity(liquidityModel(database, at), editionId);
  const competition = database
    .prepare(
      `SELECT o.current_price AS price FROM offer_matches m JOIN offers o ON o.id=m.offer_id
       WHERE m.edition_id=? AND m.status='active' AND o.source='Vinted'
         AND o.availability IN ('available','unconfirmed') AND o.current_price>0 AND o.current_price<1000000
         AND NOT EXISTS (SELECT 1 FROM offer_sets s WHERE s.offer_id=o.id AND s.dismissed_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM deal_verdicts v WHERE v.offer_id=o.id AND v.verdict='wrong_match')
       ORDER BY o.current_price`,
    )
    .all(editionId)
    .map((entry) => Number(entry.price));
  const reliable = valuation?.estimate != null && ['high', 'medium'].includes(valuation.confidence);
  /** @type {any} */
  let tiers = null;
  if (reliable) {
    /** @type {Record<string, number>} */
    const factors = CONDITION_FACTOR;
    const factor = Number((knownCondition && factors[knownCondition]) || 1);
    const worth = Math.max(100, valuation.estimate / factor);
    let last = 0;
    tiers = TIERS.map((tier) => {
      // Prices rise strictly from tier to tier, each a whole złoty.
      const price = Math.max(wholeZloty(worth * tier.factor), last + 100);
      last = price;
      return {
        id: tier.id,
        label: tier.label,
        price,
        // No sales of its own for the edition: no chance rather than a made-up 0%.
        chance: liquidity.basis === 'market' ? null : chanceAtPrice(liquidity.chance, worth, price),
      };
    });
  }
  return {
    edition: {
      id: editionId,
      title: book.title,
      authors,
      publisher: book.publisher,
      year: book.year,
      isbn: row.isbn ?? null,
      cover: editionCovers(database, [editionId]).get(editionId) ?? null,
    },
    condition: knownCondition,
    tiers,
    // No reliable valuation: say so instead of guessing a price.
    reason: tiers ? null : 'za_malo_ofert',
    confidence: valuation?.confidence ?? 'none',
    competition: {
      count: competition.length,
      cheapest: competition.length ? competition[0] : null,
      median: competition.length ? competition[Math.floor((competition.length - 1) / 2)] : null,
    },
    text: listingText(book, row.isbn ?? '', knownCondition),
    note: 'orientacyjnie: szansa wynika z dotychczasowej sprzedaży wydania i założonej wrażliwości na cenę',
  };
}
