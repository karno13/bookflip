// Stage 1 of the 11.2026 review: the "Dziś" summary and the state of every source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { sourceStatus, sourceReason } from '../source-status.mjs';
import { todaySummary } from '../today.mjs';
import { listCatalogOffers } from '../catalog-api.mjs';
import {
  todayTiles,
  sourceLine,
  whenLabel,
  planHtml,
  planEntryText,
  reactionNote,
} from '../app/views/today.js';
import { escapeHtml } from '../app/core/formatters.js';

function seed() {
  const repository = new SqliteCatalogRepository(':memory:');
  const db = repository.database;
  const run = (at, errors) =>
    db
      .prepare('INSERT INTO scan_runs(scanned_at, summary_json, created_at) VALUES(?, ?, ?)')
      .run(at, JSON.stringify({ at, found: 12, newOffers: 2, priceChanges: 1, errors }), at);
  const health = (source, row) =>
    db
      .prepare(
        'INSERT INTO source_health(source,last_checked_at,last_success_at,last_error_at,last_error,status) VALUES(?,?,?,?,?,?)',
      )
      .run(
        source,
        row.checked,
        row.success ?? null,
        row.errorAt ?? null,
        row.error ?? null,
        row.status,
      );
  const captcha = (source) => ({ source, query: 'x', code: 'SOURCE_CAPTCHA', blocked: true });
  run('2026-11-01T10:00:00.000Z', [
    captcha('Allegro'),
    { source: 'OLX', query: 'x', code: 'SOURCE_HTTP_403' },
  ]);
  run('2026-11-11T08:00:00.000Z', [captcha('Allegro')]);
  run('2026-11-11T09:00:00.000Z', [captcha('Allegro'), captcha('Allegro Lokalnie')]);
  run('2026-11-11T19:00:00.000Z', [captcha('Allegro'), captcha('Allegro Lokalnie')]);
  health('Allegro', {
    checked: '2026-11-11T19:00:00.000Z',
    errorAt: '2026-11-11T19:00:00.000Z',
    error: 'SOURCE_CAPTCHA',
    status: 'failed',
  });
  health('OLX', {
    checked: '2026-11-01T10:00:00.000Z',
    errorAt: '2026-11-01T10:00:00.000Z',
    error: 'SOURCE_HTTP_403',
    status: 'failed',
  });
  health('Allegro Lokalnie', {
    checked: '2026-11-11T19:00:00.000Z',
    success: '2026-11-11T08:00:00.000Z',
    errorAt: '2026-11-11T19:00:00.000Z',
    error: 'SOURCE_CAPTCHA',
    status: 'failed',
  });
  health('Vinted', {
    checked: '2026-11-11T19:00:00.000Z',
    success: '2026-11-11T19:00:00.000Z',
    status: 'ok',
  });
  return repository;
}

test('each source: works, down since the first failed scan after its last success; Allegro and OLX have no legal access', () => {
  const repository = seed();
  try {
    const rows = sourceStatus(repository, [
      'Vinted',
      'Allegro',
      'OLX',
      'Allegro Lokalnie',
      'Empik',
    ]);
    const by = Object.fromEntries(rows.map((row) => [row.source, row]));
    assert.deepEqual(
      rows.map((row) => row.state),
      ['down', 'unknown', 'ok', 'no_access', 'no_access'],
      'non-working first, sources without legal access last',
    );
    assert.equal(by['Allegro Lokalnie'].state, 'down');
    assert.equal(by['Allegro Lokalnie'].downSince, '2026-11-11T09:00:00.000Z');
    assert.equal(by['Allegro Lokalnie'].reason, 'serwis żąda CAPTCHA (blokada automatów)');
    // Not an error: a stated fact (docs/SOURCES-ACCESS-2026-11.md), never red and never retried.
    assert.equal(by.Allegro.state, 'no_access');
    assert.equal(by.Allegro.downSince, null);
    assert.match(by.OLX.reason, /brak legalnego dostępu/);
    assert.equal(by.Vinted.state, 'ok');
    assert.equal(by.Vinted.downSince, null);
    assert.equal(by.Empik.state, 'unknown');
    assert.equal(sourceReason('SOURCE_HTTP_502'), 'błąd serwisu (HTTP 502)');
  } finally {
    repository.close();
  }
});

