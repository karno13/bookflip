import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createProductionCatalog } from '../catalog-production.mjs';
import {
  createScanState,
  persistSqliteScan,
  persistSqliteScanBatch,
} from '../sqlite-single-store.mjs';
import { createSqliteVintedDetailCache } from '../vinted-detail-sqlite-cache.mjs';

function catalog() {
  const directory = mkdtempSync(join(tmpdir(), 'bookflip-incremental-'));
  const store = createProductionCatalog({
    databasePath: join(directory, 'catalog.sqlite'),
    fetcher: async () => assert.fail('no network'),
  });
  return {
    store,
    close: () => {
      store.repository.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

const offer = (id, price, query) => ({
  source: 'Vinted',
  url: `https://www.vinted.pl/items/${id}-ksiazka`,
  title: 'Książka ' + id,
  price,
  language: 'Polski',
  matchedQueries: [query],
});

test('offers are saved after each source+query and the final save does not count them twice', () => {
  const { store, close } = catalog();
  try {
    const db = store.repository.database;
    const scanAt = '2026-11-07T10:00:00.000Z';
    // An offer known from an earlier scan.
    persistSqliteScan(store, {
      offers: [offer(1, 1000, 'stara')],
      searchedAt: '2026-11-01T10:00:00.000Z',
    });
    const state = createScanState();
    assert.deepEqual(
      persistSqliteScanBatch(store, {
        offers: [offer(1, 1200, 'Warhammer'), offer(2, 500, 'Warhammer')],
        scanAt,
        state,
      }),
      { saved: 2, newOffers: 1 },
    );
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM offers').get().n,
      2,
      'visible before the scan ends',
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM identification_jobs WHERE status='queued'").get().n >=
        1,
      true,
    );
    persistSqliteScanBatch(store, { offers: [offer(2, 500, 'Gotrek')], scanAt, state });
    const final = persistSqliteScan(store, {
      offers: [
        offer(1, 1200, 'Warhammer'),
        { ...offer(2, 500, 'Warhammer'), matchedQueries: ['Warhammer', 'Gotrek'] },
      ],
      searchedAt: scanAt,
      scanState: state,
    });
    assert.deepEqual(final.summary, { newOffers: 1, priceChanges: 1 });
    const row = (id) =>
      db
        .prepare('SELECT seen_count, matched_queries_json FROM offers WHERE normalized_url LIKE ?')
        .get(`%/items/${id}-%`);
    assert.equal(row(1).seen_count, 2, 'one more sighting, not three');
    assert.equal(row(2).seen_count, 1);
    assert.deepEqual(JSON.parse(row(2).matched_queries_json).sort(), ['Gotrek', 'Warhammer']);
    assert.equal(
      db.prepare('SELECT count(*) AS n FROM offer_price_history').get().n,
      3,
      'one observation per price',
    );
  } finally {
    close();
  }
});

test('Vinted offers already in the catalogue need no language read', () => {
  const { store, close } = catalog();
  try {
    persistSqliteScan(store, {
      offers: [{ ...offer(7, 900, 'x'), isbn: '9788382320084' }],
      searchedAt: '2026-11-01T10:00:00.000Z',
    });
    const cache = createSqliteVintedDetailCache(store.repository);
    assert.deepEqual(cache.get('https://www.vinted.pl/items/7-inny-slug'), {
      language: 'Polski',
      isbn: '9788382320084',
    });
    assert.equal(cache.get('https://www.vinted.pl/items/8-nowa'), undefined);
  } finally {
    close();
  }
});

test('a new offer found by two phrases is new once; a price that was unknown is not a change', () => {
  const { store, close } = catalog();
  try {
    const db = store.repository.database;
    const state = createScanState();
    const scanAt = '2026-11-08T10:00:00.000Z';
    const first = persistSqliteScanBatch(store, {
      offers: [offer(5, 2000, 'a')],
      scanAt,
      state,
    });
    const second = persistSqliteScanBatch(store, {
      offers: [offer(5, 2000, 'b')],
      scanAt,
      state,
    });
    assert.equal(first.newOffers, 1);
    assert.equal(second.newOffers, 0);

    // An offer saved without a known price gets one: filled in, not a "price change".
    persistSqliteScan(store, {
      offers: [offer(6, 1500, 'c')],
      searchedAt: '2026-11-01T10:00:00.000Z',
    });
    db.prepare(
      "UPDATE offers SET current_price=NULL WHERE normalized_url LIKE '%/items/6-%'",
    ).run();
    const result = persistSqliteScan(store, {
      offers: [offer(6, 2500, 'c')],
      searchedAt: '2026-11-09T10:00:00.000Z',
    });
    assert.equal(result.summary.priceChanges, 0);
    const row = db
      .prepare(
        "SELECT r.price_changed AS changed FROM scan_offer_results r JOIN offers o ON o.id=r.offer_id WHERE o.normalized_url LIKE '%/items/6-%' AND r.scanned_at=?",
      )
      .get('2026-11-09T10:00:00.000Z');
    assert.equal(row.changed, 0);
  } finally {
    close();
  }
});
