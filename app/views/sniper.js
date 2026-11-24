// „Okazje” → Snajper: turns the targeted scan of the newest Vinted listings on and off
// (scan-schedule.mjs, /api/sniper) and lists the deals it announced (deal-alerts.mjs,
// /api/deals/alerts). The live channel sends "deals" when a new one is recorded: the page shows
// a toast, a desktop notification when allowed and the tab is in the background, and a dot on
// „Okazje” in the navigation until the list has been looked at.
import { dateMarkup, safeOfferHref } from '../core/formatters.js';
import { zl } from '../core/valuation.js';

const ALERTS_SHOWN = 5;

/** "co 20 min · ostatnio 21:40 (10 fraz) · następnie 22:00" or why it does not run. Pure (tested). */
export function sniperStatusLabel(status, now = new Date()) {
  if (!status) return '';
  const time = (value) => new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (!status.enabled) return status.targets ? `Wyłączony. Obserwowałby ${status.targets} książek z najlepszym obrotem.` : 'Wyłączony.';
  if (status.schedulerOff) return 'Włączony, ale automatyczne skany są wyłączone w tym uruchomieniu (BOOKFLIP_SCHEDULED_SCANS=0).';
  if (!status.targets) return 'Włączony, ale nie ma jeszcze książek z wiarygodną wyceną do obserwowania.';
  const results = { ok: 'ostatnio', 'source-down': 'Vinted nie odpowiadał', 'no-targets': 'brak celów', cancelled: 'anulowany' };
  const last = status.lastRunAt ? `${results[status.lastResult] || 'błąd'} ${time(status.lastRunAt)} (${status.lastPhrases.length} fraz)` : 'jeszcze nie skanował';
  const next = status.nextRunAt && status.nextRunAt > now.getTime() ? ` · następnie ${time(status.nextRunAt)}` : ' · rusza w ciągu minuty';
  return `Obserwuje ${status.targets} książek, po ${status.batch} na przebieg, co ${status.everyMinutes} min · ${last}${next}${streamLabel(status.lastStream)}`;
}

/** „ · strumień: 87 nowych ogłoszeń książek, 2 z katalogu (Mort Pratchett, Legion)”; empty without a reading. */
export function streamLabel(stream) {
  if (!stream) return '';
  if (stream.error) return ' · strumień nowych ogłoszeń nie odpowiedział';
  const names = stream.phrases.length ? ` (${stream.phrases.slice(0, 3).join(', ')}${stream.phrases.length > 3 ? '…' : ''})` : '';
  return ` · strumień (co 5 min): ${stream.listings} nowych ogłoszeń książek, ${stream.phrases.length} z katalogu${names}`;
}

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const DAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];

/**
 * What the adaptive schedule rests on: 'off' (fixed interval), 'flat' (too little data, every hour
 * as usual) or 'ready' (168 intervals that differ). Pure (tested).
 */
export function inflowState(status) {
  if (!status?.adaptive) return { kind: 'off', text: '' };
  const intervals = status.profile?.intervals;
  const valid = Array.isArray(intervals) && intervals.length === 168;
  if (valid && status.profile.reason === 'coverage')
    return { kind: 'flat', text: 'Za mało skanów w różnych porach — snajper działa jak zwykle. Profil powstanie, gdy skany obejmą co najmniej połowę godzin tygodnia (po kilka skanów w każdej).' };
  if (!valid || !status.profile.enough || intervals.every((value) => value === intervals[0]))
    return { kind: 'flat', text: 'Za mało danych — odstęp jak zwykle. Profil powstanie, gdy katalog obejmie co najmniej 2 tygodnie skanów i 200 ofert.' };
  const days = status.profile.spanDays;
  return { kind: 'ready', text: `Odstęp zależy od godziny: krótszy, gdy zwykle pojawia się dużo ogłoszeń, dłuższy w ciszy. Profil z ${status.profile.offers} ofert z ${days != null ? Math.round(days) : '?'} dni.` };
}

/** 7 × 24 table of intervals in minutes (Monday first; slot 0 is Sunday 00:00). Pure (tested). */
export function inflowGridMarkup(intervals, base) {
  const head = Array.from({ length: 24 }, (_, hour) => `<th scope="col">${hour}</th>`).join('');
  const rows = DAYS.map((day, row) => {
    const slotDay = (row + 1) % 7;
    const cells = Array.from({ length: 24 }, (_, hour) => {
      const minutes = Number(intervals[slotDay * 24 + hour]);
      const level = minutes < base ? 'fast' : minutes > base ? 'slow' : 'base';
      return `<td class="inflow-${level}" title="${DAY_NAMES[row]} ${hour}:00 — co ${minutes} min">${minutes}</td>`;
    }).join('');
    return `<tr><th scope="row">${day}</th>${cells}</tr>`;
  }).join('');
  return `<table class="inflow-grid"><caption class="sr-only">Odstęp snajpera w minutach według dnia tygodnia i godziny</caption><thead><tr><td></td>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** One announced deal. Pure (tested). */
export function alertMarkup(item, { escapeHtml, money, now = new Date() }) {
  const href = safeOfferHref(item.url);
  const state = item.gone ? '<b class="sniper-gone">już niedostępna</b>' : item.currentPrice && item.currentPrice !== item.price ? `teraz ${money(item.currentPrice)}` : '';
  return `<li class="sniper-alert${item.seen ? '' : ' is-new'}${item.gone ? ' is-gone' : ''}">${item.seen ? '' : '<span class="sniper-new">Nowa</span>'}<button type="button" class="link-button" data-alert-open="${escapeHtml(item.offerId)}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</button><span class="sniper-alert-numbers"><strong>−${zl(item.saving)}</strong> za ${money(item.price)} · warta ~${zl(item.worth)}${item.chance != null ? ` · ${Math.round(item.chance * 100)}% w 30 dni` : ''}${state ? ' · ' + state : ''}</span><small>${escapeHtml(item.source)} · ${dateMarkup(item.alertedAt, now)}${href && href !== '#' ? ` · <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">ogłoszenie ↗</a>` : ''}</small></li>`;
}

