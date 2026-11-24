import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { NO_LABEL } from '../catalog-labels.mjs';
import { addToLabel, createLabel, reorderLabel } from '../label-collections.mjs';
import { listCatalogWorks } from '../catalog-api.mjs';

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
const titles = (result) => result.items.map((item) => item.title);

test('sort=label lists the books of a label filter in the owner order, not alphabetically', () => {
  const repository = catalogue();
  try {
    createLabel(repository, { name: 'Cykl' });
    addToLabel(repository, 'Cykl', { workIds: ['c'], volume: 1 });
    addToLabel(repository, 'Cykl', { workIds: ['a'], volume: 2 });
    addToLabel(repository, 'Cykl', { workIds: ['b'], volume: 3 });

    assert.deepEqual(titles(listCatalogWorks(repository, { label: 'cykl', sort: 'label' })), [
      'Gamma',
      'Alfa',
      'Beta',
    ]);
    // Without the label sort the same filter stays alphabetical.
    assert.deepEqual(titles(listCatalogWorks(repository, { label: 'cykl' })), [
      'Alfa',
      'Beta',
      'Gamma',
    ]);

    reorderLabel(repository, 'Cykl', { workIds: ['b', 'c', 'a'] });
    assert.deepEqual(titles(listCatalogWorks(repository, { label: 'Cykl', sort: 'label' })), [
      'Beta',
      'Gamma',
      'Alfa',
    ]);
  } finally {
    repository.close();
  }
});

test('sort=label finds the order of a label whose name has the letter s or repeated spaces', () => {
  // Regression: the filter was normalised with /s+/ (the letter) instead of /\s+/, so any name with a
  // lower-case "s" lost its order and fell back to the alphabet.
  const repository = catalogue();
  try {
    createLabel(repository, { name: 'Kroniki szeptów' });
    addToLabel(repository, 'Kroniki szeptów', { workIds: ['c', 'a', 'b'] });
    for (const label of ['Kroniki szeptów', 'kroniki  szeptów', ' Kroniki szeptów ']) {
      assert.deepEqual(titles(listCatalogWorks(repository, { label, sort: 'label' })), [
        'Gamma',
        'Alfa',
        'Beta',
      ]);
    }
  } finally {
    repository.close();
  }
});

test('sort=label without a real label filter falls back to the title order', () => {
  const repository = catalogue();
  try {
    createLabel(repository, { name: 'Cykl' });
    addToLabel(repository, 'Cykl', { workIds: ['c', 'a'] });
    const alphabetical = ['Alfa', 'Beta', 'Delta', 'Gamma'];
    assert.deepEqual(titles(listCatalogWorks(repository, { sort: 'label' })), alphabetical);
    assert.deepEqual(titles(listCatalogWorks(repository, { sort: 'label', label: NO_LABEL })), [
      'Beta',
      'Delta',
    ]);
  } finally {
    repository.close();
  }
});
