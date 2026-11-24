import assert from 'node:assert/strict';
import test from 'node:test';

import { hunterPack } from '../../hunter-pack.mjs';
import { hunterLookup } from '../../hunter.mjs';
import { setPriceTarget } from '../../price-targets.mjs';
import { SqliteCatalogRepository } from '../../sqlite-catalog-repository.mjs';
import { addStock } from '../../stock.mjs';
import { huntLiquidityLabel, hunterResultMarkup } from './hunter.js';
import { PACK_KEY, isConnectionError, isbn13, loadPack, packIsStale, packLookup, packStatusText, savePack, validPack } from './hunter-pack.js';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

function catalogue() {
  const repository = new SqliteCatalogRepository(':memory:');
  let n = 0;
  const offer = (price, { isbn = null, edition = null, sold = false, title = 'Mort' } = {}) => {
    const id = `o${n++}`;
    repository.upsertOffer({ id, source: 'Vinted', normalizedUrl: `https://example.test/${id}`, originalTitle: title, currentPrice: price, conditionClass: 'good', availability: sold ? 'sold' : 'available', firstSeenAt: daysAgo(20), observedIsbn: isbn, favouriteCount: 3 });
    if (sold) repository.database.prepare('UPDATE offers SET availability_changed_at=? WHERE id=?').run(daysAgo(5), id);
    if (edition) repository.assignOfferToEdition(id, edition, { id: 'm' + id, method: 'manual', status: 'active' });
  };
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  const mort = repository.createEditionForISBN({ workId: 'w', isbn: '9788373196032', title: 'Mort' });
  for (const price of [4000, 4200, 4400, 3900, 4100]) offer(price, { edition: mort.id, sold: price < 4100 });
  repository.createWork({ id: 'z', title: 'Zabójca', authors: [] });
  repository.createEditionForISBN({ workId: 'z', isbn: '9788324031511', title: 'Zabójca' });
  repository.database.prepare('INSERT INTO removed_works(work_id, title, removed_at) VALUES (?,?,?)').run('z', 'Zabójca', daysAgo(1));
  for (const price of [2000, 2600, 2300]) offer(price, { isbn: '9788324031511', title: 'Zabójca pocket' });
  for (const price of [3000, 3200, 3400]) offer(price, { isbn: '9780306406157', title: 'Zabójca z sąsiedztwa' });
  setPriceTarget(repository, { workId: 'w', maxPrice: 2500 });
  addStock(repository, { editionId: mort.id });
  // Two editions under one ISBN: an automatic ISBN-13 on the older one (no data) and a manual
  // ISBN-10 on the newer one (priced). The manual identifier wins, online and in the pack.
  repository.createWork({ id: 'd', title: 'Smoki', authors: [] });
  repository.createEditionForISBN({ workId: 'd', isbn: '9780306406157', title: 'Smoki (stare)' });
  const manual = repository.createEditionForISBN({ workId: 'd', isbn: '9788375780307', title: 'Smoki (nowe)' });
  repository.database
    .prepare("INSERT INTO edition_identifiers(edition_id, scheme, normalized_value, source, verification_status, created_at) VALUES (?,'isbn10',?,'test','manual',?)")
    .run(manual.id, '0306406152', daysAgo(1));
  for (const price of [5000, 5200, 4800]) offer(price, { edition: manual.id, title: 'Smoki' });
  // In the catalogue with nothing at all, and with only a target.
  repository.createWork({ id: 'e', title: 'Pusta', authors: [] });
  repository.createEditionForISBN({ workId: 'e', isbn: '9791032305690', title: 'Pusta' });
  repository.createWork({ id: 't', title: 'Cel', authors: [] });
  const goal = repository.createEditionForISBN({ workId: 't', isbn: '9788375780291', title: 'Cel' });
  setPriceTarget(repository, { editionId: goal.id, maxPrice: 1500 });
  return repository;
}

const FIELDS = ['found', 'reason', 'price', 'worthUpTo', 'caution', 'target', 'targetMet', 'inStock', 'removed', 'valueBasis'];

