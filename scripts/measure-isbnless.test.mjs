import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { formatReport, isOwnerData, measureIsbnless } from './measure-isbnless.mjs';

test('the script refuses the owner data folder and anything inside it', () => {
  const data = 'C:/Users/x/AppData/Local/BookFlip/data/bookflip-catalog.sqlite';
  assert.equal(isOwnerData(data, data), true);
  assert.equal(isOwnerData('C:/Users/x/AppData/Local/BookFlip/data/backups/a.sqlite', data), true);
  assert.equal(isOwnerData('C:/Temp/copy.sqlite', data), false);
});

test('it counts offers without ISBN and measures a title suggestion against manual matches', () => {
  const repo = new SqliteCatalogRepository(':memory:');
  try {
    for (const [id, title] of [
      ['w1', 'Kroniki Malusa Klatwa demona'],
      ['w2', 'Piaski czasu Frank Herbert'],
    ]) {
      repo.createWork({ id, title, authors: ['X, Y'] });
      repo.createEdition({ id: 'e' + id, workId: id, title });
    }
    let n = 0;
    const add = (source, title, isbn, edition) => {
      const id = `o${n++}`;
      repo.upsertOffer({
        id,
        source,
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: title,
        currentPrice: 1000,
        observedIsbn: isbn,
      });
      if (edition)
        repo.assignOfferToEdition(id, edition, {
          id: 'm' + id,
          method: 'manual',
          status: 'active',
        });
    };
    // 3 right suggestions, 1 wrong (the owner put it on the other work), 1 unrelated, 1 with ISBN.
    for (let i = 0; i < 3; i++) add('Vinted', 'Kroniki Malusa Klątwa demona używana', null, 'ew1');
    add('Vinted', 'Kroniki Malusa Klątwa demona dodruk', null, 'ew2');
    add('Vinted', 'Zupełnie inna książka kucharska', null, null);
    add('Vinted', 'Kroniki Malusa Klątwa demona', '9780306406157', null);
    const report = measureIsbnless(repo.database);
    assert.deepEqual(report.sources, [
      { source: 'Vinted', total: 6, withoutIsbn: 5, share: 0.833 },
    ]);
    assert.equal(report.withoutIsbn, 5);
    assert.equal(report.candidates, 4);
    assert.equal(report.confirmedSample, 4);
    assert.equal(report.workPrecision, 0.75);
    // Fewer than 30 confirmed offers: no verdict is given.
    assert.equal(report.verdict, 'za_mala_proba');
    assert.match(formatReport(report), /Vinted: 5 z 6/);
  } finally {
    repo.close();
  }
});
