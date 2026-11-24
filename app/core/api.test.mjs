import test from 'node:test';
import assert from 'node:assert/strict';
import { json } from './api.js';

test('JSON API returns parsed successful payload', async () => {
  assert.deepEqual(await json('/example', undefined, async () => ({
    ok: true, json: async () => ({ value: 5 }),
  })), { value: 5 });
});
test('JSON API exposes a server error code', async () => {
  await assert.rejects(json('/example', undefined, async () => ({
    ok: false, status: 503, json: async () => ({ error: 'CATALOG_DISABLED' }),
  })), /CATALOG_DISABLED/);
});
test('JSON API reports the HTTP code when the body is not JSON', async () => {
  const broken = () => Promise.reject(new SyntaxError('Unexpected end of JSON input'));
  await assert.rejects(
    json('/example', undefined, async () => ({ ok: false, status: 502, json: broken })),
    /HTTP_502/,
  );
  await assert.rejects(
    json('/example', undefined, async () => ({ ok: true, status: 200, json: broken })),
    /INVALID_RESPONSE/,
  );
});
test('JSON API passes a JSON null reply through', async () => {
  assert.equal(await json('/example', undefined, async () => ({ ok: true, json: async () => null })), null);
});