test('the pack answers like Łowca online: verdict, limit, target, stock, removal, outside valuation', () => {
  const repository = catalogue();
  try {
    const pack = JSON.parse(JSON.stringify(hunterPack(repository, { at: AT })));
    const known = repository.database
      .prepare('SELECT normalized_value AS v FROM edition_identifiers UNION SELECT observed_isbn FROM offers WHERE observed_isbn IS NOT NULL')
      .all()
      .map((row) => row.v);
    for (const isbn of [...known, '83-7319-603-X', '9788322201559', 'xyz'])
      for (const price of [null, 900, 2400, 3000, 9000]) {
        const online = hunterLookup(repository, isbn, { price, at: AT });
        const offline = packLookup(pack, isbn, price);
        const label = `${isbn} @ ${price}`;
        for (const field of FIELDS) if (field in online) assert.deepEqual(offline[field], online[field], `${label}: ${field}`);
        // The pack keys are ISBN-13 (the barcode); online echoes the spelling typed (an ISBN-10 stays one).
        assert.equal(offline.isbn, online.isbn && isbn13(online.isbn), `${label}: isbn`);
        assert.equal(offline.verdict?.verdict ?? null, online.verdict?.verdict ?? null, `${label}: verdict`);
        assert.equal(offline.verdict?.ratio ?? null, online.verdict?.ratio ?? null, `${label}: ratio`);
        const value = online.found ? online.value : online.market?.value;
        const packValue = offline.found ? offline.value : offline.market?.value;
        assert.equal(packValue?.estimate ?? null, value?.estimate ?? null, `${label}: estimate`);
        if (online.market) {
          assert.equal(offline.market.title, online.market.title);
          assert.equal(offline.market.offers, online.market.offers);
          assert.deepEqual(offline.market.listed, online.market.listed);
        }
        if (online.found) {
          assert.equal(offline.edition.title, online.edition.title, `${label}: which edition`);
          assert.deepEqual(offline.listed, online.listed, `${label}: listed`);
          // The „Sprzedaż” line reads the same.
          assert.equal(huntLiquidityLabel(offline.liquidity), huntLiquidityLabel(online.liquidity), `${label}: sale chance`);
        }
        assert.equal(offline.offline, pack.generatedAt);
      }
  } finally {
    repository.close();
  }
});

test('an answer from the pack says so on the card, with the pack date', () => {
  const repository = catalogue();
  try {
    const pack = hunterPack(repository, { at: AT });
    const html = hunterResultMarkup(packLookup(pack, '9788373196032', 1500), { escapeHtml: String, money: (g) => `${g / 100} zł` });
    assert.match(html, /^<p class="hunter-message is-warn" role="status">Bez połączenia z komputerem — odpowiedź z danych z \d\d\.11, \d\d:00\.<\/p>/);
    assert.match(html, /Mort/);
  } finally {
    repository.close();
  }
});

test('ISBN-13 from any spelling, status line, staleness and storage', () => {
  assert.equal(isbn13('83-7319-603-X'), '9788373196032');
  assert.equal(isbn13('ISBN 978-83-7319-603-2'), '9788373196032');
  assert.equal(isbn13('9788373196033'), null);
  assert.equal(isbn13('0-306-40615-3'), null);
  const pack = { version: 3, generatedAt: '2026-11-20T12:00:00Z', verdicts: [], worthUpToShare: 0.75, entries: [['9788373196032'], ['9780306406157']] };
  assert.match(packStatusText(pack), /^Bez sieci: 2 książki, dane z \d\d\.11, \d\d:00\.$/);
  assert.equal(packStatusText(null), 'Dane do pracy bez sieci nie są jeszcze pobrane.');
  assert.equal(packStatusText(null, { refreshing: true }), 'Pobieranie danych do pracy bez sieci…');
  assert.match(packStatusText(pack, { failed: true }), /odświeżenie nie udało się/);
  assert.equal(packIsStale(pack, Date.parse('2026-11-20T15:00:00Z')), false);
  assert.equal(packIsStale(pack, Date.parse('2026-11-20T19:00:00Z')), true);
  assert.equal(packIsStale(null), true);
  assert.equal(validPack({ ...pack, version: 1 }), null);
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(loadPack(storage), null);
  assert.equal(savePack(pack, storage), true);
  assert.ok(store.has(PACK_KEY));
  assert.deepEqual(loadPack(storage), pack);
  assert.equal(savePack(pack, { setItem() { throw Error('QuotaExceededError'); } }), false);
  assert.equal(loadPack({ getItem: () => '{broken' }), null);
  assert.equal(isConnectionError(new TypeError('Failed to fetch'), { onLine: true }), true);
  assert.equal(isConnectionError(Error('HTTP_500'), { onLine: true }), false);
  assert.equal(isConnectionError(Error('HTTP_502')), false, 'a server error is shown, not hidden behind the pack');
  assert.equal(isConnectionError(Object.assign(Error('t'), { name: 'TimeoutError' })), true);
  assert.match(packStatusText(pack, { unsaved: true }), /nie zapisano na tym urządzeniu/);
});