test('Dziś counts what changed since the visit, with the filters of the list it opens', () => {
  const repository = seed();
  try {
    const db = repository.database;
    const offer = (id, firstSeen) =>
      repository.upsertOffer({
        source: 'Vinted',
        normalizedUrl: 'https://www.vinted.pl/items/' + id,
        originalTitle: 'Książka ' + id,
        currentPrice: 1000,
        observedAt: firstSeen,
      });
    const old = offer(1, '2026-11-10T10:00:00.000Z');
    const fresh = offer(2, '2026-11-11T19:00:00.000Z');
    db.prepare('UPDATE offers SET first_seen_at=? WHERE id=?').run(
      '2026-11-10T10:00:00.000Z',
      old.id,
    );
    db.prepare('UPDATE offers SET first_seen_at=? WHERE id=?').run(
      '2026-11-11T19:00:00.000Z',
      fresh.id,
    );
    db.prepare(
      'INSERT INTO scan_offer_results(scanned_at, offer_id, is_new, price_changed) VALUES(?,?,?,?)',
    ).run('2026-11-11T19:00:00.000Z', old.id, 0, 1);
    db.prepare(
      'INSERT INTO scan_offer_results(scanned_at, offer_id, is_new, price_changed) VALUES(?,?,?,?)',
    ).run('2026-11-11T19:00:00.000Z', fresh.id, 1, 0);

    const visit = todaySummary(repository, {
      since: '2026-11-11T12:00:00Z',
      sources: ['Vinted', 'Allegro'],
    });
    assert.equal(visit.scope, 'visit');
    assert.equal(visit.newOffers.count, 1);
    assert.deepEqual(visit.newOffers.filters, {
      since: '2026-11-11T12:00:00.000Z',
      sort: 'newest',
    });
    assert.equal(visit.priceChanges.count, 1);
    // The count and the list it opens agree.
    assert.equal(listCatalogOffers(repository, visit.newOffers.filters).total, 1);
    assert.equal(listCatalogOffers(repository, visit.priceChanges.filters).items[0].id, old.id);
    assert.equal(visit.lastScan.at, '2026-11-11T19:00:00.000Z');
    assert.deepEqual(visit.lastScan.failedSources, ['Allegro Lokalnie']);
    // Runs saved before the duration was recorded have none.
    assert.equal(visit.lastScan.durationMs, null);
    assert.equal(visit.nextScan.enabled, false);

    // No previous visit in this browser: "new" means new in the last scan.
    const first = todaySummary(repository, { since: null, sources: ['Vinted'] });
    assert.equal(first.scope, 'scan');
    assert.deepEqual(first.newOffers.filters, {
      scan: '2026-11-11T19:00:00.000Z',
      scanChange: 'new',
      sort: 'newest',
    });
    assert.equal(first.newOffers.count, 1);
    assert.equal(todaySummary(repository, { since: 'nonsense', sources: [] }).scope, 'scan');
  } finally {
    repository.close();
  }
});

test('tiles: each opens a filtered list; non-working sources are named and marked', () => {
  const now = new Date('2026-11-11T21:00:00');
  const data = {
    scope: 'visit',
    since: '2026-11-11T12:00:00.000Z',
    newOffers: { count: 62, filters: { since: '2026-11-11T12:00:00.000Z', sort: 'newest' } },
    priceChanges: {
      count: 4,
      filters: { priceChangedSince: '2026-11-11T12:00:00.000Z', sort: 'newest' },
    },
    queue: { decisions: 240, offers: 284 },
    sources: [
      {
        source: 'Allegro',
        state: 'never',
        downSince: '2026-11-01T19:48:18.570Z',
        reason: 'serwis żąda CAPTCHA (blokada automatów)',
      },
      {
        source: 'Dedalus.pl',
        state: 'down',
        downSince: '2026-11-11T08:30:00.000Z',
        reason: 'serwis żąda CAPTCHA (blokada automatów)',
      },
      { source: 'Vinted', state: 'ok', lastSuccessAt: '2026-11-11T19:10:00.000Z' },
    ],
    lastScan: {
      at: '2026-11-11T19:10:00.000Z',
      found: 1293,
      newOffers: 17,
      failedSources: [],
      filters: { scan: '2026-11-11T19:10:00.000Z' },
    },
    nextScan: { enabled: true, at: '2026-11-12T07:16:00.000Z', quickAt: null },
  };
  const tiles = todayTiles(data, now);
  assert.deepEqual(
    tiles.map((tile) => tile.id),
    ['new', 'price', 'sources', 'last-scan', 'next-scan'],
  );
  assert.deepEqual(tiles[0].go, { offers: data.newOffers.filters });
  assert.deepEqual(tiles[1].go, { offers: data.priceChanges.filters });
  assert.equal(tiles[2].value, '1/3');
  assert.equal(tiles[2].warn, true);
  assert.match(tiles[2].note, /Allegro, Dedalus\.pl/);
  assert.deepEqual(tiles[3].go, { offers: { scan: '2026-11-11T19:10:00.000Z' } });
  assert.equal(tiles[4].value, whenLabel('2026-11-12T07:16:00.000Z', now));
  assert.match(
    sourceLine(data.sources[1], now),
    /^nie działa od dziś \d\d:\d\d — serwis żąda CAPTCHA/,
  );
  assert.match(
    sourceLine(data.sources[0], now),
    /^nigdy nie zadziałał \(próby od 1\.11, \d\d:\d\d\) — /,
  );
  assert.match(sourceLine(data.sources[2], now), /^działa · ostatnio dziś /);
  assert.match(whenLabel('2026-11-10T20:10:00', now), /^wczoraj 20:10$/);
});

