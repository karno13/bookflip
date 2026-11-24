import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { createProductionCatalog } from '../catalog-production.mjs';
import {
  addToLabel,
  createLabel,
  setLabelPriceTarget,
  setLabelVolume,
} from '../label-collections.mjs';
import { labelMarket, volumeGaps } from '../label-market.mjs';
import { listPriceTargets } from '../price-targets.mjs';

function catalogue() {
  const repository = new SqliteCatalogRepository(':memory:');
  for (const id of ['w1', 'w2', 'w3', 'w4']) {
    repository.createWork({ id, title: `Tom ${id}`, authors: ['Autor'] });
    repository.createEdition({ id: `e_${id}`, workId: id, title: `Tom ${id}`, language: 'pl' });
  }
  repository.createEdition({ id: 'e_en', workId: 'w1', title: 'Tom w1 EN', language: 'en' });
  const add = (id, edition, price, extra = {}) => {
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: id,
      currentPrice: price,
      conditionClass: 'good',
      availability: 'available',
      ...extra,
    });
    repository.assignOfferToEdition(id, edition, {
      id: `m_${id}`,
      method: 'manual',
      status: 'active',
    });
  };
  return { repository, add };
}

test('volume gaps only between numbers the owner gave', () => {
  assert.deepEqual(volumeGaps([1, 2, 4]), { gaps: [3], more: 0 });
  assert.deepEqual(volumeGaps([null, 5]), { gaps: [], more: 0 });
  assert.deepEqual(volumeGaps([null, null, null]), { gaps: [], more: 0 });
  assert.deepEqual(volumeGaps([2, 5, 5]), { gaps: [3, 4], more: 0 });
  const big = volumeGaps([1, 10000]);
  assert.equal(big.gaps.length, 100);
  assert.equal(big.more, 9998 - 100);
});

test('cheapest buyable Polish offer per book, no offers, worth and saving, no network', () => {
  const { repository, add } = catalogue();
  try {
    createLabel(repository, { name: 'Seria' });
    for (const id of ['w1', 'w2', 'w4']) addToLabel(repository, 'Seria', { workIds: [id] });
    setLabelVolume(repository, 'Seria', 'w1', { volume: 1 });
    setLabelVolume(repository, 'Seria', 'w2', { volume: 2 });
    setLabelVolume(repository, 'Seria', 'w4', { volume: 4 });
    add('s1', 'e_w1', 4000, { availability: 'sold' });
    add('s2', 'e_w1', 4200, { availability: 'sold' });
    add('a', 'e_w1', 4400);
    add('cheap', 'e_w1', 2000);
    add('gone', 'e_w1', 500, { availability: 'unavailable' });
    add('foreign', 'e_en', 300); // another language never counts
    add('w2only', 'e_w2', 3000);
    add('w3offer', 'e_w3', 100); // a book outside the label
    const market = labelMarket(repository, 'seria');
    assert.equal(market.label, 'Seria');
    assert.deepEqual(market.gaps, [3]);
    assert.deepEqual(
      market.books.map((book) => [book.workId, book.cheapest?.offerId ?? null]),
      [
        ['w1', 'cheap'],
        ['w2', 'w2only'],
        ['w4', null],
      ],
    );
    const first = market.books[0];
    assert.equal(first.liveOffers, 2, 'sold, gone and foreign-language offers are not counted');
    assert.equal(first.cheapest.price, 2000);
    assert.equal(first.cheapest.worth, 4200);
    assert.equal(first.cheapest.saving, 2200);
    assert.equal(market.books[1].cheapest.worth, null, 'one offer is no market');
    assert.equal(market.withoutOffers, 1);
    assert.throws(() => labelMarket(repository, 'brak'), /LABEL_NOT_FOUND/);
    // A label without numbers has no gaps; an empty one is an empty answer, not an error.
    createLabel(repository, { name: 'Pusta' });
    assert.deepEqual(labelMarket(repository, 'Pusta'), {
      label: 'Pusta',
      books: [],
      gaps: [],
      more: 0,
      withoutOffers: 0,
    });
  } finally {
    repository.close();
  }
});

test('one price target for every book of a label; invalid prices refused; shown in the market', () => {
  const { repository } = catalogue();
  try {
    createLabel(repository, { name: 'Seria' });
    addToLabel(repository, 'Seria', { workIds: ['w1', 'w2'] });
    assert.deepEqual(setLabelPriceTarget(repository, 'Seria', { maxPrice: 1200 }), {
      label: 'Seria',
      works: 2,
      maxPrice: 1200,
    });
    assert.deepEqual(
      listPriceTargets(repository)
        .map((target) => [target.workId, target.maxPrice])
        .sort(),
      [
        ['w1', 1200],
        ['w2', 1200],
      ],
    );
    assert.deepEqual(
      labelMarket(repository, 'Seria').books.map((book) => book.target),
      [1200, 1200],
    );
    assert.throws(
      () => setLabelPriceTarget(repository, 'Seria', { maxPrice: 1_000_000 }),
      /INVALID_TARGET_PRICE/,
    );
    assert.throws(() => setLabelPriceTarget(repository, 'Seria', {}), /INVALID_TARGET_PRICE/);
    createLabel(repository, { name: 'Pusta' });
    assert.throws(
      () => setLabelPriceTarget(repository, 'Pusta', { maxPrice: 1200 }),
      /LABEL_EMPTY/,
    );
    assert.equal(listPriceTargets(repository).length, 2);
  } finally {
    repository.close();
  }
});

test('HTTP: market and target routes do not collide with the other label routes', async () => {
  const catalog = createProductionCatalog({ databasePath: ':memory:' });
  const server = createLocalAppServer({ catalogProvider: () => catalog });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: base },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    catalog.repository.createWork({ id: 'w', title: 'Tom', authors: [] });
    assert.equal((await call('/api/catalog/labels', 'POST', { name: 'Seria' })).status, 200);
    await call('/api/catalog/labels/Seria/works', 'POST', { workIds: ['w'] });
    const market = await call('/api/catalog/labels/Seria/market');
    assert.equal(market.status, 200);
    assert.equal(market.body.books.length, 1);
    assert.equal((await call('/api/catalog/labels/Nope/market')).status, 404);
    const target = await call('/api/catalog/labels/Seria/target', 'PUT', { maxPrice: 900 });
    assert.deepEqual(target.body, { label: 'Seria', works: 1, maxPrice: 900 });
    assert.equal(
      (await call('/api/catalog/labels/Seria/target', 'PUT', { maxPrice: 0 })).status,
      400,
    );
    assert.equal((await call('/api/catalog/labels/Seria/works')).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    catalog.close?.();
  }
});
