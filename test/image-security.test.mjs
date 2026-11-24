import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fetchCachedImage, fetchImageVariant } from '../offer-images.mjs';
import { publicErrorCode } from '../app-runtime.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

async function withServer(repository, run) {
  const server = createLocalAppServer({ catalogProvider: () => ({ repository }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
  }
}

test('image routes with side effects refuse cross-site requests and keep working for the app', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    for (const [id, image] of [
      ['o1', 'https://ecsmedia.pl/a.webp'],
      ['o2', null],
    ])
      repository.upsertOffer({
        id,
        source: 'Vinted',
        normalizedUrl: `https://example.test/${id}`,
        originalTitle: 'Mort',
        currentPrice: 1000,
        imageUrl: image,
      });
    await withServer(repository, async (base) => {
      const paths = [
        '/api/image?u=' + encodeURIComponent('https://evil.example/a.jpg'),
        '/api/cover?isbn=9788375780000',
        '/api/offers/o1/image',
        '/api/offers/o2/image',
      ];
      for (const path of paths)
        for (const site of ['cross-site', 'same-site']) {
          const response = await fetch(base + path, { headers: { 'sec-fetch-site': site } });
          assert.equal(response.status, 403, `${path} ${site}`);
          assert.deepEqual(await response.json(), { error: 'FORBIDDEN_CROSS_SITE' });
        }
      assert.equal(
        repository.database.prepare("SELECT image_url FROM offers WHERE id='o2'").get().image_url,
        null,
        'a refused request did not read the listing or write the photo',
      );
      // Same-origin (the app's own <img>), a direct visit ('none') and no header all pass.
      for (const headers of [
        { 'sec-fetch-site': 'same-origin' },
        { 'sec-fetch-site': 'none' },
        {},
      ]) {
        const photo = await fetch(base + '/api/offers/o1/image', { headers, redirect: 'manual' });
        assert.equal(photo.status, 302);
        const blocked = await fetch(
          base + '/api/image?u=' + encodeURIComponent('https://evil.example/a.jpg'),
          { headers },
        );
        assert.equal(blocked.status, 400);
        assert.deepEqual(await blocked.json(), { error: 'IMAGE_URL_NOT_ALLOWED' });
        const cover = await fetch(base + '/api/cover?isbn=', { headers });
        assert.equal(cover.status, 200);
        assert.equal(cover.headers.get('x-bookflip-cover'), 'none');
      }
    });
  } finally {
    repository.close();
  }
});

