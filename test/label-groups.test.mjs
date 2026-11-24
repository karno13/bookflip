import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { listLabels, workLabels } from '../catalog-labels.mjs';
import {
  addToLabel,
  createLabel,
  deleteLabel,
  labelBooks,
  removeFromLabel,
  renameLabel,
  reorderLabel,
  setLabelVolume,
} from '../label-collections.mjs';
import { assignToGroup, createGroup, deleteGroup, renameGroup } from '../label-groups.mjs';
import { labelMarket } from '../label-market.mjs';

function catalogue() {
  const repository = new SqliteCatalogRepository(':memory:');
  for (const [id, title] of [
    ['a', 'Alfa'],
    ['b', 'Beta'],
    ['c', 'Gamma'],
    ['d', 'Delta'],
  ])
    repository.createWork({ id, title, authors: ['Autor'] });
  createLabel(repository, { name: 'Cykl' });
  addToLabel(repository, 'Cykl', { workIds: ['a', 'b', 'c'] });
  return repository;
}
const groupsOf = (repository) =>
  Object.fromEntries(labelBooks(repository, 'Cykl').works.map((work) => [work.id, work.groupId]));

test('sub-labels: create, rename, assign, move; order and volume stay', () => {
  const repository = catalogue();
  try {
    setLabelVolume(repository, 'Cykl', 'b', { volume: 5 });
    const one = createGroup(repository, 'cykl', { name: ' Część   pierwsza ' });
    assert.equal(one.name, 'Część pierwsza');
    const two = createGroup(repository, 'Cykl', { name: 'Część druga' });
    assert.throws(
      () => createGroup(repository, 'Cykl', { name: 'część PIERWSZA' }),
      /GROUP_EXISTS/,
    );
    assert.throws(() => createGroup(repository, 'Cykl', { name: '  ' }), /INVALID_GROUP_NAME/);
    assert.throws(() => createGroup(repository, 'Nie ma', { name: 'x' }), /LABEL_NOT_FOUND/);
    assignToGroup(repository, 'Cykl', { workIds: ['a', 'b'], groupId: one.id });
    assert.deepEqual(groupsOf(repository), { a: one.id, b: one.id, c: null });
    // Moving to another group replaces the first (at most one).
    assignToGroup(repository, 'Cykl', { workIds: ['b'], groupId: two.id });
    assert.deepEqual(groupsOf(repository), { a: one.id, b: two.id, c: null });
    const books = labelBooks(repository, 'Cykl');
    assert.deepEqual(
      books.groups.map((group) => [group.name, group.works]),
      [
        ['Część pierwsza', 1],
        ['Część druga', 1],
      ],
    );
    assert.deepEqual(
      books.works.map((work) => [work.id, work.position, work.volume]),
      [
        ['a', 1, null],
        ['b', 2, 5],
        ['c', 3, null],
      ],
    );
    assert.deepEqual(renameGroup(repository, 'Cykl', two.id, { name: 'Druga' }), {
      id: two.id,
      name: 'Druga',
    });
    assert.throws(
      () => renameGroup(repository, 'Cykl', two.id, { name: 'Część pierwsza' }),
      /GROUP_EXISTS/,
    );
    // Back to the main list; a book outside the label or an unknown group is refused.
    assignToGroup(repository, 'Cykl', { workIds: ['a'], groupId: null });
    assert.equal(groupsOf(repository).a, null);
    assert.throws(
      () => assignToGroup(repository, 'Cykl', { workIds: ['d'], groupId: one.id }),
      /NOT_IN_LABEL/,
    );
    assert.throws(
      () => assignToGroup(repository, 'Cykl', { workIds: ['a'], groupId: 999 }),
      /GROUP_NOT_FOUND/,
    );
    // Reordering keeps the assignment.
    reorderLabel(repository, 'Cykl', { workIds: ['c', 'b', 'a'] });
    assert.equal(groupsOf(repository).b, two.id);
  } finally {
    repository.close();
  }
});

test('deleting a sub-label returns its books to the main list, never deletes them', () => {
  const repository = catalogue();
  try {
    const one = createGroup(repository, 'Cykl', { name: 'Jeden' });
    assignToGroup(repository, 'Cykl', { workIds: ['a', 'b'], groupId: one.id });
    assert.deepEqual(deleteGroup(repository, 'Cykl', one.id), { deleted: true, released: 2 });
    assert.deepEqual(groupsOf(repository), { a: null, b: null, c: null });
    assert.deepEqual(labelBooks(repository, 'Cykl').groups, []);
    assert.throws(() => deleteGroup(repository, 'Cykl', one.id), /GROUP_NOT_FOUND/);
    assert.equal(labelBooks(repository, 'Cykl').works.length, 3);
  } finally {
    repository.close();
  }
});

