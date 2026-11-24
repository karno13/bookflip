import assert from 'node:assert/strict';
import test from 'node:test';

import { keyBytes, pushStateText, pushSupported } from './push.js';
import { pushButtonLabel } from '../views/push-panel.js';

test('the server key becomes the bytes the browser expects', () => {
  const bytes = keyBytes('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4');
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
  assert.deepEqual([...keyBytes('-_8')], [251, 255]);
});

test('state line and button say what is on, off, blocked or impossible', () => {
  assert.match(pushStateText({ supported: false }), /HTTPS \(Tailscale\); na iPhonie po dodaniu strony do ekranu początkowego/);
  assert.match(pushStateText({ supported: true, permission: 'denied', subscribed: false, phones: 0 }), /zablokowane/);
  assert.equal(pushStateText({ supported: true, permission: 'granted', subscribed: true, phones: 1 }), 'Powiadomienia o nowych okazjach są włączone na tym urządzeniu.');
  assert.equal(pushStateText({ supported: true, permission: 'default', subscribed: false, phones: 2 }), 'Powiadomienia o nowych okazjach są wyłączone na tym urządzeniu. Włączone także na 2 innych urządzeniach.');
  assert.match(pushStateText({ supported: true, permission: 'granted', subscribed: true, phones: 2 }), /na 1 innym urządzeniu/);
  assert.equal(pushButtonLabel(true), 'Wyłącz powiadomienia na tym urządzeniu');
  assert.equal(pushSupported({ isSecureContext: false, navigator: { serviceWorker: {} }, PushManager: {}, Notification: {} }), false);
  assert.equal(pushSupported({ isSecureContext: true, navigator: { serviceWorker: {} }, PushManager: {}, Notification: {} }), true);
});
