// @ts-check
// „Powiadomienia na telefonie”: a phone that switched them on gets a push message when new deals
// are announced (deal-alerts.mjs), even with the page closed. The phone's browser subscribes
// through its service worker (app/sw.js); its subscription is kept in push_subscriptions (migration
// 151). Each message is encrypted for that phone (web-push.mjs) and goes to the browser vendor's
// push service, which cannot read it. Off unless the owner switches it on; BOOKFLIP_PUSH=0 stops
// all sending.
import { generateVapidKeys, knownPushEndpoint, sendPush, vapidPublicKey } from './web-push.mjs';

const VAPID_KEY = 'push_vapid_v1';
/** A subscription that failed this many times in a row is dropped. */
export const MAX_FAILURES = 10;

/** @param {string} code @param {number} [statusCode] */
const fail = (code, statusCode = 400) => {
  throw Object.assign(Error(code), { statusCode });
};

/** The server's VAPID key pair (JWK), made once and kept in app_preferences. @param {{ database: any }} repository */
export function vapidKeys(repository, { now = () => new Date() } = {}) {
  const database = repository.database;
  const row = database.prepare('SELECT value_json FROM app_preferences WHERE key=?').get(VAPID_KEY);
  if (row) return JSON.parse(String(row.value_json));
  const jwk = generateVapidKeys();
  database
    .prepare(
      'INSERT INTO app_preferences(key, value_json, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING',
    )
    .run(VAPID_KEY, JSON.stringify(jwk), now().toISOString());
  // Another request may have stored its key first: use whichever is stored.
  return JSON.parse(
    String(
      database.prepare('SELECT value_json FROM app_preferences WHERE key=?').get(VAPID_KEY)
        .value_json,
    ),
  );
}

/**
 * Contact the push services see (RFC 8292 "sub"). Fixed and neutral on purpose: neither the owner's
 * e-mail nor the computer's Tailscale name leaves the computer. (Not checked against a live service.)
 */
export const VAPID_SUBJECT = 'https://bookflip.invalid';
/** "Okazje": the app picks its view from ?view= (app/core/view-history.js). */
export const DEALS_URL = '/?view=deals';

/** What the phone needs to subscribe, and how many phones are subscribed. @param {{ database: any }} repository */
export function pushStatus(repository) {
  const count = repository.database.prepare('SELECT count(*) AS n FROM push_subscriptions').get();
  return {
    publicKey: vapidPublicKey(vapidKeys(repository)),
    subscriptions: Number(count?.n ?? 0),
    sending: process.env.BOOKFLIP_PUSH !== '0',
  };
}

/**
 * Keeps a browser's subscription (PushSubscription.toJSON() of the page).
 * @param {{ database: any }} repository @param {any} input
 */
export function savePushSubscription(repository, input, { now = () => new Date() } = {}) {
  const endpoint = String(input?.endpoint ?? '');
  const p256dh = String(input?.keys?.p256dh ?? '');
  const auth = String(input?.keys?.auth ?? '');
  if (!knownPushEndpoint(endpoint) || endpoint.length > 2000) fail('UNKNOWN_PUSH_SERVICE');
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth))
    fail('INVALID_PUSH_KEYS');
  repository.database
    .prepare(
      `INSERT INTO push_subscriptions(endpoint, p256dh, auth, created_at) VALUES (?,?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, failures=0, last_error=NULL`,
    )
    .run(endpoint, p256dh, auth, now().toISOString());
  return pushStatus(repository);
}

/** @param {{ database: any }} repository @param {any} input */
export function removePushSubscription(repository, input) {
  repository.database
    .prepare('DELETE FROM push_subscriptions WHERE endpoint=?')
    .run(String(input?.endpoint ?? ''));
  return pushStatus(repository);
}

const zl = (/** @type {number} */ grosze) => `${Math.round(grosze / 100)} zł`;

/**
 * One notification for a batch of new deals: the biggest saving first, the rest counted.
 * @param {{ offerId: string, title: string, workTitle?: string, source: string, price: number, worth: number, saving: number }[]} deals
 */
export function dealMessage(deals) {
  const sorted = [...deals].sort((a, b) => b.saving - a.saving);
  const top = sorted[0];
  const name = String(top.workTitle || top.title || 'Książka').slice(0, 80);
  const more = sorted.length - 1;
  return {
    title: sorted.length === 1 ? 'BookFlip: nowa okazja' : `BookFlip: ${sorted.length} nowe okazje`,
    body:
      `${name} — ${zl(top.price)} (${top.source}), warta ok. ${zl(top.worth)}` +
      (more ? `; i ${more} ${more === 1 ? 'inna' : 'inne'}` : ''),
    url: DEALS_URL,
    tag: `bookflip-deal-${top.offerId}`,
  };
}

/**
 * Sends a message to every subscribed phone. A subscription the browser dropped (404/410) or one
 * failing MAX_FAILURES times in a row is deleted. Never throws: returns { sent, failed, removed }.
 * @param {{ database: any }} repository @param {object} message
 * @param {{ fetcher?: typeof fetch, now?: () => Date, env?: Record<string, string|undefined> }} [options]
 */
export async function pushToAll(
  repository,
  message,
  { fetcher = fetch, now = () => new Date(), env = process.env } = {},
) {
  const report = { sent: 0, failed: 0, removed: 0 };
  if (env.BOOKFLIP_PUSH === '0') return report;
  const database = repository.database;
  const subscriptions = database
    .prepare('SELECT endpoint, p256dh, auth, failures FROM push_subscriptions')
    .all();
  if (!subscriptions.length) return report;
  const jwk = vapidKeys(repository);
  const subject = VAPID_SUBJECT;
  // All phones at once: one dead subscription (15 s timeout) does not hold up the others.
  await Promise.all(
    subscriptions.map(async (row) => {
      const endpoint = String(row.endpoint);
      let outcome;
      try {
        outcome = await sendPush(
          { endpoint, keys: { p256dh: String(row.p256dh), auth: String(row.auth) } },
          message,
          { jwk, subject, fetcher },
        );
      } catch (error) {
        outcome = {
          ok: false,
          status: 0,
          gone: false,
          error: String(/** @type {any} */ (error)?.name || 'ERROR'),
        };
      }
      const at = now().toISOString();
      if (outcome.ok) {
        report.sent++;
        database
          .prepare(
            'UPDATE push_subscriptions SET last_sent_at=?, failures=0, last_error=NULL WHERE endpoint=?',
          )
          .run(at, endpoint);
      } else if (outcome.gone || Number(row.failures) + 1 >= MAX_FAILURES) {
        report.removed++;
        database.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint);
      } else {
        report.failed++;
        database
          .prepare(
            'UPDATE push_subscriptions SET failures=failures+1, last_error=? WHERE endpoint=?',
          )
          .run(`${at} ${'error' in outcome ? outcome.error : 'HTTP_' + outcome.status}`, endpoint);
      }
    }),
  );
  return report;
}

/** New deals just announced → one push to every phone (no-op without subscriptions). */
export function pushDeals(repository, deals, options = {}) {
  return deals.length
    ? pushToAll(repository, dealMessage(deals), options)
    : Promise.resolve({ sent: 0, failed: 0, removed: 0 });
}

/** „Wyślij próbne”: a message to check that the phone receives them. */
export function pushTest(repository, options = {}) {
  return pushToAll(
    repository,
    {
      title: 'BookFlip',
      body: 'Powiadomienia działają: tak przyjdzie wiadomość o nowej okazji.',
      url: DEALS_URL,
      tag: 'bookflip-test',
    },
    options,
  );
}
