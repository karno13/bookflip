// @ts-check
// „Ostatnie 7 dni” (Dziś): one read-only report that answers „czy to działa”. It only reads what the
// other modules already keep (offers, scan_runs, deal_alerts, deal_triage, the rules of data-health,
// phrase-stats and deal-forecasts, the stock table when it exists) and writes nothing. The window
// is exactly seven full calendar days in Europe/Warsaw (a day is 23 or 25 hours when the clock
// changes); `to` is the last day included, by default yesterday. A section without data is left
// out, never shown as zeros; the arrow against the previous week appears only when that week has data.
import { DROP_RATIO, MIN_BASELINE } from './data-health.mjs';
import { dealForecasts } from './deal-forecasts.mjs';
import { phraseStats } from './phrase-stats.mjs';
import { hasNoLegalAccess } from './source-blocks.mjs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ZONE = 'Europe/Warsaw';
const DAYS = 7;

const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** @param {number} ms */
export const warsawDay = (ms) => dayFormat.format(new Date(ms));

/** @param {string} day YYYY-MM-DD @param {number} n */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The instant (ms) Warsaw midnight starts the given day. @param {string} day */
export function warsawMidnight(day) {
  const [y, m, d] = day.split('-').map(Number);
  for (const offsetHours of [1, 2]) {
    const candidate = Date.UTC(y, m - 1, d) - offsetHours * HOUR;
    if (warsawDay(candidate) === day && hourFormat.format(new Date(candidate)) === '00')
      return candidate;
  }
  throw Object.assign(Error('INVALID_DATE'), { statusCode: 400 });
}

/** @param {string} to last day included (YYYY-MM-DD) @param {number} [shiftWeeks] */
export function weekWindow(to, shiftWeeks = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || addDays(to, 0) !== to)
    throw Object.assign(Error('INVALID_DATE'), { statusCode: 400 });
  const last = addDays(to, -7 * shiftWeeks);
  const firstDay = addDays(last, -(DAYS - 1));
  const from = warsawMidnight(firstDay);
  const end = warsawMidnight(addDays(last, 1));
  return { firstDay, lastDay: last, from, end };
}

/** @param {{ database: any }} repository @param {string} table */
function columnsOf(repository, table) {
  try {
    return new Set(
      repository.database
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((/** @type {any} */ column) => String(column.name)),
    );
  } catch {
    return new Set();
  }
}

/** @param {number[]} values sorted */
const median = (values) => {
  if (!values.length) return null;
  return Math.round(values[Math.floor((values.length - 1) / 2)] * 10) / 10;
};

/**
 * The counts of one window.
 * @param {{ database: any }} repository
 * @param {{ from: number, end: number }} window
 * @param {{ stock: boolean, stockEvents: boolean }} has
 */
function countWindow(repository, { from, end }, has) {
  const database = repository.database;
  const a = new Date(from).toISOString();
  const b = new Date(end).toISOString();
  const bySource = Object.fromEntries(
    database
      .prepare(
        'SELECT source, count(*) AS n FROM offers WHERE first_seen_at >= ? AND first_seen_at < ? GROUP BY source',
      )
      .all(a, b)
      .map((/** @type {any} */ row) => [String(row.source), Number(row.n)]),
  );
  const newOffers = Object.values(bySource).reduce((sum, n) => sum + n, 0);

  const runs = database
    .prepare('SELECT summary_json FROM scan_runs WHERE scanned_at >= ? AND scanned_at < ?')
    .all(a, b);
  /** @type {Record<string, number>} */
  const failedRuns = {};
  for (const run of runs) {
    let summary = null;
    try {
      summary = JSON.parse(run.summary_json);
    } catch {
      /* an unreadable summary counts as a scan without errors */
    }
    const failed = new Set(
      (Array.isArray(summary?.errors) ? summary.errors : [])
        .map((/** @type {any} */ error) => error?.source)
        .filter((/** @type {any} */ source) => source && !hasNoLegalAccess(source)),
    );
    for (const source of failed) failedRuns[source] = (failedRuns[source] ?? 0) + 1;
  }

  const alerts = database
    .prepare('SELECT alerted_at, seen_at FROM deal_alerts WHERE alerted_at >= ? AND alerted_at < ?')
    .all(a, b);
  const reactions = alerts
    .filter((/** @type {any} */ row) => row.seen_at != null)
    .map((/** @type {any} */ row) => (Date.parse(row.seen_at) - Date.parse(row.alerted_at)) / 60000)
    .filter((/** @type {number} */ minutes) => Number.isFinite(minutes) && minutes >= 0)
    .sort((/** @type {number} */ x, /** @type {number} */ y) => x - y);

  /** @type {Record<string, number>} */
  const triage = { seen: 0, snoozed: 0, dismissed: 0 };
  for (const row of database
    .prepare(
      'SELECT state, count(*) AS n FROM deal_triage WHERE updated_at >= ? AND updated_at < ? GROUP BY state',
    )
    .all(a, b))
    triage[String(row.state)] = Number(row.n);

  let stock = null;
  if (has.stock) {
    // Copies whose purchase was undone are hidden; a copy added by "Wystawiłem" has no "bought" event.
    const hidden = has.stockEvents
      ? ' AND NOT EXISTS (SELECT 1 FROM stock_events v WHERE v.item_id=stock_items.id AND v.from_status IS NULL AND v.undone_at IS NOT NULL)'
      : '';
    const count = (/** @type {string} */ column) =>
      Number(
        database
          .prepare(
            `SELECT count(*) AS n FROM stock_items WHERE ${column} >= ? AND ${column} < ?${hidden}${
              column === 'bought_at' && has.stockEvents
                ? " AND EXISTS (SELECT 1 FROM stock_events v WHERE v.item_id=stock_items.id AND v.to_status='bought')"
                : ''
            }`,
          )
          .get(a, b)?.n ?? 0,
      );
    stock = { bought: count('bought_at'), listed: count('listed_at'), sold: count('sold_at') };
  }

  return {
    newOffers,
    bySource,
    scans: runs.length,
    failedRuns,
    announced: alerts.length,
    looked: alerts.filter((/** @type {any} */ row) => row.seen_at != null).length,
    reactionMedianMinutes: median(reactions),
    triage,
    stock,
  };
}

