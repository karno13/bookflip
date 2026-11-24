import assert from 'node:assert/strict';
import test from 'node:test';

import { apiRoute } from '../api-routes.mjs';
import { searchEntities } from '../entity-search.mjs';
import { editionLiquidity, liquidityModel } from '../market-index.mjs';
import { marketValuations } from '../market-valuation.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

function world() {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  repository.createEdition({ id: 'e', workId: 'w', title: 'Mort', publisher: 'Prószyński' });
  repository.database
    .prepare(
      `INSERT INTO edition_series(edition_id, name, normalized_name, kind, position, source)
       VALUES ('e', 'Świat Dysku', 'swiat dysku', 'universe', 0, 'test')`,
    )
    .run();
  let n = 0;
  const add = (
    seller,
    price,
    { availability = 'available', goneDaysAgo = null, match = true } = {},
  ) => {
    const id = `o${n++}`;
    repository.upsertOffer({
      id,
      source: 'Vinted',
      normalizedUrl: `https://example.test/${id}`,
      originalTitle: `Mort ${id}`,
      currentPrice: price,
      conditionClass: 'good',
      availability,
      firstSeenAt: daysAgo(40),
      favouriteCount: 3,
      sellerId: seller,
      sellerName: seller ? `${seller.startsWith('rynek') ? 'Rynek' : 'Żółwik'} ${seller}` : null,
    });
    if (goneDaysAgo != null)
      repository.database
        .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
        .run(daysAgo(goneDaysAgo), id);
    if (match)
      repository.assignOfferToEdition(id, 'e', {
        id: 'm' + id,
        method: 'manual',
        status: 'active',
      });
    return id;
  };
  for (let i = 0; i < 4; i++)
    add('rynek' + i, 4000 + i * 100, { availability: 'sold', goneDaysAgo: 3 + i });
  return { repository, add };
}

test('the seller directory refreshes after an offer is deleted', () => {
  const { repository, add } = world();
  try {
    const id = add('Zniknie', 3000, { match: false });
    assert.equal(searchEntities(repository, 'zniknie', { at: AT }).sellers.length, 1);
    // Same highest rowid is not enough: delete a middle offer and add none.
    add('Ostatni', 3000, { match: false });
    searchEntities(repository, 'ostatni', { at: AT });
    repository.database.prepare('DELETE FROM offers WHERE id=?').run(id);
    assert.equal(searchEntities(repository, 'zniknie', { at: AT }).sellers.length, 0);
    assert.equal(searchEntities(repository, 'ostatni', { at: AT }).sellers.length, 1);
  } finally {
    repository.close();
  }
});

test('seller search ignores case and Polish letters; the card has the 30-day and deviation figures', () => {
  const { repository, add } = world();
  try {
    add('A', 3000);
    add('A', 3200);
    add('A', 2000, { match: false }); // no edition: listed, outside the median
    add('A', 3100, { availability: 'sold', goneDaysAgo: 5 });
    add('A', 3100, { availability: 'sold', goneDaysAgo: 90 });
    const result = searchEntities(repository, 'ZOLWIK a', { at: AT });
    assert.equal(result.sellers.length, 1);
    const [card] = result.sellers;
    assert.equal(card.sellerId, 'A');
    assert.equal(card.activeCount, 3);
    assert.equal(card.valuedCount, 2);
    assert.equal(card.unvaluedCount, 1);
    assert.equal(card.goneIn30Days, 1);
    assert.equal(card.soldIn30Days, 1);
    assert.ok(card.medianDeviation < 0);
    assert.equal(card.offers.find((offer) => offer.worth == null)?.deviation, null);
  } finally {
    repository.close();
  }
});

test('an offer without a seller id creates no seller', () => {
  const { repository, add } = world();
  try {
    add(null, 3000);
    add('', 3000);
    add('   ', 3000);
    assert.deepEqual(searchEntities(repository, 'zolwik', { at: AT }).sellers, []);
    assert.equal(searchEntities(repository, 'rynek', { at: AT }).sellers.length, 4);
  } finally {
    repository.close();
  }
});

