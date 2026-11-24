// @ts-check
// Serve only known public app-shell files, first-party browser JavaScript modules and the
// stylesheets in app/styles/. Paths are resolved relative to app/ and never accept a user-selected
// directory.
// sw.js: the service worker must be served from the root to cover the whole app; the manifest
// lets a phone add the app to its home screen (iPhone: needed for push notifications).
const rootFiles = new Set([
  '/index.html',
  '/app.js',
  '/frontend-utils.js',
  '/scan-stream.js',
  '/sw.js',
  '/manifest.webmanifest',
]);

export function publicAssetPath(pathname) {
  const path = pathname === '/' ? '/index.html' : pathname;
  if (rootFiles.has(path)) return path.slice(1);
  if (/^\/(?:views|core)\/[a-z0-9-]+\.js$/.test(path)) return path.slice(1);
  if (/^\/styles\/[a-z0-9-]+\.css$/.test(path)) return path.slice(1);
  return null;
}
