import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { listLabels, setWorkLabels, workLabels, labelWorkIds } from '../catalog-labels.mjs';
import {
  addToLabel,
  copySeriesToLabels,
  createLabel,
  deleteLabel,
  labelBooks,
  removeFromLabel,
  renameLabel,
  reorderLabel,
  setLabelVolume,
} from '../label-collections.mjs';
import { createOwnSeries, listOwnSeries, updateWorkSeries } from '../work-series-api.mjs';
import { runOnce } from '../startup-jobs.mjs';

function catalogue() {
  const repository = new SqliteCatalogRepository(':memory:');
  for (const [id, title] of [
    ['a', 'Alfa'],
    ['b', 'Beta'],
    ['c', 'Gamma'],
    ['d', 'Delta'],
  ])
    repository.createWork({ id, title, authors: ['Autor'] });
  return repository;
}
const order = (repository, name) => labelBooks(repository, name).works.map((work) => work.id);

test('a label exists empty, is listed, and a duplicate name is refused', () => {
  const repository = catalogue();
  try {
    assert.deepEqual(createLabel(repository, { name: '  Duchy   Gaunta ' }), {
      label: 'Duchy Gaunta',
      works: 0,
    });
    assert.deepEqual(listLabels(repository).items, [{ label: 'Duchy Gaunta', works: 0 }]);
    assert.throws(() => createLabel(repository, { name: 'duchy gaunta' }), /LABEL_EXISTS/);
    assert.throws(() => createLabel(repository, { name: '   ' }), /INVALID_LABEL_NAME/);
    assert.throws(() => createLabel(repository, { name: 'x'.repeat(61) }), /INVALID_LABEL_NAME/);
    // The label is reused when a book gets it by the old way: the first spelling wins.
    setWorkLabels(repository, 'a', ['DUCHY GAUNTA']);
    assert.deepEqual(workLabels(repository, 'a'), ['Duchy Gaunta']);
    assert.deepEqual(listLabels(repository).items, [{ label: 'Duchy Gaunta', works: 1 }]);
  } finally {
    repository.close();
  }
});

test('books keep the order they were added in; reorder, volume and removal', () => {
  const repository = catalogue();
  try {
    createLabel(repository, { name: 'Cykl' });
    assert.equal(addToLabel(repository, 'cykl', { workIds: ['c', 'a'] }).added, 2);
    assert.equal(addToLabel(repository, 'Cykl', { workIds: ['a', 'b'] }).added, 1);
    assert.deepEqual(order(repository, 'Cykl'), ['c', 'a', 'b']);
    assert.deepEqual(
      labelBooks(repository, 'Cykl').works.map((work) => work.position),
      [1, 2, 3],
    );
    reorderLabel(repository, 'Cykl', { workIds: ['b', 'c', 'a'] });
    assert.deepEqual(order(repository, 'Cykl'), ['b', 'c', 'a']);
    assert.throws(() => reorderLabel(repository, 'Cykl', { workIds: ['d'] }), /INVALID_ORDER/);
    assert.deepEqual(setLabelVolume(repository, 'Cykl', 'c', { volume: 2 }), {
      workId: 'c',
      volume: 2,
    });
    assert.throws(() => setLabelVolume(repository, 'Cykl', 'c', { volume: 0 }), /INVALID_VOLUME/);
    assert.throws(() => setLabelVolume(repository, 'Cykl', 'd', { volume: 1 }), /NOT_IN_LABEL/);
    assert.equal(labelBooks(repository, 'Cykl').works[1].volume, 2);
    // Removing closes the gap and keeps the rest in order; the book itself stays.
    removeFromLabel(repository, 'Cykl', 'c');
    assert.deepEqual(order(repository, 'Cykl'), ['b', 'a']);
    assert.deepEqual(
      labelBooks(repository, 'Cykl').works.map((work) => work.position),
      [1, 2],
    );
    assert.ok(repository.database.prepare("SELECT 1 FROM works WHERE id='c'").get());
    assert.throws(() => removeFromLabel(repository, 'Cykl', 'c'), /NOT_IN_LABEL/);
    assert.throws(() => addToLabel(repository, 'Nie ma', { workIds: ['a'] }), /LABEL_NOT_FOUND/);
    assert.throws(() => addToLabel(repository, 'Cykl', { workIds: ['zzz'] }), /WORK_NOT_FOUND/);
    // A book added through the old per-book editor lands at the end.
    setWorkLabels(repository, 'd', ['Cykl']);
    assert.deepEqual(order(repository, 'Cykl'), ['b', 'a', 'd']);
  } finally {
    repository.close();
  }
});

