// „Powiadomienia na telefonie” in the sniper panel of „Okazje”: switch push messages about new
// deals on or off for this device, and send a test one (app/core/push.js, push-notify.mjs).
import { currentSubscription, disablePush, enablePush, pushStateText, pushSupported } from '../core/push.js';

/** Labels of the switch button for a state. */
export function pushButtonLabel(subscribed) {
  return subscribed ? 'Wyłącz powiadomienia na tym urządzeniu' : 'Włącz powiadomienia na tym urządzeniu';
}

export function installPushPanel({ $, json, toast = () => {} }) {
  const state = $('#pushState');
  const toggle = $('#pushToggle');
  const tester = $('#pushTest');
  if (!state || !toggle) return { refresh: async () => {} };
  let subscribed = false;
  let busy = false;
  const render = (status) => {
    const supported = pushSupported();
    const permission = globalThis.Notification?.permission ?? 'default';
    state.textContent = pushStateText({ supported, permission, subscribed, phones: Number(status?.subscriptions ?? 0) });
    toggle.hidden = !supported || permission === 'denied';
    toggle.textContent = pushButtonLabel(subscribed);
    toggle.setAttribute('aria-pressed', String(subscribed));
    if (tester) tester.hidden = !(Number(status?.subscriptions ?? 0) > 0);
  };
  async function refresh() {
    try {
      subscribed = Boolean(await currentSubscription());
      render(await json('/api/push'));
    } catch {
      render(null);
    }
  }
  toggle.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    toggle.disabled = true;
    try {
      const status = subscribed ? await disablePush(json) : await enablePush(json);
      subscribed = !subscribed;
      render(status);
      toast(subscribed ? 'Powiadomienia o nowych okazjach włączone na tym urządzeniu.' : 'Powiadomienia wyłączone na tym urządzeniu.');
    } catch (error) {
      toast(error?.message === 'PUSH_PERMISSION' ? 'Bez zgody przeglądarki powiadomienia nie przyjdą.' : 'Nie udało się zmienić powiadomień: ' + (error?.message || 'błąd'));
      await refresh();
    } finally {
      busy = false;
      toggle.disabled = false;
    }
  });
  tester?.addEventListener('click', async () => {
    tester.disabled = true;
    try {
      const report = await json('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      toast(report.sent ? `Wysłano próbne powiadomienie (${report.sent}).` : 'Nie udało się wysłać próbnego powiadomienia — sprawdź połączenie komputera z internetem.');
      await refresh();
    } catch (error) {
      toast('Nie udało się wysłać: ' + (error?.message || 'błąd'));
    } finally {
      tester.disabled = false;
    }
  });
  return { refresh };
}