test('sub-labels are not labels elsewhere, survive rename, follow a merge, go with the label', () => {
  const repository = catalogue();
  try {
    const one = createGroup(repository, 'Cykl', { name: 'Jeden' });
    assignToGroup(repository, 'Cykl', { workIds: ['a'], groupId: one.id });
    // No badge: the book's labels and the list of labels know nothing of sub-labels.
    assert.deepEqual(workLabels(repository, 'a'), ['Cykl']);
    assert.deepEqual(
      listLabels(repository).items.map((item) => item.label),
      ['Cykl'],
    );
    // The market works over the whole label.
    assert.equal(labelMarket(repository, 'Cykl').books.length, 3);
    renameLabel(repository, 'Cykl', { name: 'Nowy cykl' });
    assert.equal(labelBooks(repository, 'Nowy cykl').works[0].groupId, one.id);
    // Merge into another label: the group moves along (a same-named group is reused).
    createLabel(repository, { name: 'Inny' });
    addToLabel(repository, 'Inny', { workIds: ['d'] });
    const same = createGroup(repository, 'Inny', { name: 'jeden' });
    assignToGroup(repository, 'Inny', { workIds: ['d'], groupId: same.id });
    renameLabel(repository, 'Nowy cykl', { name: 'Inny', merge: true }); // a, b, c join the end
    const merged = labelBooks(repository, 'Inny');
    assert.deepEqual(
      merged.groups.map((group) => group.name),
      ['jeden'],
    );
    assert.deepEqual(
      merged.works.map((work) => [work.id, work.groupId]),
      [
        ['d', same.id],
        ['a', same.id],
        ['b', null],
        ['c', null],
      ],
    );
    // A removed book leaves its group; deleting the label removes its groups.
    removeFromLabel(repository, 'Inny', 'a');
    assert.equal(labelBooks(repository, 'Inny').groups[0].works, 1);
    deleteLabel(repository, 'Inny');
    assert.equal(repository.database.prepare('SELECT count(*) AS n FROM label_groups').get().n, 0);
    assert.equal(repository.database.prepare('SELECT count(*) AS n FROM works').get().n, 4);
  } finally {
    repository.close();
  }
});

test('sub-labels over HTTP', async () => {
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
    const path = '/api/catalog/labels/Cykl';
    const made = await send('POST', path + '/groups', { name: 'Podseria' });
    assert.equal(made.status, 200);
    const { id } = await made.json();
    assert.equal((await send('POST', path + '/groups', { name: 'podseria' })).status, 409);
    assert.equal(
      (await send('PUT', path + '/assign', { workIds: ['a', 'c'], groupId: id })).status,
      200,
    );
    assert.equal(
      (await send('PUT', path + '/assign', { workIds: ['d'], groupId: id })).status,
      404,
    );
    assert.equal((await send('PUT', `${path}/groups/${id}`, { name: 'Nowa' })).status, 200);
    const books = await (await fetch(base + path + '/works')).json();
    assert.deepEqual(
      books.works.map((work) => work.groupId),
      [id, null, id],
    );
    assert.deepEqual(books.groups, [{ id, name: 'Nowa', works: 2 }]);
    assert.equal((await send('DELETE', `${path}/groups/${id}`)).status, 200);
    assert.equal((await send('DELETE', `${path}/groups/${id}`)).status, 404);
    assert.equal((await send('PUT', path + '/assign', { workIds: ['a'] })).status, 200);
  } finally {
    server.close();
    repository.close();
  }
});

test('hidden books are not counted; a work merge keeps the sub-label of copied rows', async () => {
  const { moveLabelsOfMergedWorks } = await import('../startup-jobs.mjs');
  const repository = catalogue();
  try {
    const one = createGroup(repository, 'Cykl', { name: 'Jeden' });
    assignToGroup(repository, 'Cykl', { workIds: ['a', 'b'], groupId: one.id });
    repository.database
      .prepare(
        "INSERT INTO removed_works(work_id, title, removed_at) VALUES ('b', 'Beta', '2026-01-01')",
      )
      .run();
    assert.equal(labelBooks(repository, 'Cykl').groups[0].works, 1);
    // Work 'a' was merged into 'd' (which lacks the label): its row, with the sub-label, moves.
    repository.database
      .prepare(
        "INSERT INTO catalog_work_merges(source_id, target_id, created_at) VALUES ('a', 'd', '2026-01-01')",
      )
      .run();
    moveLabelsOfMergedWorks(repository);
    const row = repository.database
      .prepare("SELECT group_id FROM work_labels WHERE work_id='d'")
      .get();
    assert.equal(row.group_id, one.id);
  } finally {
    repository.close();
  }
});