test('author and series cards give turnover, live offers and median price, without missing volumes', () => {
  const { repository, add } = world();
  try {
    add('A', 3000);
    add('B', 3400);
    add('C', 3600);
    const result = searchEntities(repository, 'pratchett', { at: AT });
    assert.equal(result.authors[0].name, 'Terry Pratchett');
    assert.equal(result.authors[0].liveOffers, 3);
    assert.equal(result.authors[0].medianPrice, 3400);
    assert.ok(result.authors[0].turnover > 0);
    const series = searchEntities(repository, 'SWIAT DYSKU', { at: AT }).series;
    assert.equal(series[0].name, 'Świat Dysku');
    assert.equal(series[0].editionCount, 1);
    assert.ok(!('missing' in series[0]) && !('missingVolumes' in series[0]));
    assert.deepEqual(searchEntities(repository, 'x', { at: AT }), {
      query: 'x',
      sellers: [],
      authors: [],
      series: [],
    });
  } finally {
    repository.close();
  }
});

test('GET /api/search/entities passes the query to the handler', async () => {
  const { repository, add } = world();
  try {
    add('A', 3000);
    const result = await apiRoute({
      repo: repository,
      method: 'GET',
      path: '/api/search/entities',
      query: { q: 'pratchett' },
    });
    assert.equal(result.authors.length, 1);
  } finally {
    repository.close();
  }
});

test('searching 100 000 offers stays under 120 ms (target 50 ms; slack for parallel verify) (CPU time, best of five)', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const db = repository.database;
    db.exec('BEGIN');
    const insert = db.prepare(
      `INSERT INTO offers(id, source, normalized_url, original_title, current_price, currency, availability, seller_id, seller_name, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (?, 'Vinted', ?, 'Książka', 2000, 'PLN', 'available', ?, ?, ?, ?, ?, ?)`,
    );
    for (let i = 0; i < 100_000; i++)
      insert.run(
        `p${i}`,
        `https://example.test/p${i}`,
        `s${i % 20000}`,
        `Sprzedawca ${i % 20000}`,
        daysAgo(5),
        daysAgo(1),
        daysAgo(5),
        daysAgo(1),
      );
    db.exec('COMMIT');
    searchEntities(repository, 'sprzedawca 19999', { at: AT }); // warm up
    let took = Infinity;
    let result;
    for (let run = 0; run < 5; run++) {
      const started = process.cpuUsage();
      result = searchEntities(repository, 'sprzedawca 19999', { at: AT });
      const used = process.cpuUsage(started);
      took = Math.min(took, (used.user + used.system) / 1000);
    }
    assert.equal(result.sellers.length, 1);
    assert.ok(took < 120, `took ${took.toFixed(1)} ms`);
  } finally {
    repository.close();
  }
});

test('a seller without a name is found only by the whole id, a named one by name or id', () => {
  const { repository } = world();
  try {
    const db = repository.database;
    const insert = db.prepare(
      `INSERT INTO offers(id, source, normalized_url, original_title, current_price, currency, availability, seller_id, seller_name, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, 'Książka', 2000, 'PLN', 'available', ?, ?, ?, ?, ?, ?)`,
    );
    const stamps = [daysAgo(5), daysAgo(1), daysAgo(5), daysAgo(1)];
    insert.run('n1', 'Vinted', 'https://example.test/n1', '123456', null, ...stamps);
    insert.run('n2', 'Vinted', 'https://example.test/n2', '1234567', '   ', ...stamps);
    insert.run('n3', 'Empik', 'https://example.test/n3', 'x9', 'Księgarnia Ola', ...stamps);
    const ids = (text) =>
      searchEntities(repository, text, { at: AT }).sellers.map((seller) => seller.sellerId);
    assert.deepEqual(ids('123456'), ['123456']);
    assert.deepEqual(ids('1234'), []); // part of a number matches nobody
    assert.deepEqual(ids('ksiegarnia ola'), ['x9']);
    assert.deepEqual(ids('X9'), ['x9']);
    const [card] = searchEntities(repository, '123456', { at: AT }).sellers;
    assert.equal(card.sellerName, null);
    assert.equal(card.activeCount, 1);
  } finally {
    repository.close();
  }
});