export function installSniper({ $, json, escapeHtml, money, toast, openOfferDrawer, isVisible }) {
  const panel = $('#sniperPanel');
  if (!panel) return { refresh: async () => {}, onLive() {} };
  const write = (url, method, body) =>
    json(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let status = null;
  let alerts = { unseen: 0, items: [] };
  let lastUnseen = null;
  let showAll = false;

  function markNav(unseen) {
    document.querySelectorAll('[data-view="deals"]').forEach((item) => item.classList.toggle('has-news', unseen > 0));
  }
  function render() {
    $('#sniperEnabled').checked = Boolean(status?.enabled);
    if (status) $('#sniperEvery').value = String(status.everyMinutes);
    $('#sniperStatus').textContent = sniperStatusLabel(status);
    $('#sniperAdaptive').checked = Boolean(status?.adaptive);
    const inflow = inflowState(status);
    $('#sniperInflow').hidden = inflow.kind === 'off';
    $('#sniperInflowNote').textContent = inflow.text;
    $('#sniperInflowGrid').hidden = inflow.kind !== 'ready';
    $('#sniperInflowGrid').innerHTML = inflow.kind === 'ready' ? inflowGridMarkup(status.profile.intervals, status.everyMinutes) : '';
    const list = $('#sniperAlerts');
    // The new ones and the last few; the rest on request, so the deals below stay in sight.
    const shown = showAll ? alerts.items : alerts.items.filter((item, index) => !item.seen || index < ALERTS_SHOWN);
    const more = alerts.items.length - shown.length;
    list.innerHTML = alerts.items.length
      ? shown.map((item) => alertMarkup(item, { escapeHtml, money })).join('') + (more > 0 ? `<li><button type="button" class="link-button" data-alerts-all>Pokaż wszystkie (${alerts.items.length})</button></li>` : '')
      : '<li class="inline-note">Jeszcze nic. Nowa okazja pojawi się tu w kilka minut po wystawieniu, gdy snajper jest włączony.</li>';
    list.querySelectorAll('[data-alert-open]').forEach((button) => button.addEventListener('click', () => openOfferDrawer(button.dataset.alertOpen)));
    list.querySelector('[data-alerts-all]')?.addEventListener('click', () => {
      showAll = true;
      render();
    });
    markNav(alerts.unseen);
  }
  async function refresh({ markSeen = isVisible() } = {}) {
    try {
      [status, alerts] = await Promise.all([json('/api/sniper'), json('/api/deals/alerts')]);
    } catch {
      $('#sniperStatus').textContent = 'Nie udało się odczytać stanu snajpera.';
      return;
    }
    lastUnseen = alerts.unseen;
    render();
    // Looking at the list is seeing it: the "Nowa" marks stay for this visit, the dot goes.
    if (markSeen && alerts.unseen) {
      try {
        const seen = await write('/api/deals/alerts/seen', 'POST', {});
        lastUnseen = seen.unseen;
        markNav(seen.unseen);
      } catch {}
    }
  }
  async function save() {
    const enabled = $('#sniperEnabled').checked;
    // Asked when the owner turns it on (a click): notifications when the tab is in the background.
    if (enabled && globalThis.Notification?.permission === 'default') void Notification.requestPermission().catch(() => {});
    try {
      status = await write('/api/sniper', 'PUT', { enabled, everyMinutes: Number($('#sniperEvery').value), adaptive: $('#sniperAdaptive').checked });
      render();
      toast(enabled ? 'Snajper włączony' : 'Snajper wyłączony');
    } catch {
      toast('Nie udało się zapisać ustawień snajpera');
      void refresh({ markSeen: false });
    }
  }
  /** The live channel says how many alerts are unseen; more than before = a new deal. */
  async function onLive(data) {
    const unseen = Number(data?.unseen ?? 0);
    const grew = lastUnseen != null && unseen > lastUnseen;
    lastUnseen = unseen;
    markNav(unseen);
    if (!grew) return;
    await refresh({ markSeen: isVisible() && !document.hidden });
    const top = alerts.items[0];
    if (!top) return;
    const text = `${top.title} — −${zl(top.saving)} za ${money(top.price)}`;
    toast('Nowa okazja: ' + text);
    if (document.hidden && globalThis.Notification?.permission === 'granted') {
      try {
        new Notification('BookFlip: nowa okazja', { body: text, tag: 'bookflip-deal-' + top.offerId });
      } catch {}
    }
  }
  $('#sniperEnabled').addEventListener('change', save);
  $('#sniperEvery').addEventListener('change', save);
  $('#sniperAdaptive').addEventListener('change', save);
  void refresh({ markSeen: false });
  return { refresh, onLive };
}