test('the source list shows failing and no-access sources, and folds the working ones into one line', async () => {
  const { sourceRows } = await import('../app/views/today.js');
  const escape = (value) => String(value);
  const html = sourceRows(
    [
      { source: 'A', state: 'ok' },
      { source: 'B', state: 'down', reason: 'CAPTCHA' },
      { source: 'C', state: 'ok' },
      { source: 'D', state: 'no_access' },
    ],
    new Date('2026-11-15T12:00:00Z'),
    escape,
  );
  assert.match(html, /<summary>2 działa<\/summary>/);
  assert.match(html, /<summary>1 bez legalnego dostępu<\/summary>/);
  assert.ok(html.indexOf('data-source="B"') < html.indexOf('<summary>'));
  assert.ok(html.indexOf('data-source="A"') > html.indexOf('<summary>'));
  assert.ok(
    html.indexOf('data-source="D"') > html.indexOf('bez legalnego'),
    'no access is folded too',
  );
});

test('the view leads with the decisions waiting and the age of the oldest', async () => {
  const { todayLead } = await import('../app/views/today.js');
  const measures = [{ id: 'oldestDecisionDays', value: 9 }];
  assert.deepEqual(todayLead({ queue: { decisions: 739, offers: 851 }, measures }), {
    count: 739,
    label: 'decyzji czeka',
    note: 'najstarsza czeka 9 dni · 851 ofert w kolejce',
    attention: true,
  });
  assert.equal(
    todayLead({ queue: { decisions: 2, offers: 3 }, measures: [] }).label,
    'decyzje czekają',
  );
  assert.equal(
    todayLead({
      queue: { decisions: 1, offers: 1 },
      measures: [{ id: 'oldestDecisionDays', value: 1 }],
    }).note,
    'najstarsza czeka 1 dzień · 1 oferta w kolejce',
  );
  assert.deepEqual(todayLead({ queue: { decisions: 0, offers: 0 } }), {
    count: 0,
    label: 'Kolejka pusta',
    note: 'nic nie czeka na decyzję',
    attention: false,
  });
});

test('the command palette says "oferta / oferty / ofert" correctly', async () => {
  const { offersWord } = await import('../app/views/palette.js');
  assert.deepEqual([1, 2, 5, 12, 22, 25].map(offersWord), [
    'oferta',
    'oferty',
    'ofert',
    'ofert',
    'oferty',
    'ofert',
  ]);
});

test('Dziś names the sources whose new offers fell far below the week before', async () => {
  const { quietSourcesNote } = await import('../app/views/today.js');
  assert.equal(quietSourcesNote({}), null);
  assert.equal(quietSourcesNote({ quietSources: [] }), null);
  const note = quietSourcesNote({ quietSources: ['Vinted', 'Empik'] });
  assert.match(note, /Vinted, Empik/);
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const DAY = 86_400_000;
    for (let i = 0; i < 30; i++)
      repo.upsertOffer({
        id: `q${i}`,
        source: 'Vinted',
        normalizedUrl: `https://example.test/q${i}`,
        originalTitle: 'Mort',
        firstSeenAt: new Date(Date.now() - 10 * DAY).toISOString(),
      });
    const summary = todaySummary(repo, { since: null, sources: ['Vinted'] });
    assert.deepEqual(summary.quietSources, ['Vinted']);
  } finally {
    repo.close();
  }
});

test('quiet sources skip sources without legal access and small or steady weeks', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const DAY = 86_400_000;
    const add = (source, daysAgo, n) => {
      for (let i = 0; i < n; i++)
        repo.upsertOffer({
          id: `${source}-${daysAgo}-${i}`,
          source,
          normalizedUrl: `https://example.test/${source}-${daysAgo}-${i}`,
          originalTitle: 'Mort',
          firstSeenAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
        });
    };
    add('Allegro', 10, 30); // no legal access: never named
    add('Lagano', 10, 5); // too small a previous week
    add('Empik', 10, 30);
    add('Empik', 3, 25); // steady
    const summary = todaySummary(repo, { since: null, sources: ['Allegro', 'Lagano', 'Empik'] });
    assert.deepEqual(summary.quietSources, []);
  } finally {
    repo.close();
  }
});

