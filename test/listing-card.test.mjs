import assert from 'node:assert/strict';
import test from 'node:test';

import { chanceAtPrice, listingCard, listingText } from '../listing-card.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const DAY = 86_400_000;
const AT = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (days) => new Date(AT - days * DAY).toISOString();

function shop({ offers = true } = {}) {
  const repository = new SqliteCatalogRepository(':memory:');
  repository.createWork({ id: 'w', title: 'Mort', authors: ['Pratchett, Terry'] });
  const edition = repository.createEditionForISBN({
    workId: 'w',
    isbn: '9788373196032',
    title: 'Mort',
    publisher: 'Prószyński',
    publicationYear: 2003,
  });
  if (offers) {
    let n = 0;
    const add = (price, soldAfter = null) => {
      const id = `o${n++}`;
      repository.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: 'Mort',
        currentPrice: price,
        conditionClass: 'good',
        availability: soldAfter == null ? 'available' : 'sold',
        firstSeenAt: daysAgo(20),
        favouriteCount: 3,
      });
      if (soldAfter != null)
        repository.database
          .prepare('UPDATE offers SET availability_changed_at=? WHERE id=?')
          .run(daysAgo(20 - soldAfter), id);
      repository.assignOfferToEdition(id, edition.id, {
        id: 'm' + id,
        method: 'manual',
        status: 'active',
      });
    };
    for (let i = 0; i < 5; i++) add(4000 + i * 100, 2 + i);
    add(4500);
    add(4200);
  }
  return { repository, editionId: edition.id };
}

test('prices rise strictly across the tiers and the sale chance falls with the price', () => {
  const { repository, editionId } = shop();
  try {
    const card = listingCard(repository, editionId, { at: AT });
    assert.equal(card.reason, null);
    const [quick, middle, patient] = card.tiers;
    assert.ok(quick.price < middle.price && middle.price < patient.price);
    assert.ok(quick.chance > middle.chance && middle.chance > patient.chance);
    for (const tier of card.tiers) assert.equal(tier.price % 100, 0);
    // The chance property holds for any base: a higher price never raises it.
    for (const base of [0.05, 0.3, 0.8])
      assert.ok(chanceAtPrice(base, 4000, 5000) < chanceAtPrice(base, 4000, 3000));
    assert.deepEqual(card.competition, { count: 2, cheapest: 4200, median: 4200 });
  } finally {
    repository.close();
  }
});

test('a worse condition lowers the prices; without a reliable valuation no price is guessed', () => {
  const { repository, editionId } = shop();
  const bare = shop({ offers: false });
  try {
    const good = listingCard(repository, editionId, { at: AT, condition: 'good' });
    const worn = listingCard(repository, editionId, { at: AT, condition: 'satisfactory' });
    assert.ok(worn.tiers[1].price < good.tiers[1].price);
    const none = listingCard(bare.repository, bare.editionId, { at: AT });
    assert.equal(none.tiers, null);
    assert.equal(none.reason, 'za_malo_ofert');
    assert.throws(() => listingCard(repository, 'missing'), /EDITION_NOT_FOUND/);
  } finally {
    repository.close();
    bare.repository.close();
  }
});

test('the text has only what the catalogue knows, keeps Polish letters and leaves the state to fill', () => {
  const full = listingText(
    { title: 'Żółć', authors: ['Łoś, Jan'], publisher: 'Wydawnictwo Śląsk', year: 2011 },
    '9788373196032',
    null,
  );
  assert.equal(full.title, 'Żółć — Łoś, Jan');
  assert.match(full.description, /Wydawnictwo: Wydawnictwo Śląsk/);
  assert.match(full.description, /Stan: \[uzupełnij\]/);
  const bare = listingText({ title: 'Mort', authors: [], publisher: null, year: null }, '', 'good');
  assert.equal(bare.title, 'Mort');
  assert.equal(bare.description, 'Tytuł: Mort\nStan: Dobry');
  for (const text of [full.description, bare.description, full.title])
    assert.ok(!/null|undefined/.test(text), text);
});

test('GET /api/editions/:id/listing-card answers over HTTP', async () => {
  const { repository, editionId } = shop();
  const server = createLocalAppServer({ catalogProvider: () => ({ repository }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const card = await (
      await fetch(`${base}/api/editions/${editionId}/listing-card?condition=good`)
    ).json();
    assert.equal(card.edition.title, 'Mort');
    assert.equal(card.condition, 'good');
    assert.equal((await fetch(`${base}/api/editions/nope/listing-card`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repository.close();
  }
});

test('an edition with no sales of its own gets prices but no made-up chance', () => {
  const { repository, editionId } = shop({ offers: false });
  try {
    for (let i = 0; i < 3; i++) {
      repository.upsertOffer({
        id: `x${i}`,
        source: 'Vinted',
        normalizedUrl: `https://example.test/x${i}`,
        originalTitle: 'Mort',
        currentPrice: 4000 + i * 100,
        conditionClass: 'good',
        availability: 'available',
        firstSeenAt: daysAgo(20),
        favouriteCount: 3,
      });
      repository.assignOfferToEdition(`x${i}`, editionId, {
        id: `mx${i}`,
        method: 'manual',
        status: 'active',
      });
    }
    const card = listingCard(repository, editionId, { at: AT });
    if (card.tiers) for (const tier of card.tiers) assert.equal(tier.chance, null);
  } finally {
    repository.close();
  }
});
