/* global self, caches */
// Service worker: keeps a copy of the app's own files (page, scripts, styles) so the page, and with
// it Łowca and its offline pack, opens where there is no connection (a cellar shop, a fair hall;
// the phone reaches the computer through Tailscale, which needs the internet).
// Network first: with a connection every file comes fresh from the computer and the copy is
// refreshed. The copy is used when the request fails, or when it hangs longer than SLOW_MS and a
// copy exists (one bar of signal). API answers, images and anything else are never kept.
const CACHE = 'bookflip-shell-v2';
const SLOW_MS = 5000;
const KEPT = new Set(['document', 'script', 'style']);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  ),
);

/** The kept copy of a request; any address of the app opens its page (views live in index.html). */
async function keptCopy(request) {
  const kept = await caches.match(request, { ignoreSearch: true });
  if (kept || request.mode !== 'navigate') return kept;
  return (await caches.match('/')) || (await caches.match('/index.html'));
}

/** A whole, plain answer of the app itself (not an error page, a redirect or a part of a file). */
const keepable = (response) => response.status === 200 && response.type === 'basic' && !response.headers.has('Content-Range');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !KEPT.has(request.destination)) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const network = fetch(request).then((response) => {
    if (keepable(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  });
  network.catch(() => {}); // answered from the copy: a later failure needs no handler
  const slow = new Promise((resolve) => setTimeout(resolve, SLOW_MS)).then(() => keptCopy(request));
  event.respondWith(
    (async () => {
      try {
        // A hung connection: after SLOW_MS the copy answers, if there is one; else keep waiting.
        const first = await Promise.race([network, slow]);
        return first || (await network);
      } catch {
        return (await keptCopy(request)) || Response.error();
      }
    })(),
  );
});

// „Powiadomienia na telefonie” (push-notify.mjs): a new deal while the page is closed.
self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const title = typeof message.title === 'string' ? message.title : 'BookFlip';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === 'string' ? message.body : 'Nowa okazja',
      tag: typeof message.tag === 'string' ? message.tag : 'bookflip',
      // Only an address of the app itself ("//host" would be another site).
      data: { url: typeof message.url === 'string' && /^\/(?!\/)/.test(message.url) ? message.url : '/' },
    }),
  );
});

// A tap opens the app (an open tab is focused and sent to the address).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      // navigate() is missing in some browsers and refused for a window this worker does not
      // control: then a new window opens at the address.
      if (open?.navigate)
        return open
          .focus()
          .then((client) => client.navigate(url))
          .catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});
