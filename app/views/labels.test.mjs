import assert from 'node:assert/strict';
import test from 'node:test';

import { labelChipsMarkup, rowLabelMenuMarkup, withLabel, withoutLabel } from './labels.js';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

test('labels: chips on a row, no duplicate whatever the case, removal', () => {
  assert.equal(labelChipsMarkup([], escapeHtml), '');
  assert.match(labelChipsMarkup(['Gaunt', '<x>'], escapeHtml), /<span class="work-label" title="Etykieta">Gaunt<\/span><span class="work-label" title="Etykieta">&#60;x&#62;<\/span>/);
  const labels = ['Gaunt'];
  assert.equal(withLabel(labels, 'gaunt'), labels, 'the same label is not added twice');
  assert.equal(withLabel(labels, '   '), labels);
  assert.deepEqual(withLabel(labels, '  do   sprawdzenia '), ['Gaunt', 'do sprawdzenia']);
  assert.deepEqual(withoutLabel(['Gaunt', 'x'], 'Gaunt'), ['x']);
});

test("the label drop-down of a row: labels not on the book, a new one, the book's labels with ×", () => {
  const menu = rowLabelMenuMarkup(['Gaunt'], ['gaunt', 'Komplet', 'Do sprawdzenia'], escapeHtml);
  assert.doesNotMatch(menu, /<option value="gaunt">/, 'a label the book has is not offered again');
  assert.match(menu, /<option value="Komplet">Komplet<\/option><option value="Do sprawdzenia">/);
  assert.match(menu, /Nowa etykieta…<\/option>/);
  assert.match(menu, /<form class="row-label-new" hidden>/, 'the new-label field waits for its option');
  assert.match(menu, /data-row-label-remove="Gaunt"/);
  const first = rowLabelMenuMarkup([], [], escapeHtml);
  assert.doesNotMatch(first, /<select/, 'no labels yet: straight to the field');
  assert.match(first, /<form class="row-label-new">/);
});
