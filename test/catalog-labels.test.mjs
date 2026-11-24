import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import {
  NO_LABEL,
  labelWorkIds,
  listLabels,
  setWorkLabels,
  workLabels,
} from '../catalog-labels.mjs';
import { listCatalogWorks } from '../catalog-api.mjs';
import {
  addToSeries,
  createOwnSeries,
  deleteOwnSeries,
  listOwnSeries,
  removeFromSeries,
  updateOwnSeries,
  updateWorkSeries,
} from '../work-series-api.mjs';
import { catalogSeries } from '../catalog-series.mjs';

function catalogue() {
  const repository = new SqliteCatalogRepository(':memory:');
  for (const [id, title] of [
    ['first', 'Pierwszy i jedyny z Tanith'],
    ['ghost', 'Komisarz Gaunt'],
    ['third', 'Nekropolia'],
    ['mort', 'Mort'],
  ])
    repository.createWork({
      id,
      title,
      authors: [id === 'mort' ? 'Pratchett, Terry' : 'Abnett, Dan'],
    });
  return repository;
}
const ids = (result) => result.items.map((item) => item.id).sort();
const shelf = (repository, group) =>
  catalogSeries(repository).find((universe) => universe.name === group);

test('labels: any text, one mark whatever the case, listed with counts, filter the catalogue', () => {
  const repository = catalogue();
  try {
    assert.deepEqual(
      setWorkLabels(repository, 'first', ['Gaunt', ' do  sprawdzenia ', 'gaunt']).labels,
      ['Gaunt', 'do sprawdzenia'],
    );
    // A label used before keeps its first spelling.
    setWorkLabels(repository, 'ghost', ['GAUNT']);
    assert.deepEqual(workLabels(repository, 'ghost'), ['Gaunt']);
    assert.deepEqual(listLabels(repository).items, [
      { label: 'Gaunt', works: 2 },
      { label: 'do sprawdzenia', works: 1 },
    ]);
    assert.deepEqual(labelWorkIds(repository, 'gaunt').sort(), ['first', 'ghost']);
    assert.deepEqual(ids(listCatalogWorks(repository, { label: 'Gaunt' })), ['first', 'ghost']);
    assert.deepEqual(ids(listCatalogWorks(repository, { label: 'nic' })), []);
    // „Bez etykiety”: only the books without any label.
    assert.deepEqual(ids(listCatalogWorks(repository, { label: NO_LABEL })), ['mort', 'third']);
    const row = listCatalogWorks(repository, { label: 'Gaunt' }).items.find(
      (item) => item.id === 'first',
    );
    assert.deepEqual(row.labels, ['Gaunt', 'do sprawdzenia']);
    // Replacing the set removes what is left out.
    setWorkLabels(repository, 'first', ['Gaunt']);
    assert.deepEqual(workLabels(repository, 'first'), ['Gaunt']);
    assert.throws(() => setWorkLabels(repository, 'nope', ['x']), /WORK_NOT_FOUND/);
    assert.throws(() => setWorkLabels(repository, 'first', 'x'), /INVALID_LABELS/);
    assert.throws(() => setWorkLabels(repository, 'first', ['x'.repeat(61)]), /LABEL_TOO_LONG/);
  } finally {
    repository.close();
  }
});

test('an own series exists before its books, shows empty in „Serie”, then takes books', () => {
  const repository = catalogue();
  try {
    createOwnSeries(repository, { name: 'Duchy Gaunta', grouping: 'Warhammer' });
    assert.throws(() => createOwnSeries(repository, { name: 'duchy gaunta' }), /SERIES_EXISTS/);
    const empty = shelf(repository, 'Warhammer');
    assert.equal(empty.cycles[0].name, 'Duchy Gaunta');
    assert.equal(empty.cycles[0].own, true);
    assert.deepEqual(empty.cycles[0].works, []);
    assert.equal(addToSeries(repository, 'Duchy Gaunta', { workIds: ['first', 'ghost'] }).added, 2);
    addToSeries(repository, 'Duchy Gaunta', { workIds: ['third'], volume: 3 });
    const cycle = shelf(repository, 'Warhammer').cycles.find(
      (item) => item.name === 'Duchy Gaunta',
    );
    assert.deepEqual(
      cycle.works.map((work) => [work.id, work.volume]),
      [
        // Numbered first, then by title: "Komisarz Gaunt" before "Pierwszy i jedyny z Tanith".
        ['third', 3],
        ['ghost', null],
        ['first', null],
      ],
    );
    assert.deepEqual(listOwnSeries(repository).items, [
      { name: 'Duchy Gaunta', grouping: 'Warhammer', works: 3 },
    ]);
  } finally {
    repository.close();
  }
});

