// „Powiadomienia na telefonie”: subscribe this browser to push messages about new deals through the
// service worker (app/sw.js); the server keeps the subscription (push-notify.mjs). Thin browser glue
// around pure helpers; works only on a secure page (HTTPS through Tailscale, or this computer).

/** The browser can receive push messages here. */
export function pushSupported(win = globalThis) {
  return Boolean(win.isSecureContext && win.navigator?.serviceWorker && win.PushManager && win.Notification);
}

/** base64url text → bytes (the server's key as applicationServerKey). */
export function keyBytes(text) {
  const base64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** One line about the state: on here, off, blocked, or not possible on this page. */
export function pushStateText({ supported, permission, subscribed, phones }) {
  if (!supported) return 'Powiadomienia działają na telefonie przez adres HTTPS (Tailscale); na iPhonie po dodaniu strony do ekranu początkowego.';
  if (permission === 'denied') return 'Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony.';
  const others = phones - (subscribed ? 1 : 0);
  const rest = others > 0 ? ` Włączone także na ${others} ${others === 1 ? 'innym urządzeniu' : 'innych urządzeniach'}.` : '';
  return (subscribed ? 'Powiadomienia o nowych okazjach są włączone na tym urządzeniu.' : 'Powiadomienia o nowych okazjach są wyłączone na tym urządzeniu.') + rest;
}

async function registration(win) {
  return win.navigator.serviceWorker.ready;
}

/** The current subscription of this browser, or null. */
export async function currentSubscription(win = globalThis) {
  if (!pushSupported(win)) return null;
  return (await registration(win)).pushManager.getSubscription();
}

/** Asks for permission, subscribes and tells the server. Returns the server's status. */
export async function enablePush(json, win = globalThis) {
  const permission = await win.Notification.requestPermission();
  if (permission !== 'granted') throw Object.assign(Error('PUSH_PERMISSION'), { permission });
  const status = await json('/api/push');
  const reg = await registration(win);
  const subscription = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.publicKey) }));
  return json('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
}

/** Unsubscribes this browser and tells the server. */
export async function disablePush(json, win = globalThis) {
  const subscription = await currentSubscription(win);
  if (!subscription) return json('/api/push');
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => false);
  return json('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) });
}
