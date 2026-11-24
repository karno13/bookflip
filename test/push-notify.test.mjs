import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_FAILURES,
  dealMessage,
  pushDeals,
  pushStatus,
  pushTest,
  removePushSubscription,
  savePushSubscription,
  vapidKeys,
  VAPID_SUBJECT,
  DEALS_URL,
} from '../push-notify.mjs';
import { createLocalAppServer } from '../local-app.mjs';
import { viewFromSearch } from '../app/core/view-history.js';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';

const KEYS = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};
const PHONE = { endpoint: 'https://fcm.googleapis.com/fcm/send/phone-1', keys: KEYS };
const ON = { BOOKFLIP_PUSH: '1' };

test('the VAPID key is made once and kept; the subject never carries an e-mail', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    const first = vapidKeys(repository);
    assert.deepEqual(vapidKeys(repository), first);
    assert.equal(pushStatus(repository).publicKey.length, 87);
    assert.equal(VAPID_SUBJECT, 'https://bookflip.invalid', 'no e-mail, no Tailscale name');
    // A tap on the notification opens „Okazje”.
    assert.equal(viewFromSearch(new URL(DEALS_URL, 'https://x').search), 'deals');
  } finally {
    repository.close();
  }
});

test('a subscription is kept once per endpoint; unknown services and bad keys are refused', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    assert.equal(savePushSubscription(repository, PHONE).subscriptions, 1);
    assert.equal(savePushSubscription(repository, PHONE).subscriptions, 1);
    assert.throws(
      () => savePushSubscription(repository, { ...PHONE, endpoint: 'https://evil.example/x' }),
      /UNKNOWN_PUSH_SERVICE/,
    );
    assert.throws(
      () => savePushSubscription(repository, { ...PHONE, keys: { p256dh: 'x', auth: KEYS.auth } }),
      /INVALID_PUSH_KEYS/,
    );
    assert.equal(removePushSubscription(repository, { endpoint: PHONE.endpoint }).subscriptions, 0);
  } finally {
    repository.close();
  }
});

test('one notification per batch of deals: the biggest saving named, the rest counted', () => {
  const deal = (offerId, saving, extra = {}) => ({
    offerId,
    title: 'oferta',
    workTitle: 'Mort',
    source: 'Vinted',
    price: 1500,
    worth: 1500 + saving,
    saving,
    ...extra,
  });
  assert.deepEqual(dealMessage([deal('a', 2000)]), {
    title: 'BookFlip: nowa okazja',
    body: 'Mort — 15 zł (Vinted), warta ok. 35 zł',
    url: '/?view=deals',
    tag: 'bookflip-deal-a',
  });
  const many = dealMessage([
    deal('a', 500),
    deal('b', 3000, { workTitle: 'Legion' }),
    deal('c', 900),
  ]);
  assert.equal(many.title, 'BookFlip: 3 nowe okazje');
  assert.equal(many.body, 'Legion — 15 zł (Vinted), warta ok. 45 zł; i 2 inne');
  assert.equal(many.tag, 'bookflip-deal-b');
});

test('sending: success clears failures, a dropped subscription is deleted, errors count up to the limit', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  try {
    savePushSubscription(repository, PHONE);
    savePushSubscription(repository, { ...PHONE, endpoint: 'https://web.push.apple.com/phone-2' });
    savePushSubscription(repository, {
      ...PHONE,
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/phone-3',
    });
    const statuses = {
      'fcm.googleapis.com': 201,
      'web.push.apple.com': 410,
      'updates.push.services.mozilla.com': 503,
    };
    const posted = [];
    const fetcher = async (url, init) => {
      posted.push({ url, init });
      return { status: statuses[new URL(url).hostname] };
    };
    const deals = [
      {
        offerId: 'a',
        title: 't',
        workTitle: 'Mort',
        source: 'Vinted',
        price: 1000,
        worth: 3000,
        saving: 2000,
      },
    ];
    assert.deepEqual(await pushDeals(repository, deals, { fetcher, env: ON }), {
      sent: 1,
      failed: 1,
      removed: 1,
    });
    assert.equal(posted.length, 3);
    assert.ok(Buffer.isBuffer(posted[0].init.body));
    const rows = repository.database
      .prepare(
        'SELECT endpoint, failures, last_error, last_sent_at FROM push_subscriptions ORDER BY endpoint',
      )
      .all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].failures, 0);
    assert.ok(rows[0].last_sent_at);
    assert.equal(rows[1].failures, 1);
    assert.match(String(rows[1].last_error), /HTTP_503/);
    // A subscription failing MAX_FAILURES times in a row goes.
    repository.database
      .prepare('UPDATE push_subscriptions SET failures=? WHERE endpoint LIKE ?')
      .run(MAX_FAILURES - 1, '%mozilla%');
    assert.deepEqual(await pushTest(repository, { fetcher, env: ON }), {
      sent: 1,
      failed: 0,
      removed: 1,
    });
    // Nothing to send, or sending switched off: no request at all.
    posted.length = 0;
    assert.deepEqual(await pushDeals(repository, [], { fetcher, env: ON }), {
      sent: 0,
      failed: 0,
      removed: 0,
    });
    assert.deepEqual(await pushTest(repository, { fetcher, env: { BOOKFLIP_PUSH: '0' } }), {
      sent: 0,
      failed: 0,
      removed: 0,
    });
    assert.equal(posted.length, 0);
    // A network error never throws out of the sending.
    const report = await pushTest(repository, {
      fetcher: async () => {
        throw new TypeError('offline');
      },
      env: ON,
    });
    assert.deepEqual(report, { sent: 0, failed: 1, removed: 0 });
  } finally {
    repository.close();
  }
});

test('the push routes subscribe and unsubscribe over HTTP', async () => {
  const repository = new SqliteCatalogRepository(':memory:');
  const server = createLocalAppServer({ catalogProvider: () => ({ repository }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(null)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body) =>
      fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base },
        body: JSON.stringify(body),
      });
    const status = await (await fetch(base + '/api/push')).json();
    assert.equal(status.subscriptions, 0);
    assert.equal(status.sending, false, 'tests run with BOOKFLIP_PUSH=0');
    assert.equal((await (await post('/api/push/subscribe', PHONE)).json()).subscriptions, 1);
    const refused = await post('/api/push/subscribe', {
      ...PHONE,
      endpoint: 'https://evil.example/x',
    });
    assert.equal(refused.status, 400);
    assert.equal((await (await post('/api/push/test', {})).json()).sent, 0);
    assert.equal(
      (await (await post('/api/push/unsubscribe', { endpoint: PHONE.endpoint })).json())
        .subscriptions,
      0,
    );
  } finally {
    await new Promise((resolve) => server.close(() => resolve(null)));
    repository.close();
  }
});