test('a series without a group is a group of its own; a book in another series is not moved silently', () => {
  const repository = catalogue();
  try {
    updateWorkSeries(repository, 'mort', { series: 'Śmierć', volume: 1 });
    const created = createOwnSeries(repository, {
      name: 'Moje ulubione',
      workIds: ['mort', 'first'],
    });
    assert.equal(created.added, 1);
    assert.deepEqual(created.inOtherSeries, [{ workId: 'mort', series: 'Śmierć' }]);
    assert.deepEqual(
      shelf(repository, 'Moje ulubione').cycles.map((cycle) => [
        cycle.name,
        cycle.works.map((work) => work.id),
      ]),
      [['Moje ulubione', ['first']]],
    );
    assert.equal(
      addToSeries(repository, 'Moje ulubione', { workIds: ['mort'], move: true }).added,
      1,
    );
    assert.equal(shelf(repository, 'Moje ulubione').cycles[0].works.length, 2);
  } finally {
    repository.close();
  }
});

test('rename moves the books with the series; removing a book and deleting the series keep the books', () => {
  const repository = catalogue();
  try {
    createOwnSeries(repository, { name: 'Gaunt', workIds: ['first', 'ghost'] });
    updateOwnSeries(repository, 'gaunt', { name: 'Duchy Gaunta', grouping: 'Warhammer' });
    const cycle = shelf(repository, 'Warhammer').cycles[0];
    assert.equal(cycle.name, 'Duchy Gaunta');
    assert.equal(cycle.works.length, 2);
    removeFromSeries(repository, 'Duchy Gaunta', 'ghost');
    assert.throws(() => removeFromSeries(repository, 'Inna', 'first'), /NOT_IN_SERIES/);
    assert.equal(shelf(repository, 'Warhammer').cycles[0].works.length, 1);
    assert.deepEqual(deleteOwnSeries(repository, 'Duchy Gaunta'), { deleted: true, works: 1 });
    assert.equal(shelf(repository, 'Warhammer'), undefined);
    assert.equal(listCatalogWorks(repository, {}).total, 4, 'the books stay in the catalogue');
    assert.throws(() => deleteOwnSeries(repository, 'Duchy Gaunta'), /SERIES_NOT_FOUND/);
  } finally {
    repository.close();
  }
});

test('„Seria i tom” takes a series without a volume number', () => {
  const repository = catalogue();
  try {
    assert.deepEqual(updateWorkSeries(repository, 'mort', { series: 'Śmierć' }), {
      workId: 'mort',
      series: 'Śmierć',
      volume: null,
    });
    assert.throws(
      () => updateWorkSeries(repository, 'mort', { series: 'Śmierć', volume: 0 }),
      /INVALID_SERIES_ANNOTATION/,
    );
  } finally {
    repository.close();
  }
});

test('labels and own series over HTTP', async () => {
  const repository = catalogue();
  const server = createLocalAppServer({ catalogProvider: () => ({ repository }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (method, path, body) =>
    fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: base },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal(
      (await send('PUT', '/api/catalog/works/first/labels', { labels: ['Gaunt'] })).status,
      200,
    );
    assert.deepEqual(await (await fetch(base + '/api/catalog/labels')).json(), {
      items: [{ label: 'Gaunt', works: 1 }],
    });
    const works = await (await fetch(base + '/api/catalog/works?label=gaunt')).json();
    assert.deepEqual(
      works.items.map((item) => item.id),
      ['first'],
    );
    assert.equal(
      (await send('POST', '/api/catalog/my-series', { name: 'Duchy Gaunta' })).status,
      200,
    );
    const added = await (
      await send(
        'POST',
        '/api/catalog/my-series/' + encodeURIComponent('Duchy Gaunta') + '/works',
        { workIds: ['first'], volume: 1 },
      )
    ).json();
    assert.equal(added.added, 1);
    assert.equal(
      (
        await send(
          'DELETE',
          '/api/catalog/my-series/' + encodeURIComponent('Duchy Gaunta') + '/works/first',
        )
      ).status,
      200,
    );
    assert.equal(
      (await send('DELETE', '/api/catalog/my-series/' + encodeURIComponent('Duchy Gaunta'))).status,
      200,
    );
    assert.equal((await send('POST', '/api/catalog/my-series', { name: '' })).status, 400);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repository.close();
  }
});

test('a series made from a label takes every book with it; again, the books join the existing one', () => {
  const repository = catalogue();
  try {
    setWorkLabels(repository, 'first', ['Gaunt']);
    setWorkLabels(repository, 'ghost', ['gaunt']);
    const created = createOwnSeries(repository, { name: 'Gaunt', label: 'Gaunt' });
    assert.equal(created.added, 2);
    setWorkLabels(repository, 'third', ['Gaunt']);
    assert.equal(
      addToSeries(repository, 'Gaunt', { label: 'gaunt' }).added,
      3,
      'the two already in it are kept',
    );
    assert.equal(shelf(repository, 'Gaunt').cycles[0].works.length, 3);
  } finally {
    repository.close();
  }
});

test('the client and the server agree on the „Bez etykiety” value', async () => {
  const client = await import('../app/views/labels.js');
  assert.equal(client.NO_LABEL, NO_LABEL);
});