test('rename keeps books and order; the same name needs a merge, which appends', () => {
  const repository = catalogue();
  try {
    createLabel(repository, { name: 'Gaunt' });
    addToLabel(repository, 'Gaunt', { workIds: ['b', 'a'] });
    setLabelVolume(repository, 'Gaunt', 'b', { volume: 7 });
    assert.deepEqual(renameLabel(repository, 'gaunt', { name: 'Duchy Gaunta' }), {
      label: 'Duchy Gaunta',
      works: 2,
      merged: false,
    });
    assert.deepEqual(order(repository, 'Duchy Gaunta'), ['b', 'a']);
    assert.equal(labelBooks(repository, 'Duchy Gaunta').works[0].volume, 7);
    assert.deepEqual(workLabels(repository, 'a'), ['Duchy Gaunta']);
    assert.throws(() => labelBooks(repository, 'Gaunt'), /LABEL_NOT_FOUND/);
    // Only the case changes.
    renameLabel(repository, 'Duchy Gaunta', { name: 'DUCHY GAUNTA' });
    assert.deepEqual(listLabels(repository).items, [{ label: 'DUCHY GAUNTA', works: 2 }]);

    createLabel(repository, { name: 'Inne' });
    addToLabel(repository, 'Inne', { workIds: ['c', 'a'] });
    assert.throws(() => renameLabel(repository, 'Inne', { name: 'duchy gaunta' }), /LABEL_EXISTS/);
    assert.deepEqual(order(repository, 'Inne'), ['c', 'a']);
    const merged = renameLabel(repository, 'Inne', { name: 'duchy gaunta', merge: true });
    assert.deepEqual(merged, { label: 'DUCHY GAUNTA', works: 3, merged: true });
    // The target's books first, then the new ones; a book in both is there once.
    assert.deepEqual(order(repository, 'DUCHY GAUNTA'), ['b', 'a', 'c']);
    assert.deepEqual(workLabels(repository, 'a'), ['DUCHY GAUNTA']);
    assert.deepEqual(listLabels(repository).items, [{ label: 'DUCHY GAUNTA', works: 3 }]);
  } finally {
    repository.close();
  }
});

test('merge appends after a target with gaps; the old per-book editor leaves no gaps', () => {
  const repository = catalogue();
  try {
    createLabel(repository, { name: 'Cel' });
    addToLabel(repository, 'Cel', { workIds: ['a', 'b', 'c'] });
    // Removing through the per-book editor closes the gap.
    setWorkLabels(repository, 'b', []);
    assert.deepEqual(
      labelBooks(repository, 'Cel').works.map((work) => work.position),
      [1, 2],
    );
    // A gap left some other way (positions 5 and 9) does not put new books in the middle.
    repository.database
      .prepare(
        "UPDATE work_labels SET position=CASE work_id WHEN 'a' THEN 5 ELSE 9 END WHERE normalized_label='cel'",
      )
      .run();
    createLabel(repository, { name: 'Zrodlo' });
    addToLabel(repository, 'Zrodlo', { workIds: ['d', 'b'] });
    renameLabel(repository, 'Zrodlo', { name: 'cel', merge: true });
    assert.deepEqual(order(repository, 'Cel'), ['a', 'c', 'd', 'b']);
    assert.deepEqual(
      labelBooks(repository, 'Cel').works.map((work) => work.position),
      [1, 2, 3, 4],
    );
  } finally {
    repository.close();
  }
});

test('series whose names differ only after 60 characters are counted, not merged silently', () => {
  const repository = catalogue();
  try {
    const long = 'S'.repeat(60);
    updateWorkSeries(repository, 'a', { series: long + 'x', volume: 1 });
    updateWorkSeries(repository, 'b', { series: long + 'y', volume: 2 });
    const result = copySeriesToLabels(repository);
    assert.equal(result.labels, 1);
    assert.equal(result.merged, 1);
    assert.deepEqual(order(repository, long), ['a', 'b']);
    // Idempotent: a second run adds nothing.
    assert.deepEqual(copySeriesToLabels(repository), { labels: 0, books: 0, merged: 1 });
  } finally {
    repository.close();
  }
});