/** @param {ReturnType<typeof countWindow>} counts */
const hasData = (counts) =>
  counts.newOffers > 0 ||
  counts.scans > 0 ||
  counts.announced > 0 ||
  Object.values(counts.triage).some((n) => n > 0);

/** @param {number} value @param {number | null} previous */
const arrow = (value, previous) => {
  if (previous == null) return null;
  return { previous, delta: value - previous };
};

/** @param {number} n @param {string} one @param {string} few @param {string} many */
const plural = (n, one, few, many) =>
  n === 1 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many;

/** @param {string} day */
const shortDay = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** @param {number | null} minutes */
const minutesText = (minutes) =>
  minutes == null
    ? ''
    : minutes < 90
      ? `${Math.round(minutes)} min`
      : `${Math.round(minutes / 6) / 10} godz.`;

/**
 * @param {{ database: any }} repository
 * @param {{ to?: string | null, now?: () => number }} [options] to: last day included (YYYY-MM-DD,
 *   Warsaw), default yesterday; now: the clock
 */
export function weekReport(repository, { to = null, now = () => Date.now() } = {}) {
  const at = now();
  const lastDay = to || addDays(warsawDay(at), -1);
  const window = weekWindow(lastDay);
  const previousWindow = weekWindow(lastDay, 1);
  const has = { stock: false, stockEvents: false };
  const stockColumns = columnsOf(repository, 'stock_items');
  has.stock = ['bought_at', 'listed_at', 'sold_at'].every((name) => stockColumns.has(name));
  const eventColumns = columnsOf(repository, 'stock_events');
  has.stockEvents = ['item_id', 'from_status', 'to_status', 'undone_at'].every((name) =>
    eventColumns.has(name),
  );

  const current = countWindow(repository, window, has);
  const previousCounts = countWindow(repository, previousWindow, has);
  const previous = hasData(previousCounts) ? previousCounts : null;

  /** @type {{ id: string, title: string, lines: { text: string, change?: { previous: number, delta: number } | null }[] }[]} */
  const sections = [];
  const section = (/** @type {string} */ id, /** @type {string} */ title) => {
    /** @type {any[]} */
    const lines = [];
    sections.push({ id, title, lines });
    return lines;
  };

  if (current.newOffers > 0 || current.scans > 0) {
    const lines = section('scan', 'Skanowanie');
    if (current.scans > 0)
      lines.push({
        text: `Skany: ${current.scans}`,
        change: arrow(current.scans, previous?.scans ?? null),
      });
    if (current.newOffers > 0) {
      lines.push({
        text: `Nowe oferty: ${current.newOffers}`,
        change: arrow(current.newOffers, previous?.newOffers ?? null),
      });
      const parts = Object.entries(current.bySource)
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .map(([source, n]) => `${source} ${n}`);
      if (parts.length > 1) lines.push({ text: `W tym: ${parts.join(', ')}` });
    }
  }

  if (current.announced > 0 || Object.values(current.triage).some((n) => n > 0)) {
    const lines = section('deals', 'Okazje');
    if (current.announced > 0) {
      lines.push({
        text: `Ogłoszone: ${current.announced}, obejrzane: ${current.looked}`,
        change: arrow(current.announced, previous?.announced ?? null),
      });
      if (current.reactionMedianMinutes != null)
        lines.push({
          text: `Mediana reakcji: ${minutesText(current.reactionMedianMinutes)} (ogłoszona → obejrzana)`,
        });
    }
    const t = current.triage;
    if (t.seen + t.snoozed + t.dismissed > 0)
      lines.push({
        text: `Skrzynka okazji: obejrzane ${t.seen}, odłożone ${t.snoozed}, odrzucone ${t.dismissed}`,
      });
  }

  // Quiet sources: the rule of data-health (less than half of the new offers of the week before).
  if (previous) {
    const quiet = Object.keys(previous.bySource)
      .filter(
        (source) =>
          previous.bySource[source] >= MIN_BASELINE &&
          (current.bySource[source] ?? 0) < previous.bySource[source] * DROP_RATIO,
      )
      .sort();
    const failed = Object.entries(current.failedRuns).sort();
    if (quiet.length || failed.length) {
      const lines = section('sources', 'Źródła');
      for (const source of quiet)
        lines.push({
          text: `${source}: ${current.bySource[source] ?? 0} nowych ofert wobec ${previous.bySource[source]} tydzień wcześniej (mniej niż połowa)`,
        });
      for (const [source, n] of failed)
        lines.push({
          text: `${source}: błędy w ${n} z ${current.scans} ${plural(current.scans, 'skanu', 'skanów', 'skanów')}`,
        });
    }
  } else {
    const failed = Object.entries(current.failedRuns).sort();
    if (failed.length) {
      const lines = section('sources', 'Źródła');
      for (const [source, n] of failed)
        lines.push({
          text: `${source}: błędy w ${n} z ${current.scans} ${plural(current.scans, 'skanu', 'skanów', 'skanów')}`,
        });
    }
  }

  // Phrases and forecasts read "now", so they are shown only for a window that ended recently.
  if (at - window.end < 2 * DAY) {
    const noisy = phraseStats(repository, { at: window.end, days: DAYS }).items.filter(
      (item) => item.verdict === 'szum' && !item.disabled,
    );
    if (noisy.length) {
      const lines = section('phrases', 'Frazy');
      lines.push({
        text: `Szumiące frazy (dużo nowych ofert, żadnej okazji): ${noisy.length}, najgłośniejsze: ${noisy
          .slice(0, 3)
          .map((item) => `${item.phrase} (${item.newOffers})`)
          .join(', ')}`,
      });
    }
  }
  const forecasts = dealForecasts(repository, { at: window.end });
  if (forecasts.announced.n > 0 && forecasts.announced.soldRate != null) {
    const lines = section('forecasts', 'Rozliczone prognozy');
    const pct = (/** @type {number | null} */ v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
    lines.push({
      text: `Okazje starsze niż ${forecasts.horizonDays} dni: ${forecasts.announced.n}, sprzedane w tym czasie ${pct(forecasts.announced.soldRate)} (prognoza średnio ${pct(forecasts.meanForecast)}, nieogłoszone oferty ${pct(forecasts.control.soldRate)}); łącznie, nie tylko ten tydzień`,
    });
  }

  if (current.stock && (current.stock.bought || current.stock.listed || current.stock.sold)) {
    const lines = section('stock', 'Zapas');
    const s = current.stock;
    lines.push({
      text: `Kupione: ${s.bought}, wystawione: ${s.listed}, sprzedane: ${s.sold}`,
      change: previous?.stock ? arrow(s.sold, previous.stock.sold) : null,
    });
  }

  const title = `Ostatnie 7 dni: ${shortDay(window.firstDay)} – ${shortDay(window.lastDay)}.${window.lastDay.slice(0, 4)}`;
  const text = [
    title,
    ...sections.flatMap((item) => [
      '',
      item.title,
      ...item.lines.map((line) => {
        const c = line.change;
        const tail = c
          ? ` (${c.delta > 0 ? '▲ +' : c.delta < 0 ? '▼ ' : '= '}${c.delta === 0 ? 'bez zmian' : c.delta} wobec ${c.previous})`
          : '';
        return `- ${line.text}${tail}`;
      }),
    ]),
  ].join('\n');

  return {
    from: window.firstDay,
    to: window.lastDay,
    windowStart: new Date(window.from).toISOString(),
    windowEnd: new Date(window.end).toISOString(),
    hours: Math.round((window.end - window.from) / HOUR),
    hasPrevious: previous != null,
    empty: sections.length === 0,
    title,
    sections,
    text,
  };
}
