import assert from 'node:assert/strict';
import test from 'node:test';

import { networkFailures } from './network-failures.mjs';

const network = (file) =>
  `test at test\\${file}:173:1\n✖ over HTTP (198 ms)\n  [TypeError]: fetch failed {\n    [cause]: Error: connect EADDRINUSE 127.0.0.1:62392\n`;
const real = (file) =>
  `test at test\\${file}:10:1\n✖ something real (1 ms)\n  AssertionError: Expected values to be strictly equal\n`;
const timeout = (file) =>
  `test at test\\${file}:81:1\n✖ a scheduled scan (30009 ms)\n  'test timed out after 30000ms'\n`;

test('network failures are retried only when nothing else failed', () => {
  assert.deepEqual(networkFailures(''), []);
  assert.deepEqual(networkFailures('✔ all good\nℹ fail 0\n'), []);
  assert.deepEqual(networkFailures(network('a.test.mjs')), ['test/a.test.mjs']);
  assert.deepEqual(networkFailures(network('a.test.mjs') + network('b.test.mjs')), [
    'test/a.test.mjs',
    'test/b.test.mjs',
  ]);
  // A real failure next to a network one: no retry, so the real one cannot be hidden.
  assert.deepEqual(networkFailures(network('a.test.mjs') + real('b.test.mjs')), []);
  assert.deepEqual(networkFailures(real('b.test.mjs')), []);
});

test('a test that timed out is retried like a network failure; next to a real failure it is not', () => {
  assert.deepEqual(networkFailures(timeout('a.test.mjs')), ['test/a.test.mjs']);
  assert.deepEqual(networkFailures(timeout('a.test.mjs') + real('b.test.mjs')), []);
});
