import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

test('a JSON body that is not an object is a 400, never a 500', async () => {
  const { createLocalAppServer } = await import('../local-app.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const body of ['null', '[]', '5', '"text"']) {
      const response = await fetch(`${base}/api/identification-jobs/x/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body,
      });
      assert.equal(response.status, 400, body);
      assert.equal((await response.json()).error, 'JSON_OBJECT_REQUIRED', body);
    }
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repo.close();
  }
});

test('a bulk approval of 400 items is not refused as too large', async () => {
  const { createLocalAppServer } = await import('../local-app.mjs');
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const items = Array.from({ length: 400 }, (_, i) => ({
      jobId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      editionId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    }));
    const post = (path, body) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify(body),
      });
    assert.notEqual((await post('/api/review-batches/quick/apply', { items })).status, 413);
    assert.notEqual((await post('/api/identification-jobs/sure-apply', { items })).status, 413);
    // Other routes keep the small limit.
    const big = { text: 'x'.repeat(40_000) };
    assert.equal((await post('/api/identification-jobs/x/decision', big)).status, 413);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repo.close();
  }
});

test('a request that announces a body and never sends it does not block later scans', async () => {
  const { createLocalAppServer } = await import('../local-app.mjs');
  const { connect } = await import('node:net');
  const repo = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository: repo }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const stalled = connect(port, '127.0.0.1');
  try {
    stalled.write(
      `POST /api/search HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${base}\r\n` +
        'Content-Type: application/json\r\nContent-Length: 50\r\n\r\n{',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    // An invalid search is a 400 of its own; it must not be "already running".
    const response = await fetch(`${base}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({}),
    });
    assert.notEqual(response.status, 409);
  } finally {
    stalled.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve(null)));
    repo.close();
  }
});