/** The author and series cards as they were computed per card and per edition, before the batch queries. */
function referenceCard(database, editionIds, workCount, name, at) {
  const ids = [...editionIds];
  const json = JSON.stringify(ids);
  const valuations = marketValuations(database, 'edition', ids, at);
  const model = liquidityModel(database, at);
  let turnover = 0;
  for (const id of ids) {
    const valuation = valuations.get(id);
    if (valuation?.estimate != null)
      turnover += valuation.estimate * editionLiquidity(model, id).chance;
  }
  const prices = database
    .prepare(
      `SELECT o.current_price AS price FROM offers o
       WHERE o.availability IN ('available','unconfirmed') AND o.current_price>0 AND o.current_price<1000000
         AND o.currency='PLN' AND EXISTS (SELECT 1 FROM offer_matches m WHERE m.offer_id=o.id
           AND m.status='active' AND m.edition_id IN (SELECT value FROM json_each(?)))`,
    )
    .all(json)
    .map((row) => Number(row.price))
    .sort((a, b) => a - b);
  const liveCount = database
    .prepare(
      `SELECT count(*) AS n FROM offers o WHERE o.availability IN ('available','unconfirmed') AND EXISTS (SELECT 1
         FROM offer_matches m WHERE m.offer_id=o.id AND m.status='active'
           AND m.edition_id IN (SELECT value FROM json_each(?)))`,
    )
    .get(json);
  return {
    name,
    workCount,
    editionCount: ids.length,
    turnover: Math.round(turnover / 100) * 100,
    liveOffers: Number(liveCount.n),
    medianPrice: prices.length ? prices[Math.floor((prices.length - 1) / 2)] : null,
  };
}

/** Works with two editions each, a mix of sources, states, currencies and prices, series on every 5th work. */
function bigWorld(offerCount) {
  const repository = new SqliteCatalogRepository(':memory:');
  const db = repository.database;
  const works = Math.round(offerCount / 7);
  db.exec('BEGIN');
  const work = db.prepare(
    'INSERT INTO works(id, title, authors_json, created_at, updated_at) VALUES (?,?,?,?,?)',
  );
  const edition = db.prepare(
    'INSERT INTO editions(id, work_id, title, created_at, updated_at) VALUES (?,?,?,?,?)',
  );
  const series = db.prepare(
    `INSERT INTO edition_series(edition_id, name, normalized_name, kind, position, source) VALUES (?,?,?,'universe',0,'test')`,
  );
  for (let w = 0; w < works; w++) {
    work.run(
      `w${w}`,
      `Książka ${w}`,
      JSON.stringify([`Nazwisko${w % 300}, Autor${w % 300}`]),
      daysAgo(5),
      daysAgo(5),
    );
    for (let e = 0; e < 2; e++) {
      edition.run(`e${w}_${e}`, `w${w}`, `Książka ${w}`, daysAgo(5), daysAgo(5));
      if (w % 5 === 0) series.run(`e${w}_${e}`, `Seria ${w % 10}`, `seria ${w % 10}`);
    }
  }
  const states = ['available', 'available', 'sold', 'unavailable', 'not_seen', 'unconfirmed'];
  const offer = db.prepare(
    `INSERT INTO offers(id, source, normalized_url, original_title, current_price, currency, availability, condition_class, seller_id, seller_name, favourite_count, availability_changed_at, first_seen_at, last_seen_at, created_at, updated_at)
     VALUES (?,?,?,'Książka',?,?,?,'good',?,?,?,?,?,?,?,?)`,
  );
  const match = db.prepare(
    `INSERT INTO offer_matches(id, offer_id, edition_id, method, status, created_by, valid_from, created_at) VALUES (?,?,?,'manual','active','test',?,?)`,
  );
  for (let i = 0; i < offerCount; i++) {
    const price = i % 41 === 0 ? 2_000_000 : 1500 + ((i * 37) % 3000);
    offer.run(
      `o${i}`,
      i % 3 ? 'Vinted' : 'Empik',
      `https://example.test/${i}`,
      price,
      i % 23 === 0 ? 'EUR' : 'PLN',
      states[i % states.length],
      `s${i % 2000}`,
      i % 3 ? null : `Sklep ${i % 2000}`,
      i % 7,
      daysAgo(3),
      daysAgo(30 - (i % 25)),
      daysAgo(1),
      daysAgo(30),
      daysAgo(1),
    );
    if (i % 17 !== 0) match.run(`m${i}`, `o${i}`, `e${i % works}_${i % 2}`, daysAgo(5), daysAgo(5));
  }
  db.exec('COMMIT');
  return repository;
}

