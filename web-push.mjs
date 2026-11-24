// @ts-check
// Web Push without a library: a message encrypted for one browser (RFC 8291, "aes128gcm") and the
// server's signed identity (VAPID, RFC 8292), sent to the browser vendor's push service. Only
// node:crypto. The push service sees an encrypted blob and our public key, never the text.
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';

/** @param {Buffer|Uint8Array} bytes */
export const base64url = (bytes) => Buffer.from(bytes).toString('base64url');
/** @param {string} text */
export const fromBase64url = (text) => Buffer.from(String(text), 'base64url');

/** HMAC-SHA-256. @param {Buffer} key @param {Buffer} data */
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** Push services a subscription may point at (Chrome/Android, Firefox, Safari/iOS, Edge/Windows). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

/** An https endpoint of a known push service (the server posts only there). @param {string} endpoint */
export function knownPushEndpoint(endpoint) {
  try {
    const url = new URL(String(endpoint));
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/**
 * The body of one push message for a browser (RFC 8291 §3–4, a single record).
 * @param {{ p256dh: string, auth: string }} keys the subscription's keys (base64url)
 * @param {string|Buffer} payload
 * @param {{ salt?: Buffer, serverPrivateKey?: Buffer, recordSize?: number }} [fixed] for the RFC test vector
 */
export function encryptPayload(keys, payload, fixed = {}) {
  const userPublic = fromBase64url(keys.p256dh);
  const authSecret = fromBase64url(keys.auth);
  if (userPublic.length !== 65 || userPublic[0] !== 4) throw Error('INVALID_PUSH_KEY');
  if (authSecret.length !== 16) throw Error('INVALID_PUSH_AUTH');
  const server = createECDH('prime256v1');
  if (fixed.serverPrivateKey) server.setPrivateKey(fixed.serverPrivateKey);
  else server.generateKeys();
  const serverPublic = server.getPublicKey();
  const shared = server.computeSecret(userPublic);
  // IKM = HKDF(auth, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    userPublic,
    serverPublic,
    Buffer.from([1]),
  ]);
  const ikm = hmac(prkKey, keyInfo);
  const salt = fixed.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  // One record: the text, then the 0x02 delimiter of the last record (no padding).
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const recordSize = fixed.recordSize ?? 4096;
  if (plain.length + 16 > recordSize) throw Error('PUSH_PAYLOAD_TOO_LONG');
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, sealed]);
}

/** A new VAPID key pair as JWK (kept in app_preferences; the public part goes to the browser). */
export function generateVapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return /** @type {{ kty: string, crv: string, x: string, y: string, d: string }} */ (
    privateKey.export({ format: 'jwk' })
  );
}

/** The public key as the browser's applicationServerKey: 0x04 || x || y, base64url. @param {{ x: string, y: string }} jwk */
export function vapidPublicKey(jwk) {
  return base64url(Buffer.concat([Buffer.from([4]), fromBase64url(jwk.x), fromBase64url(jwk.y)]));
}

/**
 * The Authorization header value for one push service (RFC 8292): a JWT signed with ES256.
 * @param {string} endpoint @param {any} jwk @param {string} subject mailto: or https: contact
 */
export function vapidAuthorization(endpoint, jwk, subject, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = base64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64url(
    Buffer.from(
      JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }),
    ),
  );
  const key = createPrivateKey({ key: jwk, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${header}.${claims}.${base64url(signature)}, k=${vapidPublicKey(jwk)}`;
}

/**
 * Sends one message. Returns { ok, status, gone } — gone: the browser dropped the subscription
 * (404/410), which should then be deleted.
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {object} message JSON-able
 * @param {{ jwk: any, subject: string, fetcher?: typeof fetch, ttl?: number }} options
 */
export async function sendPush(
  subscription,
  message,
  { jwk, subject, fetcher = fetch, ttl = 86400 },
) {
  if (!knownPushEndpoint(subscription.endpoint)) throw Error('UNKNOWN_PUSH_SERVICE');
  const body = encryptPayload(subscription.keys, JSON.stringify(message));
  const response = await fetcher(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint, jwk, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'high',
    },
    body,
    // The allow-list holds for the address posted to: a redirect elsewhere is an error.
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}
