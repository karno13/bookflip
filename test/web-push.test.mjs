import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import test from 'node:test';

import {
  base64url,
  encryptPayload,
  fromBase64url,
  generateVapidKeys,
  knownPushEndpoint,
  sendPush,
  vapidAuthorization,
  vapidPublicKey,
} from '../web-push.mjs';

// RFC 8291, Appendix A: the published example, byte for byte.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('encryption matches the RFC 8291 example exactly', () => {
  const body = encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.authSecret }, RFC.plaintext, {
    salt: fromBase64url(RFC.salt),
    serverPrivateKey: fromBase64url(RFC.asPrivate),
  });
  assert.equal(base64url(body), RFC.body);
});

test('bad keys and an oversized message are refused', () => {
  assert.throws(
    () => encryptPayload({ p256dh: 'AAAA', auth: RFC.authSecret }, 'x'),
    /INVALID_PUSH_KEY/,
  );
  assert.throws(
    () => encryptPayload({ p256dh: RFC.uaPublic, auth: 'AAAA' }, 'x'),
    /INVALID_PUSH_AUTH/,
  );
  assert.throws(
    () => encryptPayload({ p256dh: RFC.uaPublic, auth: RFC.authSecret }, 'x'.repeat(5000)),
    /PUSH_PAYLOAD_TOO_LONG/,
  );
});

test('only https endpoints of known push services are accepted', () => {
  assert.equal(knownPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(knownPushEndpoint('https://web.push.apple.com/QGuQ'), true);
  assert.equal(knownPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'), true);
  assert.equal(knownPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'), true);
  assert.equal(knownPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'), false);
  assert.equal(knownPushEndpoint('https://evil.example/fcm.googleapis.com'), false);
  assert.equal(knownPushEndpoint('https://push.apple.com.evil.example/x'), false);
  assert.equal(knownPushEndpoint('not a url'), false);
});

test('the VAPID header is an ES256 JWT for the push service origin, verifiable with the public key', () => {
  const jwk = generateVapidKeys();
  const header = vapidAuthorization(
    'https://fcm.googleapis.com/fcm/send/abc',
    jwk,
    'https://pc.example.ts.net',
    Date.parse('2026-11-23T12:00:00Z'),
  );
  const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  assert.ok(match);
  const [, head, claims, signature, key] = match;
  assert.deepEqual(JSON.parse(fromBase64url(head).toString()), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(fromBase64url(claims).toString()), {
    aud: 'https://fcm.googleapis.com',
    exp: Date.parse('2026-11-24T00:00:00Z') / 1000,
    sub: 'https://pc.example.ts.net',
  });
  assert.equal(key, vapidPublicKey(jwk));
  assert.equal(fromBase64url(key).length, 65);
  const publicKey = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
    format: 'jwk',
  });
  assert.equal(
    verify(
      'sha256',
      Buffer.from(`${head}.${claims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      fromBase64url(signature),
    ),
    true,
  );
});

test('sendPush posts the encrypted body with the push headers; 410 means the subscription is gone', async () => {
  const jwk = generateVapidKeys();
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return { status: calls.length === 1 ? 201 : 410 };
  };
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: RFC.uaPublic, auth: RFC.authSecret },
  };
  assert.deepEqual(
    await sendPush(subscription, { title: 'x' }, { jwk, subject: 'mailto:a@localhost', fetcher }),
    { ok: true, status: 201, gone: false },
  );
  assert.deepEqual(
    await sendPush(subscription, { title: 'x' }, { jwk, subject: 'mailto:a@localhost', fetcher }),
    { ok: false, status: 410, gone: true },
  );
  const { init } = calls[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
  assert.match(init.headers.Authorization, /^vapid t=/);
  assert.equal(init.body.readUInt32BE(16), 4096);
  await assert.rejects(
    sendPush(
      { ...subscription, endpoint: 'https://evil.example/x' },
      {},
      { jwk, subject: 's', fetcher },
    ),
    /UNKNOWN_PUSH_SERVICE/,
  );
  assert.equal(calls.length, 2, 'nothing is posted to an unknown address');
});
