import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { readPart, writeEntries } from './snapshot-store.mjs';

test('entries round-trip through the streamed format, also many and large', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-store-'));
  try {
    const entries = Array.from({ length: 2000 }, (_, i) => [
      `state-${i}`,
      [['body>div', 'ünï "q"\nline', i, ['x'.repeat(500)]]],
    ]);
    await writeEntries(join(dir, 'states.ndjson.gz'), entries);
    assert.deepEqual(await readPart(dir, 'states'), Object.fromEntries(entries));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the old single-file format is still read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-store-'));
  try {
    await writeFile(join(dir, 'styles.json.gz'), gzipSync(JSON.stringify({ a: 'color:red' })));
    assert.deepEqual(await readPart(dir, 'styles'), { a: 'color:red' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
