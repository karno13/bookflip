import assert from 'node:assert/strict';
import test from 'node:test';

import { weekReport, weekWindow, warsawMidnight } from '../week-report.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const HOUR = 3_600_000;
// Sunday 2026-11-22 08:00 Warsaw: the default window is Sun 15.11 - Sat 21.11.
const NOW = Date.parse('2026-11-22T07:00:00Z');

test('the window is seven full Warsaw days, also across the clock changes', () => {
  const winter = weekWindow('2026-11-21');
  assert.equal(new Date(winter.from).toISOString(), '2026-11-14T23:00:00.000Z');
  assert.equal(new Date(winter.end).toISOString(), '2026-11-21T23:00:00.000Z');
  assert.equal(winter.firstDay, '2026-11-15');
  // Spring forward (29.03.2026): the window is one hour short.
  const spring = weekWindow('2026-03-29');
  assert.equal(new Date(spring.from).toISOString(), '2026-03-22T23:00:00.000Z');
  assert.equal(new Date(spring.end).toISOString(), '2026-03-29T22:00:00.000Z');
  assert.equal((spring.end - spring.from) / HOUR, 167);
  // Fall back (25.10.2026): one hour long.
  const autumn = weekWindow('2026-10-25');
  assert.equal(new Date(autumn.from).toISOString(), '2026-10-18T22:00:00.000Z');
  assert.equal(new Date(autumn.end).toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal((autumn.end - autumn.from) / HOUR, 169);
  assert.equal(new Date(warsawMidnight('2026-07-01')).toISOString(), '2026-06-30T22:00:00.000Z');
  assert.throws(() => weekWindow('2026-02-30'), { message: 'INVALID_DATE' });
  assert.throws(() => weekWindow('yesterday'), { message: 'INVALID_DATE' });
});

function seeded() {
  const repo = new SqliteCatalogRepository(':memory:');
  let n = 0;
  const add = (source, firstSeenAt) => {
    const id = `o${n++}`;
    repo.upsertOffer({
      id,
      source,
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: 'Mort',
      currentPrice: 2000,
      firstSeenAt,
    });
    return id;
  };
  return { repo, add };
}

test('counts the window exactly (boundaries in Warsaw time), compares with the previous week', () => {
  const { repo, add } = seeded();
  try {
    // Window 15.11 00:00 - 22.11 00:00 Warsaw = 14.11 23:00Z - 21.11 23:00Z.
    add('Vinted', '2026-11-14T22:59:59.000Z'); // just before: previous week
    for (let i = 0; i < 3; i++) add('Vinted', '2026-11-14T23:00:00.000Z'); // first instant
    for (let i = 0; i < 2; i++) add('Empik', '2026-11-18T10:00:00.000Z');
    add('Vinted', '2026-11-21T22:59:59.000Z'); // last instant
    add('Vinted', '2026-11-21T23:00:00.000Z'); // after
    // Previous week: 4 offers.
    for (let i = 0; i < 4; i++) add('Vinted', '2026-11-10T10:00:00.000Z');
    const alert = (id, alertedAt, seenAt) =>
      repo.database
        .prepare(
          'INSERT INTO deal_alerts(offer_id, price, worth, saving, chance, alerted_at, seen_at) VALUES (?,?,?,?,?,?,?)',
        )
        .run(id, 2000, 4000, 2000, 0.5, alertedAt, seenAt);
    alert('o1', '2026-11-16T10:00:00.000Z', '2026-11-16T10:10:00.000Z');
    alert('o2', '2026-11-17T10:00:00.000Z', '2026-11-17T10:30:00.000Z');
    alert('o3', '2026-11-17T11:00:00.000Z', null);
    repo.database
      .prepare('INSERT INTO scan_runs(scanned_at, summary_json, created_at) VALUES (?,?,?)')
      .run(
        '2026-11-16T09:00:00.000Z',
        JSON.stringify({ errors: [{ source: 'Vinted', code: 'SOURCE_HTTP_500' }] }),
        '2026-11-16T09:00:00.000Z',
      );
    repo.database
      .prepare('INSERT INTO scan_runs(scanned_at, summary_json, created_at) VALUES (?,?,?)')
      .run('2026-11-17T09:00:00.000Z', '{}', '2026-11-17T09:00:00.000Z');
    repo.database
      .prepare('INSERT INTO scan_runs(scanned_at, summary_json, created_at) VALUES (?,?,?)')
      .run('2026-11-10T09:00:00.000Z', '{}', '2026-11-10T09:00:00.000Z');
    // The report reads only: a write would fail.
    repo.database.exec('PRAGMA query_only = 1');

    const report = weekReport(repo, { now: () => NOW });
    assert.equal(report.from, '2026-11-15');
    assert.equal(report.to, '2026-11-21');
    assert.equal(report.hours, 168);
    assert.equal(report.hasPrevious, true);
    const scan = report.sections.find((s) => s.id === 'scan');
    assert.deepEqual(scan.lines[0], { text: 'Skany: 2', change: { previous: 1, delta: 1 } });
    assert.deepEqual(scan.lines[1], {
      text: 'Nowe oferty: 6',
      change: { previous: 5, delta: 1 },
    });
    assert.equal(scan.lines[2].text, 'W tym: Vinted 4, Empik 2');
    const deals = report.sections.find((s) => s.id === 'deals');
    assert.equal(deals.lines[0].text, 'Ogłoszone: 3, obejrzane: 2');
    assert.deepEqual(deals.lines[0].change, { previous: 0, delta: 3 });
    assert.match(deals.lines[1].text, /Mediana reakcji: 10 min/);
    assert.equal(
      report.sections.find((s) => s.id === 'sources').lines[0].text,
      'Vinted: błędy w 1 z 2 skanów',
    );
    assert.equal(
      report.sections.some((s) => s.id === 'stock'),
      false,
    );
    assert.match(report.text, /Nowe oferty: 6 \(▲ \+1 wobec 5\)/);
    assert.match(report.text, /^Ostatnie 7 dni: 15\.11 – 21\.11\.2026/);

    // An explicit `to` shifts the window: the week of 8-14.11 has only the previous-week data.
    const earlier = weekReport(repo, { to: '2026-11-14', now: () => NOW });
    assert.equal(earlier.hasPrevious, false);
    const lines = earlier.sections.find((s) => s.id === 'scan').lines;
    assert.equal(lines.length >= 1, true);
    assert.equal(
      lines.every((l) => !l.change),
      true,
    );
  } finally {
    repo.close?.();
  }
});

test('a week without data is empty, not a list of zeros; the stock section needs its table', () => {
  const { repo, add } = seeded();
  try {
    const empty = weekReport(repo, { now: () => NOW });
    assert.equal(empty.empty, true);
    assert.deepEqual(empty.sections, []);
    add('Vinted', '2026-11-16T10:00:00.000Z');
    assert.equal(
      weekReport(repo, { now: () => NOW }).sections.some((s) => s.id === 'stock'),
      false,
    );
    // Without the table (an older schema) there is no section; with it and without events, none either.
    repo.database.exec('DROP TABLE stock_events; DROP TABLE stock_items;');
    assert.equal(
      weekReport(repo, { now: () => NOW }).sections.some((s) => s.id === 'stock'),
      false,
    );
    repo.database.exec(
      'CREATE TABLE stock_items (id TEXT PRIMARY KEY, bought_at TEXT, listed_at TEXT, sold_at TEXT)',
    );
    assert.equal(
      weekReport(repo, { now: () => NOW }).sections.some((s) => s.id === 'stock'),
      false,
    );
    repo.database
      .prepare('INSERT INTO stock_items VALUES (?,?,?,?)')
      .run('s1', '2026-11-16T10:00:00.000Z', '2026-11-17T10:00:00.000Z', null);
    const stock = weekReport(repo, { now: () => NOW }).sections.find((s) => s.id === 'stock');
    assert.equal(stock.lines[0].text, 'Kupione: 1, wystawione: 1, sprzedane: 0');
  } finally {
    repo.close?.();
  }
});

test('GET /api/report/week answers over HTTP; a bad date is a 400', async () => {
  const { createLocalAppServer } = await import('../local-app.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const report = await (await fetch(`${base}/api/report/week?to=2026-11-21`)).json();
    assert.equal(report.from, '2026-11-15');
    assert.equal(report.empty, true);
    assert.equal((await fetch(`${base}/api/report/week?to=nope`)).status, 400);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repo.close();
  }
});

test('the card markup shows an arrow only where the server sent one, and escapes text', async () => {
  const { weekReportHtml } = await import('../app/views/today.js');
  const escapeHtml = (value) => String(value).replace(/</g, '&lt;');
  assert.match(weekReportHtml({ empty: true }, escapeHtml), /Brak danych/);
  const html = weekReportHtml(
    {
      title: 'Ostatnie 7 dni',
      text: 'a <b>',
      sections: [
        {
          id: 'scan',
          title: 'Skanowanie',
          lines: [
            { text: 'Skany: 2', change: { previous: 1, delta: 1 } },
            { text: 'Nowe <i>', change: null },
          ],
        },
      ],
    },
    escapeHtml,
  );
  assert.equal((html.match(/week-change/g) || []).length, 1);
  assert.match(html, /▲ \+1 wobec 1/);
  assert.match(html, /Nowe &lt;i>/);
  assert.match(html, /data-week-copy/);
});
