// @ts-check
// CSV export for a Polish spreadsheet: BOM, semicolon separator, decimal comma, CRLF rows. Read only.
import { listDeals } from './deals.mjs';
import { phraseStats } from './phrase-stats.mjs';

/** A price of 10 000 zł or more (in grosze) is treated as unknown, like everywhere else. */
const UNKNOWN_PRICE_FROM = 1_000_000;

/**
 * @typedef {{ key: string, label: string, kind?: 'text'|'price'|'money'|'number'|'flag' }} CsvColumn
 * price: integer grosze, unknown (null, 0, non-number, >= 10 000 zł) -> empty field;
 * money: integer grosze, any amount; number: plain number with a decimal comma; flag: tak/nie.
 */

/** @param {unknown} value */
function grosze(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

/** @param {number} amount integer grosze */
function formatZloty(amount) {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/**
 * @param {unknown} value
 * @param {CsvColumn['kind']} kind
 */
function cellText(value, kind) {
  if (kind === 'price') {
    const amount = grosze(value);
    return amount === null || amount <= 0 || amount >= UNKNOWN_PRICE_FROM
      ? ''
      : formatZloty(amount);
  }
  if (kind === 'money') {
    const amount = grosze(value);
    return amount === null ? '' : formatZloty(amount);
  }
  if (kind === 'number') {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    return Number.isFinite(number) ? String(number).replace('.', ',') : '';
  }
  if (kind === 'flag') return value ? 'tak' : 'nie';
  return value === null || value === undefined ? '' : String(value);
}

/** @param {string} text @param {boolean} guard */
function quote(text, guard) {
  // A text that a spreadsheet would run as a formula (a title from a marketplace) stays text.
  const safe = guard && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[;"\r\n]|^\s|\s$/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {CsvColumn[]} columns
 * @returns {string}
 */
export function toCsv(rows, columns) {
  const lines = [columns.map((column) => quote(column.label, true)).join(';')];
  for (const row of rows)
    lines.push(
      columns
        .map((column) => {
          const kind = column.kind ?? 'text';
          return quote(cellText(row[column.key], kind), kind === 'text');
        })
        .join(';'),
    );
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** @type {CsvColumn[]} */
export const DEAL_COLUMNS = [
  { key: 'offerId', label: 'ID oferty' },
  { key: 'source', label: 'Źródło' },
  { key: 'title', label: 'Tytuł oferty' },
  { key: 'url', label: 'Adres' },
  { key: 'price', label: 'Cena (zł)', kind: 'price' },
  { key: 'condition', label: 'Stan' },
  { key: 'worth', label: 'Wartość (zł)', kind: 'price' },
  { key: 'saving', label: 'Oszczędność (zł)', kind: 'money' },
  { key: 'discount', label: 'Rabat (%)', kind: 'number' },
  { key: 'confidenceLabel', label: 'Pewność wyceny' },
  { key: 'workTitle', label: 'Książka' },
  { key: 'editionTitle', label: 'Wydanie' },
  { key: 'firstSeenAt', label: 'Widziana' },
];

/** @type {CsvColumn[]} */
export const PHRASE_COLUMNS = [
  { key: 'phrase', label: 'Fraza' },
  { key: 'offers', label: 'Oferty', kind: 'number' },
  { key: 'newOffers', label: 'Nowe oferty', kind: 'number' },
  { key: 'deals', label: 'Okazje', kind: 'number' },
  { key: 'withoutIsbnShare', label: 'Udział bez ISBN', kind: 'number' },
  { key: 'activeDays', label: 'Dni z nowymi ofertami', kind: 'number' },
  { key: 'lastSeenAt', label: 'Ostatnio widziana' },
  { key: 'verdict', label: 'Ocena' },
  { key: 'disabled', label: 'Wyłączona', kind: 'flag' },
];

/** @param {any} repository */
export function dealsCsv(repository) {
  return toCsv(listDeals(repository).items, DEAL_COLUMNS);
}

/** @param {any} repository */
export function phrasesCsv(repository) {
  return toCsv(phraseStats(repository).items, PHRASE_COLUMNS);
}