test('deleting a label keeps the books; a hidden book does not count', () => {
  const repository = catalogue();
  try {
    createLabel(repository, { name: 'Do usunięcia' });
    addToLabel(repository, 'Do usunięcia', { workIds: ['a', 'b'] });
    repository.database
      .prepare('INSERT INTO removed_works(work_id, title, removed_at) VALUES (?,?,?)')
      .run('b', 'Beta', new Date().toISOString());
    assert.deepEqual(listLabels(repository).items, [{ label: 'Do usunięcia', works: 1 }]);
    assert.deepEqual(deleteLabel(repository, 'do usunięcia'), { deleted: true, works: 2 });
    assert.deepEqual(listLabels(repository).items, []);
    assert.deepEqual(labelWorkIds(repository, 'Do usunięcia'), []);
    assert.equal(repository.database.prepare('SELECT count(*) AS n FROM works').get().n, 4);
    assert.throws(() => deleteLabel(repository, 'Do usunięcia'), /LABEL_NOT_FOUND/);
  } finally {
    repository.close();
  }
});

test('own series are copied to labels in volume order, once, without touching the series', () => {
  const repository = catalogue();
  try {
    createOwnSeries(repository, { name: 'Cykl', workIds: ['c', 'a', 'b'] });
    updateWorkSeries(repository, 'c', { series: 'Cykl', volume: 1 });
    updateWorkSeries(repository, 'a', { series: 'Cykl', volume: 2 });
    updateWorkSeries(repository, 'd', { series: 'Z tomu', volume: 1 });
    assert.deepEqual(
      runOnce(repository, 'own_series_to_labels_v1', () => copySeriesToLabels(repository)),
      { labels: 2, books: 4, merged: 0 },
    );
    // Numbered first (1, 2), then the one without a number.
    assert.deepEqual(order(repository, 'Cykl'), ['c', 'a', 'b']);
    assert.equal(labelBooks(repository, 'Cykl').works[0].volume, 1);
    assert.deepEqual(order(repository, 'Z tomu'), ['d']);
    assert.deepEqual(
      runOnce(repository, 'own_series_to_labels_v1', () => copySeriesToLabels(repository)),
      { skipped: true },
    );
    // The originals stay.
    assert.equal(listOwnSeries(repository).items[0].works, 3);
    assert.equal(
      repository.database.prepare('SELECT count(*) AS n FROM work_series_annotations').get().n,
      4,
    );
  } finally {
    repository.close();
  }
});

test('collections over HTTP', async () => {
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
    assert.equal((await send('POST', '/api/catalog/labels', { name: 'Moja półka' })).status, 200);
    assert.equal((await send('POST', '/api/catalog/labels', { name: 'moja półka' })).status, 409);
    const path = '/api/catalog/labels/' + encodeURIComponent('Moja półka');
    assert.equal((await send('POST', path + '/works', { workIds: ['b', 'a'] })).status, 200);
    assert.equal((await send('PUT', path + '/order', { workIds: ['a', 'b'] })).status, 200);
    assert.equal((await send('PUT', path + '/works/a', { volume: 1 })).status, 200);
    const books = await (await fetch(base + path + '/works')).json();
    assert.deepEqual(
      books.works.map((work) => [work.id, work.position, work.volume]),
      [
        ['a', 1, 1],
        ['b', 2, null],
      ],
    );
    assert.equal((await send('PUT', path, { name: 'Nowa nazwa' })).status, 200);
    assert.equal((await fetch(base + path + '/works')).status, 404);
    assert.equal((await send('DELETE', '/api/catalog/labels/Nowa%20nazwa/works/a')).status, 200);
    assert.equal((await send('DELETE', '/api/catalog/labels/Nowa%20nazwa')).status, 200);
    assert.equal((await send('DELETE', '/api/catalog/labels/Nowa%20nazwa')).status, 404);
  } finally {
    server.close();
    repository.close();
  }
});