test('author and series cards give the same figures as the per-card, per-edition computation', () => {
  const total = 3000;
  const repository = bigWorld(total);
  try {
    const db = repository.database;
    const works = Math.round(total / 7);
    const editionsOfWorks = (workIds) =>
      db
        .prepare(
          `SELECT id FROM editions WHERE is_unknown=0 AND work_id IN (SELECT value FROM json_each(?))`,
        )
        .all(JSON.stringify(workIds))
        .map((row) => row.id);
    const authors = searchEntities(repository, 'nazwisko1', { at: AT }).authors;
    assert.ok(authors.length >= 2);
    for (const card of authors) {
      const key = Number(card.name.match(/\d+/)[0]);
      const workIds = [];
      for (let w = key; w < works; w += 300) workIds.push(`w${w}`);
      assert.deepEqual(
        card,
        referenceCard(db, editionsOfWorks(workIds), workIds.length, card.name, AT),
      );
    }
    const series = searchEntities(repository, 'seria', { at: AT }).series;
    assert.equal(series.length, 2);
    for (const card of series) {
      const rows = db
        .prepare(
          'SELECT s.edition_id AS id, e.work_id AS workId FROM edition_series s JOIN editions e ON e.id=s.edition_id WHERE s.name=?',
        )
        .all(card.name);
      assert.ok(rows.length > 0);
      assert.deepEqual(
        card,
        referenceCard(
          db,
          rows.map((row) => row.id),
          new Set(rows.map((row) => row.workId)).size,
          card.name,
          AT,
        ),
      );
    }
    assert.ok(
      authors.some((card) => card.turnover > 0 && card.liveOffers > 0 && card.medianPrice > 0),
    );
  } finally {
    repository.close();
  }
});

test('the turnover model is reused until something is written', () => {
  const repository = bigWorld(700);
  try {
    const before = searchEntities(repository, 'nazwisko1', { at: AT }).authors;
    assert.deepEqual(searchEntities(repository, 'nazwisko1', { at: AT }).authors, before);
    // A change recorded after the first search must show in the next one.
    repository.database
      .prepare(
        `UPDATE offers SET availability='sold', availability_changed_at=? WHERE availability='available'`,
      )
      .run(daysAgo(1));
    const after = searchEntities(repository, 'nazwisko1', { at: AT }).authors;
    assert.notDeepEqual(
      after.map((card) => card.liveOffers),
      before.map((card) => card.liveOffers),
    );
  } finally {
    repository.close();
  }
});

test('author and series cards on 10 000 offers: under 60 ms with the model cached, under 120 ms without (CPU time, best of five; slack for parallel verify)', () => {
  const repository = bigWorld(10_000);
  try {
    const db = repository.database;
    searchEntities(repository, 'nazwisko1', { at: AT }); // warm up statements
    const best = { warm: Infinity, cold: Infinity };
    for (let run = 0; run < 5; run++) {
      for (const text of ['nazwisko1', 'seria']) {
        for (const kind of ['cold', 'warm']) {
          // A write drops the cached model: the cold run pays for the whole computation.
          if (kind === 'cold')
            db.prepare("UPDATE offers SET favourite_count=favourite_count WHERE id='o1'").run();
          const started = process.cpuUsage();
          const result = searchEntities(repository, text, { at: AT });
          const used = process.cpuUsage(started);
          assert.ok(result.authors.length + result.series.length > 0);
          best[kind] = Math.min(best[kind], (used.user + used.system) / 1000);
        }
      }
    }
    assert.ok(best.warm < 60, `warm took ${best.warm.toFixed(1)} ms`);
    assert.ok(best.cold < 120, `cold took ${best.cold.toFixed(1)} ms`);
  } finally {
    repository.close();
  }
});