test('the queue lead says how many offers the biggest decisions cover, only when it adds something', async () => {
  const { todayLead, unlockNote } = await import('../app/views/today.js');
  assert.equal(unlockNote(undefined), '');
  assert.equal(unlockNote({ top: 5, topOffers: 5, decisions: 5, totalOffers: 5 }), '');
  assert.equal(unlockNote({ top: 0, topOffers: 0, decisions: 4, totalOffers: 9 }), '');
  assert.equal(
    unlockNote({ top: 20, topOffers: 340, decisions: 739, totalOffers: 851 }),
    ' · 20 największych decyzji obejmuje 340 z 851 ofert',
  );
  assert.match(
    unlockNote({ top: 2, topOffers: 8, decisions: 3, totalOffers: 9 }),
    /2 największe decyzje obejmują 8 z 9 ofert/,
  );
  const lead = todayLead({
    queue: {
      decisions: 739,
      offers: 851,
      unlock: { top: 20, topOffers: 340, decisions: 739, totalOffers: 851 },
    },
    measures: [],
  });
  assert.match(lead.note, /851 ofert w kolejce · 20 największych decyzji obejmuje 340 z 851 ofert/);
});

test('the unlock sentence uses the right Polish form for 1, 12 and 22', async () => {
  const { unlockNote } = await import('../app/views/today.js');
  const note = (top) => unlockNote({ top, topOffers: 10, decisions: 99, totalOffers: 50 });
  assert.match(note(1), /1 największa decyzja obejmuje/);
  assert.match(note(12), /12 największych decyzji obejmuje/);
  assert.match(note(22), /22 największe decyzje obejmują/);
});

test('Dziś describes the last full scan, not a newer sniper run; a lone sniper run is still shown', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    const insert = repo.database.prepare(
      'INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)',
    );
    assert.equal(todaySummary(repo, { since: null, sources: [] }).lastScan, null);
    insert.run(
      '2026-11-20T12:20:00.000Z',
      JSON.stringify({ found: 3, context: { mode: 'newest', queries: ['a'] } }),
      '2026-11-20T12:20:00.000Z',
    );
    assert.equal(todaySummary(repo, { since: null, sources: [] }).lastScan.found, 3);
    insert.run(
      '2026-11-20T08:00:00.000Z',
      JSON.stringify({ found: 50, context: { queries: ['a', 'b'] } }),
      '2026-11-20T08:00:00.000Z',
    );
    assert.equal(todaySummary(repo, { since: null, sources: [] }).lastScan.found, 50);
  } finally {
    repo.close();
  }
});

test('plan dnia: karty, skróty wpisów i pusty stan', () => {
  const money = (value) => (value / 100).toFixed(2).replace('.', ',') + ' zł';
  assert.match(planHtml({ cards: [] }, money, escapeHtml), /Na dziś nic nie czeka\./);
  assert.match(planHtml(undefined, money, escapeHtml), /Na dziś nic nie czeka\./);
  const deal = {
    offerId: 1,
    title: 'Ziemia <obiecana>',
    source: 'Vinted',
    url: 'https://x.pl/a',
    price: 1000,
    worth: 2500,
    saving: 1500,
    chance: 0.42,
  };
  assert.equal(
    planEntryText('deals', deal, money),
    'Ziemia <obiecana> · 10,00 zł (warta 25,00 zł, taniej o 15,00 zł) · szansa 42% · Vinted',
  );
  assert.equal(
    planEntryText('unlock', { key: 'harry potter', offers: 3, price: 0 }, money),
    'harry potter · 3 oferty',
  );
  assert.equal(
    planEntryText('fast-markets', { title: 'Lalka', value: 3000, chance: 0.3 }, money),
    'Lalka · wycena 30,00 zł · szansa 30%',
  );
  const html = planHtml(
    {
      cards: [
        {
          id: 'deals',
          title: 'Okazje do obejrzenia',
          count: 4,
          entries: [deal],
          go: { view: 'deals' },
        },
        {
          id: 'unlock',
          title: 'Decyzje',
          count: 2,
          entries: [{ key: 'a', offers: 1, price: 0 }],
          go: { view: 'review', sort: 'unlock' },
        },
      ],
    },
    money,
    escapeHtml,
  );
  assert.match(html, /Ziemia &lt;obiecana&gt;/);
  assert.doesNotMatch(html, /<obiecana>/);
  assert.match(html, /href="https:\/\/x\.pl\/a"/);
  assert.equal((html.match(/data-plan-card="/g) || []).length, 2);
  assert.match(html, /Okazje do obejrzenia <span class="today-plan-count">4<\/span>/);
});

test('reactionNote shows the median reaction time only when it is a number', () => {
  assert.equal(reactionNote(null), '');
  assert.match(reactionNote(12.4), /12 min/);
  assert.match(reactionNote(180), /3 godz\./);
  assert.match(
    planHtml(
      { cards: [{ id: 'deals', title: 'Okazje', count: 1, entries: [] }] },
      (v) => String(v),
      escapeHtml,
      30,
    ),
    /Mediana reakcji/,
  );
});
