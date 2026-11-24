// Backtest of the market valuation (read-only): for editions with enough confirmed sales, predict
// each of the latest sales from what was known before it and compare with the real price.
// Reports median absolute % error and n per confidence level, and per variant of thresholds.
// Usage: node scripts/valuation-backtest.mjs [copy.sqlite]  (no argument: a temporary copy of
// data/bookflip-catalog.sqlite made with backup-catalog.mjs, deleted afterwards).
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateValue, marketObservations } from '../market-valuation.mjs';

/** Confidence under alternative thresholds, derived from an estimate (spread = high / low). */
export const VARIANTS = {
  current: (value) => value.confidence,
  'high: 2 sales, spread<=2.0': (value) => {
    if (value.confidence === 'high') return 'high';
    const spread = value.low ? value.high / value.low : Infinity;
    return value.sold >= 2 && spread <= 2.0 && value.confidence !== 'none'
      ? 'high'
      : value.confidence;
  },
  'high: 3 sales, spread<=2.0': (value) => {
    if (value.confidence === 'high') return 'high';
    const spread = value.low ? value.high / value.low : Infinity;
    return value.sold >= 3 && spread <= 2.0 ? 'high' : value.confidence;
  },
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * @param {import('node:sqlite').DatabaseSync} database
 * @param {{ minSales?: number, latest?: number }} [options] editions need `minSales` dated sales;
 *   the last `latest` of them are predicted from the observations known before each.
 */
export function backtestValuations(database, { minSales = 4, latest = 2 } = {}) {
  const ids = database
    .prepare(
      `SELECT m.edition_id AS id FROM offer_matches m JOIN offers o ON o.id=m.offer_id
       WHERE m.status='active' AND o.availability='sold' AND o.currency='PLN' AND o.current_price>0
         AND o.availability_changed_at IS NOT NULL
       GROUP BY m.edition_id HAVING count(*) >= ?`,
    )
    .all(minSales)
    .map((row) => String(row.id));
  const first = database.prepare('SELECT min(first_seen_at) AS first FROM offers').get()?.first;
  const trackedSince = first ? Date.parse(String(first)) : null;
  /** @type {{ editionId: string, actual: number, estimate: number, error: number, confidence: string, value: any }[]} */
  const cases = [];
  for (const [editionId, observations] of marketObservations(database, 'edition', ids)) {
    const sales = observations
      .filter((item) => item.state === 'sold' && Number.isFinite(Date.parse(item.soldAt || '')))
      .sort((a, b) => Date.parse(a.soldAt || '') - Date.parse(b.soldAt || ''));
    for (const target of sales.slice(-latest)) {
      const at = Date.parse(target.soldAt || '');
      const known = observations
        .filter((item) => item.offerId !== target.offerId)
        .flatMap((item) => {
          const seen = Date.parse(item.firstSeenAt || '');
          if (!(seen < at)) return [];
          if (item.state === 'sold')
            return Date.parse(item.soldAt || '') < at ? [item] : [{ ...item, state: 'live' }];
          return [{ ...item, state: 'live' }];
        });
      const value = estimateValue(known, at, { trackedSince });
      if (value.estimate == null) continue;
      cases.push({
        editionId,
        actual: target.price,
        estimate: value.estimate,
        error: Math.abs(value.estimate / target.price - 1),
        confidence: value.confidence,
        value,
      });
    }
  }
  const variants = {};
  for (const [name, classify] of Object.entries(VARIANTS)) {
    /** @type {Record<string, { n: number, medianError: number|null }>} */
    const levels = {};
    for (const level of ['high', 'medium', 'low']) {
      const errors = cases.filter((item) => classify(item.value) === level).map((i) => i.error);
      levels[level] = { n: errors.length, medianError: median(errors) };
    }
    variants[name] = levels;
  }
  return { editions: ids.length, cases: cases.length, variants };
}

export function formatReport(report) {
  const pct = (v) => (v == null ? '-' : `${(v * 100).toFixed(1)}%`);
  const lines = [`Wydania z dość sprzedaży: ${report.editions}, przypadków: ${report.cases}`];
  for (const [name, levels] of Object.entries(report.variants)) {
    lines.push(`\n[${name}]`);
    for (const [level, { n, medianError }] of Object.entries(levels))
      lines.push(`  ${level.padEnd(7)} n=${String(n).padEnd(5)} mediana błędu ${pct(medianError)}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let dir = null,
    path = process.argv[2];
  try {
    if (!path) {
      const { backupCatalog } = await import('./backup-catalog.mjs');
      dir = await mkdtemp(join(tmpdir(), 'bookflip-backtest-'));
      path = await backupCatalog({
        source: join(root, 'data', 'bookflip-catalog.sqlite'),
        destination: join(dir, 'copy.sqlite'),
      });
    }
    const database = new DatabaseSync(path, { readOnly: true });
    try {
      for (const [minSales, latest] of [
        [4, 2],
        [3, 2],
        [2, 1000],
      ]) {
        console.log(`\n== minSales=${minSales}, latest=${latest} ==`);
        console.log(formatReport(backtestValuations(database, { minSales, latest })));
      }
    } finally {
      database.close();
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