test('only 404 and 410 hide a photo for a day; 429, 5xx and network errors are not cached', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bookflip-img-'));
  try {
    const url = (name) => `https://ecsmedia.pl/${name}.jpg`;
    const missingFile = (name) => {
      const key = createHash('sha256').update(url(name)).digest('hex');
      return join(dir, key.slice(0, 2), key + '.missing');
    };
    const cases = [
      ['n404', () => new Response('', { status: 404 }), 404, true],
      ['n410', () => new Response('', { status: 410 }), 404, true],
      ['html', () => new Response('x', { headers: { 'content-type': 'text/html' } }), 404, true],
      ['n429', () => new Response('', { status: 429 }), 502, false],
      ['n503', () => new Response('', { status: 503 }), 502, false],
      [
        'net',
        () => {
          throw new Error('socket hang up');
        },
        502,
        false,
      ],
    ];
    for (const [name, make, status, cached] of cases) {
      await assert.rejects(
        fetchCachedImage(url(name), { cacheDirectory: dir, fetcher: async () => make() }),
        (error) => error.statusCode === status,
        name,
      );
      assert.equal(await exists(missingFile(name)), cached, name);
    }
    // A transient failure is retried on the next request and then succeeds.
    let calls = 0;
    const flaky = async () =>
      ++calls === 1
        ? new Response('', { status: 503 })
        : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    await assert.rejects(fetchCachedImage(url('flaky'), { cacheDirectory: dir, fetcher: flaky }));
    const image = await fetchCachedImage(url('flaky'), {
      cacheDirectory: dir,
      fetcher: flaky,
      now: () => Date.now() + 3 * 60 * 1000,
    });
    assert.equal(image.body.length, 3);
    assert.equal(calls, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an image body over the limit is aborted while streaming, without reading all of it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bookflip-img-'));
  try {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        if (sent >= 100) return controller.close();
        sent++;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = async () => new Response(stream, { headers: { 'content-type': 'image/jpeg' } });
    await assert.rejects(
      fetchCachedImage('https://ecsmedia.pl/big.jpg', { cacheDirectory: dir, fetcher }),
      (error) => error.statusCode === 413 && error.message === 'IMAGE_TOO_LARGE',
    );
    assert.ok(sent <= 8, `read ${sent} MB of a 100 MB body`);
    assert.ok(cancelled, 'the stream was cancelled');
    // A body within the limit is still stored.
    const small = await fetchCachedImage('https://ecsmedia.pl/small.jpg', {
      cacheDirectory: dir,
      fetcher: async () =>
        new Response(new Uint8Array(1000), { headers: { 'content-type': 'image/jpeg' } }),
    });
    assert.equal(small.body.length, 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('error text outside UPPER_CASE codes is not sent to the client', () => {
  assert.equal(publicErrorCode(Error('IMAGE_NOT_FOUND'), 'X'), 'IMAGE_NOT_FOUND');
  assert.equal(publicErrorCode(Error('connect ECONNREFUSED 10.0.0.1:443'), 'FALLBACK'), 'FALLBACK');
  assert.equal(publicErrorCode(undefined, 'FALLBACK'), 'FALLBACK');
});

test('a transient CDN failure pauses that photo for about 2 minutes, then it is retried', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bookflip-img-'));
  try {
    let clock = 1_000_000;
    const now = () => clock;
    for (const status of [403, 429, 503]) {
      let calls = 0;
      const fetcher = async () => (calls++, new Response('', { status }));
      const url = `https://ecsmedia.pl/pause${status}.jpg`;
      const options = { cacheDirectory: dir, fetcher, now };
      for (let i = 0; i < 3; i++)
        await assert.rejects(
          fetchCachedImage(url, options),
          (error) => error.statusCode === 502 && error.message === 'IMAGE_FETCH_FAILED',
        );
      assert.equal(calls, 1, `${status}: later requests in the window do not reach the CDN`);
      clock += 2 * 60 * 1000 + 1;
      await assert.rejects(fetchCachedImage(url, options));
      assert.equal(calls, 2, `${status}: retried after the window`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a thumbnail failing with 429 does not fetch the original; a missing thumbnail does', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bookflip-img-'));
  try {
    const asked = [];
    const limited = async (url) => (asked.push(url), new Response('', { status: 429 }));
    await assert.rejects(
      fetchImageVariant('https://a.allegroimg.com/original/abc/photo429', {
        size: 'thumb',
        cacheDirectory: dir,
        fetcher: limited,
      }),
      (error) => error.statusCode === 502,
    );
    assert.deepEqual(asked, ['https://a.allegroimg.com/s180/abc/photo429']);

    const askedMissing = [];
    const fetcher = async (url) => {
      askedMissing.push(url);
      return url.includes('/s180/')
        ? new Response('', { status: 404 })
        : new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } });
    };
    const image = await fetchImageVariant('https://a.allegroimg.com/original/abc/photo404', {
      size: 'thumb',
      cacheDirectory: dir,
      fetcher,
    });
    assert.equal(image.body.length, 2);
    assert.equal(askedMissing.length, 2, 'thumbnail first, then the original');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a Content-Length smaller than the real body does not defeat the size limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bookflip-img-'));
  try {
    const fetcher = async () =>
      new Response(new Uint8Array(5 * 1024 * 1024), {
        headers: { 'content-type': 'image/jpeg', 'content-length': '100' },
      });
    await assert.rejects(
      fetchCachedImage('https://ecsmedia.pl/liar.jpg', { cacheDirectory: dir, fetcher }),
      (error) => error.statusCode === 413,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('/api/image answers with an error code only, never raw exception text', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    await withServer(repository, async (base) => {
      for (const u of ['http://127.0.0.1:1/x', 'not a url', '']) {
        const response = await fetch(base + '/api/image?u=' + encodeURIComponent(u));
        assert.ok(response.status >= 400);
        const { error } = await response.json();
        assert.match(error, /^[A-Z][A-Z0-9_]*$/, u);
      }
    });
  } finally {
    repository.close();
  }
});
