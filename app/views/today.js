// "Dziś" — the start view: what changed since the previous visit, what waits for a decision, which
// sources work, the last and the next scan. Every tile opens the list it counts (same filters as
// the count, from /api/today). Scans run on a schedule; the scan form is its own view.
import { visitBaseline } from './since-last-visit.js';
import { money } from '../core/formatters.js';
import { installPulse } from './pulse.js';

const plural = (n, one, few, many) =>
  n === 1 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many;

/** "dziś 20:10", "wczoraj 08:16", "jutro 07:16" or "11.11, 20:10". */
export function whenLabel(value, now = new Date()) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = (time) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((day(date) - day(now)) / 86_400_000);
  const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return 'dziś ' + time;
  if (days === -1) return 'wczoraj ' + time;
  if (days === 1) return 'jutro ' + time;
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' }) + ', ' + time;
}

/** One sentence per source state, e.g. "nie działa od 11.11, 09:30 — serwis żąda CAPTCHA". */
export function sourceLine(row, now = new Date()) {
  if (row.state === 'ok') return row.lastSuccessAt ? 'działa · ostatnio ' + whenLabel(row.lastSuccessAt, now) : 'działa';
  if (row.state === 'unknown') return 'jeszcze nie sprawdzany';
  if (row.state === 'no_access') return row.reason || 'brak legalnego dostępu';
  const since = row.downSince ? whenLabel(row.downSince, now) : '';
  const head = row.state === 'never' ? 'nigdy nie zadziałał' + (since ? ' (próby od ' + since + ')' : '') : 'nie działa' + (since ? ' od ' + since : '');
  return head + (row.reason ? ' — ' + row.reason : '');
}

const pl = (n) => String(n).replace('.', ',');
const shortDay = (day) => (day ? day.slice(8, 10) + '.' + day.slice(5, 7) : '');

/**
 * The four measures under the tiles (from /api/today `measures`, computed in SQL): value, what it
 * is out of, and the trend against the oldest snapshot of the last week. `better` says which way is
 * good (the age of the oldest decision should fall), so the trend can be coloured honestly.
 * Pure (tested).
 */
export function measureCards(measures = []) {
  const meta = {
    recognition: { label: 'Rozpoznane automatycznie', unit: '%', better: 'up', note: (m) => `${m.part} z ${m.total} ofert` },
    oldestDecisionDays: { label: 'Najstarsza decyzja', unit: ' d', better: 'down', note: (m) => (m.total ? `${m.total} w kolejce` : 'kolejka pusta') },
    completeEditions: { label: 'Kompletne wydania', unit: '%', better: 'up', note: (m) => `${m.part} z ${m.total} (wydawca i rok)` },
    confirmedAvailability: { label: 'Dostępność potwierdzona', unit: '%', better: 'up', note: (m) => `${m.part} z ${m.total} ofert` },
  };
  return measures
    .filter((m) => meta[m.id])
    .map((m) => {
      const info = meta[m.id];
      const delta = m.trend?.delta;
      let trend = 'trend od jutra';
      let tone = 'none';
      if (delta === 0) {
        trend = '= bez zmian od ' + shortDay(m.trend.since);
        tone = 'flat';
      } else if (typeof delta === 'number') {
        trend = (delta > 0 ? '▲ +' : '▼ ') + pl(delta) + (info.unit === '%' ? ' pp' : ' d') + ' od ' + shortDay(m.trend.since);
        tone = (delta > 0) === (info.better === 'up') ? 'good' : 'bad';
      }
      return { id: m.id, label: info.label, value: m.id === 'oldestDecisionDays' && m.value === 0 ? 'dziś' : pl(m.value) + info.unit, note: info.note(m), trend, tone };
    });
}

/**
 * A one-line warning when a source brought far fewer new offers than the week before (a changed
 * page often fades the results without any error). Nothing when all is well.
 */
export function quietSourcesNote(data) {
  const sources = Array.isArray(data?.quietSources) ? data.quietSources : [];
  if (!sources.length) return null;
  return `Mało nowych ofert z: ${sources.join(', ')} — mniej niż połowa tygodnia wcześniej. Sprawdź, czy źródło nadal działa (albo czy skan był wyłączony).`;
}

/** " · 20 największych decyzji obejmuje 340 z 851 ofert" when the queue is longer than that. */
export function unlockNote(unlock) {
  if (!unlock || !(unlock.topOffers > 0) || !(unlock.decisions > unlock.top)) return '';
  return ` · ${unlock.top} ${plural(unlock.top, 'największa decyzja obejmuje', 'największe decyzje obejmują', 'największych decyzji obejmuje')} ${unlock.topOffers} z ${unlock.totalOffers} ofert`;
}

/**
 * The one thing the view leads with: the decisions waiting in the queue and how old the oldest is
 * (from the measures). Pure (tested).
 */
export function todayLead(data) {
  const decisions = data.queue?.decisions ?? 0;
  const offers = data.queue?.offers ?? 0;
  const oldest = (data.measures || []).find((m) => m.id === 'oldestDecisionDays')?.value;
  if (!decisions) return { count: 0, label: 'Kolejka pusta', note: 'nic nie czeka na decyzję', attention: false };
  const age = typeof oldest === 'number' && oldest > 0 ? `najstarsza czeka ${oldest} ${plural(oldest, 'dzień', 'dni', 'dni')}` : 'najstarsza z dziś';
  return {
    count: decisions,
    label: plural(decisions, 'decyzja czeka', 'decyzje czekają', 'decyzji czeka'),
    note: `${age} · ${offers} ${plural(offers, 'oferta', 'oferty', 'ofert')} w kolejce${unlockNote(data.queue?.unlock)}`,
    attention: true,
  };
}

const percent = (chance) => (typeof chance === 'number' ? Math.round(chance * 100) + '%' : '–');

/** One-line summary of a day-plan entry, as plain text (escaped by the caller). Pure (tested). */
export function planEntryText(cardId, entry, money) {
  if (cardId === 'deals')
    return `${entry.title} · ${money(entry.price)} (warta ${money(entry.worth)}, taniej o ${money(entry.saving)}) · szansa ${percent(entry.chance)} · ${entry.source}`;
  if (cardId === 'unlock') return `${entry.key} · ${entry.offers} ${plural(entry.offers, 'oferta', 'oferty', 'ofert')}`;
  if (cardId === 'fast-markets') return `${entry.title} · wycena ${money(entry.value)} · szansa ${percent(entry.chance)}`;
  return '';
}

/** "Mediana reakcji na okazję: 12 min (ogłoszona → obejrzana)"; empty unless a number. Pure (tested). */
export function reactionNote(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '';
  const text = minutes < 90 ? `${Math.round(minutes)} min` : `${Math.round(minutes / 6) / 10} godz.`;
  return `<p class="inline-note today-plan-reaction">Mediana reakcji na okazję: ${text} (ogłoszona → obejrzana)</p>`;
}

/**
 * "Plan dnia" markup from /api/today `plan`: a card per kind of work with its top entries and an
 * "Otwórz" button (data-plan-card = card id). One line when nothing waits. Pure (tested).
 */
export function planHtml(plan, money, escapeHtml, reactionMinutes = null) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  if (!cards.length) return '<section class="today-plan" aria-labelledby="todayPlanTitle"><h3 id="todayPlanTitle">Plan dnia</h3><p class="inline-note">Na dziś nic nie czeka.</p></section>';
  const card = (item) => {
    if (item.id === 'sniper-off')
      return `<article class="today-plan-card" data-plan="sniper-off"><h4>${escapeHtml(item.title)}</h4><p class="inline-note">Nowe ogłoszenia z Vinted widać wtedy dopiero przy pełnym skanie, czyli po godzinach. Włączony snajper co 20 min sprawdza 10 fraz, a co 5 min przegląda najnowsze ogłoszenia książek i od razu sprawdza te z Twojego katalogu; nowe okazje mogą przyjść jako powiadomienie na telefon.</p><button type="button" class="button primary" data-plan-sniper-on>Włącz snajpera</button> <button type="button" class="button secondary" data-plan-card="sniper-off">Ustawienia w Okazjach</button></article>`;
    const entries = (item.entries || [])
      .map((entry) => {
        const text = escapeHtml(planEntryText(item.id, entry, money));
        return item.id === 'deals' && /^https?:\/\//.test(entry.url || '')
          ? `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">${text}</a></li>`
          : `<li>${text}</li>`;
      })
      .join('');
    return `<article class="today-plan-card" data-plan="${escapeHtml(item.id)}"><h4>${escapeHtml(item.title)} <span class="today-plan-count">${escapeHtml(String(item.count))}</span></h4><ul>${entries}</ul><button type="button" class="button secondary" data-plan-card="${escapeHtml(item.id)}">Otwórz</button></article>`;
  };
  return `<section class="today-plan" aria-labelledby="todayPlanTitle"><h3 id="todayPlanTitle">Plan dnia</h3>${reactionNote(reactionMinutes)}<div class="today-plan-cards">${cards.map(card).join('')}</div></section>`;
}

/**
 * Tiles of the view from the /api/today answer. Pure (tested); `go` names what a tile opens:
 * { offers: filters } | { view: name }.
 */
export function todayTiles(data, now = new Date()) {
  const tiles = [];
  const scopeNote = data.scope === 'visit' ? 'od ostatniej wizyty' : 'w ostatnim skanie';
  if (data.newOffers)
    tiles.push({
      id: 'new',
      label: 'Nowe oferty',
      value: data.newOffers.count,
      note: scopeNote,
      go: { offers: data.newOffers.filters },
    });
  if (data.priceChanges)
    tiles.push({
      id: 'price',
      label: 'Zmiany cen',
      value: data.priceChanges.count,
      note: scopeNote,
      go: { offers: data.priceChanges.filters },
    });
  // The queue is not a tile: it leads the view (todayLead).
  // Sources without legal access (Allegro, OLX) are neither working nor failing: not counted.
  const counted = (data.sources || []).filter((row) => row.state !== 'no_access');
  const down = counted.filter((row) => row.state === 'down' || row.state === 'never');
  tiles.push({
    id: 'sources',
    label: 'Źródła',
    value: `${counted.length - down.length}/${counted.length}`,
    note: down.length ? `nie ${down.length === 1 ? 'działa' : 'działają'}: ${down.map((row) => row.source).join(', ')}` : 'wszystkie działają',
    go: { anchor: 'todaySources' },
    warn: down.length > 0,
  });
  if (data.lastScan)
    tiles.push({
      id: 'last-scan',
      label: 'Ostatni skan',
      value: whenLabel(data.lastScan.at, now),
      note: `${data.lastScan.found} ${plural(data.lastScan.found, 'wynik', 'wyniki', 'wyników')} · ${data.lastScan.newOffers} ${plural(data.lastScan.newOffers, 'nowa', 'nowe', 'nowych')}${data.lastScan.durationMs != null ? ' · trwał ' + (data.lastScan.durationMs < 90000 ? Math.max(1, Math.round(data.lastScan.durationMs / 1000)) + ' s' : Math.round(data.lastScan.durationMs / 60000) + ' min') : ''}${data.lastScan.failedSources.length ? ' · błąd: ' + data.lastScan.failedSources.join(', ') : ''}`,
      go: { offers: data.lastScan.filters },
    });
  const next = [data.nextScan?.at, data.nextScan?.quickAt].filter(Boolean).sort()[0];
  tiles.push({
    id: 'next-scan',
    label: 'Następny skan',
    value: next ? whenLabel(Date.parse(next) < now.getTime() ? now.toISOString() : next, now) : 'wyłączony',
    note: next ? (Date.parse(next) < now.getTime() ? 'zaległy — ruszy przy najbliższym sprawdzeniu' : 'według harmonogramu') : 'włącz harmonogram w widoku Skan',
    go: { view: 'scanner' },
  });
  return tiles;
}

/**
 * Rows of the source list: sources that do not work stand out one by one; the working ones fold into
 * one "N działa" line and those without legal access (a settled fact, not news) into another.
 * Pure (tested).
 */
export function sourceRows(sources, now, escapeHtml) {
  const row = (item) =>
    `<li class="is-${escapeHtml(item.state)}"><button type="button" data-source="${escapeHtml(item.source)}" title="Oferty z tego źródła"><i class="source-dot-state" aria-hidden="true"></i><b>${escapeHtml(item.source)}</b><span>${escapeHtml(sourceLine(item, now))}</span></button></li>`;
  const working = sources.filter((item) => item.state === 'ok');
  const closed = sources.filter((item) => item.state === 'no_access');
  const rest = sources.filter((item) => item.state !== 'ok' && item.state !== 'no_access');
  const fold = (list, summary) =>
    list.length ? `<li class="today-sources-ok"><details><summary>${summary}</summary><ul>${list.map(row).join('')}</ul></details></li>` : '';
  return rest.map(row).join('') + fold(working, `${working.length} działa`) + fold(closed, `${closed.length} bez legalnego dostępu`);
}

/**
 * "Ostatnie 7 dni" markup from /api/report/week: sections with their lines, an arrow against the
 * previous week where the server sent one, and the plain text to copy. Pure (tested).
 */
export function weekReportHtml(report, escapeHtml) {
  if (!report || report.empty)
    return '<p class="inline-note">Brak danych z tego tygodnia (skany i okazje pojawią się tu po pierwszych skanach).</p>';
  const line = (item) => {
    const change = item.change;
    const arrow = change
      ? `<span class="week-change ${change.delta > 0 ? 'is-up' : change.delta < 0 ? 'is-down' : 'is-flat'}">${change.delta > 0 ? '▲ +' + change.delta : change.delta < 0 ? '▼ ' + change.delta : '= bez zmian'} wobec ${change.previous}</span>`
      : '';
    return `<li>${escapeHtml(item.text)} ${arrow}</li>`;
  };
  const sections = report.sections
    .map((section) => `<section class="week-section" data-week-section="${escapeHtml(section.id)}"><h4>${escapeHtml(section.title)}</h4><ul>${section.lines.map(line).join('')}</ul></section>`)
    .join('');
  return `<p class="inline-note week-title">${escapeHtml(report.title)}</p>${sections}<div class="week-copy"><button type="button" class="button secondary" data-week-copy>Kopiuj tekst</button><textarea class="week-text" readonly rows="6" aria-label="Raport tygodniowy jako tekst">${escapeHtml(report.text)}</textarea></div>`;
}

export function installTodayView({ $, json, escapeHtml, showView, openOffers }) {
  const root = $('#todayBody');
  if (!root) return { refresh: async () => {} };
  const pulse = installPulse({ $, json, escapeHtml });
  const since = visitBaseline();
  const weekCard = $('#todayWeek');
  const weekBody = $('#todayWeekBody');
  let weekLoaded = false;
  async function loadWeek() {
    if (!weekBody) return;
    try {
      const report = await json('/api/report/week');
      weekLoaded = true;
      weekBody.innerHTML = weekReportHtml(report, escapeHtml);
      weekBody.querySelector('[data-week-copy]')?.addEventListener('click', async (event) => {
        const area = weekBody.querySelector('.week-text');
        try {
          await navigator.clipboard.writeText(report.text);
          event.target.textContent = 'Skopiowano';
        } catch {
          area?.select();
        }
      });
      try {
        localStorage.setItem('bookflip.weekReportRead', report.to);
      } catch {
        /* the mark is a convenience */
      }
    } catch {
      weekBody.innerHTML = '<p class="inline-note">Nie udało się wczytać raportu.</p>';
    }
  }
  if (weekCard) {
    // Monday: open until read once for the week that has just ended.
    let read = null;
    try {
      read = localStorage.getItem('bookflip.weekReportRead');
    } catch {
      /* no storage: stays closed */
    }
    const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE');
    if (new Date().getDay() === 1 && read !== yesterday) weekCard.open = true;
    weekCard.addEventListener('toggle', () => {
      if (weekCard.open && !weekLoaded) void loadWeek();
    });
    if (weekCard.open) void loadWeek();
  }
  let serial = 0;
  let last = null;

  function render(data) {
    const now = new Date();
    const tiles = todayTiles(data, now);
    const scan = data.scan?.status === 'running'
      ? `<button type="button" class="today-banner" data-go-view="scanner"><b>Skan trwa</b> od ${escapeHtml(whenLabel(data.scan.startedAt, now))} — przebieg w widoku Skan</button>`
      : '';
    $('#todaySince').textContent = data.scope === 'visit'
      ? 'od ostatniej wizyty: ' + whenLabel(data.since, now)
      : data.lastScan ? 'liczby z ostatniego skanu' : 'jeszcze nie było skanu';
    // The lead opens the queue: the heading button would say the same again.
    $('#todayReview').hidden = true;
    const lead = todayLead(data);
    const measures = measureCards(data.measures)
      .map((card) => `<div class="today-measure is-${card.tone}" data-measure="${escapeHtml(card.id)}"><span class="today-tile-label">${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.note)}</small><small class="today-trend">${escapeHtml(card.trend)}</small></div>`)
      .join('');
    const quiet = quietSourcesNote(data);
    const quietRow = quiet ? `<p class="inline-note today-quiet" role="status">${escapeHtml(quiet)}</p>` : '';
    root.innerHTML = `${scan}${quietRow}${planHtml(data.plan, money, escapeHtml, data.reactionMedianMinutes)}<button type="button" class="today-lead${lead.attention ? ' is-attention' : ''}" data-lead><strong>${lead.count || ''}</strong><span>${escapeHtml(lead.label)}</span><small>${escapeHtml(lead.note)}</small>${lead.attention ? '<em>Weryfikuj</em>' : ''}</button><div class="today-tiles">${tiles
      .map(
        (tile, index) =>
          `<button type="button" class="today-tile${tile.attention ? ' is-attention' : ''}${tile.warn ? ' is-warn' : ''}" data-tile="${index}"><span class="today-tile-label">${escapeHtml(tile.label)}</span><strong>${escapeHtml(String(tile.value))}</strong><small>${escapeHtml(tile.note)}</small></button>`,
      )
      .join('')}</div>
      ${measures ? `<section class="today-measures" aria-label="Miary katalogu">${measures}</section>` : ''}
      <section class="today-pulse" aria-labelledby="pulseTitle"><h3 id="pulseTitle">Puls rynku · 30 dni</h3><div id="pulseBody" class="pulse-body"><p class="inline-note">Wczytywanie…</p></div></section>
      <section class="today-sources" id="todaySources" aria-labelledby="todaySourcesTitle">
        <h3 id="todaySourcesTitle">Źródła</h3>
        <ul>${sourceRows(data.sources || [], now, escapeHtml)}</ul>
      </section>`;
    root.querySelectorAll('[data-tile]').forEach((button) =>
      button.addEventListener('click', () => {
        const tile = tiles[Number(button.dataset.tile)];
        if (tile.go.offers) openOffers(tile.go.offers);
        else if (tile.go.view) showView(tile.go.view);
        else if (tile.go.anchor) $('#' + tile.go.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }),
    );
    root.querySelectorAll('[data-source]').forEach((button) =>
      button.addEventListener('click', () => openOffers({ source: button.dataset.source, sort: 'newest' })),
    );
    root.querySelectorAll('[data-plan-card]').forEach((button) =>
      button.addEventListener('click', () => {
        const go = data.plan?.cards?.find((card) => card.id === button.dataset.planCard)?.go;
        if (!go?.view) return;
        showView(go.view);
        const sort = go.sort === 'unlock' && go.view === 'review' ? $('#reviewSort') : null;
        if (sort && sort.value !== 'unlock') {
          sort.value = 'unlock';
          sort.dispatchEvent(new Event('change'));
        }
      }),
    );
    root.querySelector('[data-plan-sniper-on]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await json('/api/sniper', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
        button.closest('[data-plan]')?.remove();
      } catch {
        button.disabled = false;
        button.textContent = 'Nie udało się — spróbuj ponownie';
      }
    });
    root.querySelector('[data-go-view]')?.addEventListener('click', () => showView('scanner'));
    root.querySelector('[data-lead]')?.addEventListener('click', () => showView('review'));
    void pulse.refresh();
  }

  async function refresh() {
    const request = ++serial;
    try {
      const data = await json('/api/today' + (since ? '?' + new URLSearchParams({ since }) : ''));
      if (request !== serial) return last;
      last = data;
      render(data);
      return data;
    } catch {
      if (!last) root.innerHTML = '<p class="inline-note">Nie udało się wczytać podsumowania. Spróbuję ponownie po odzyskaniu połączenia.</p>';
      return last;
    }
  }
  // "Nowy skan" lands on the scan form, not on the source status above it (1100 px higher on a phone).
  $('#todayScan')?.addEventListener('click', () => {
    showView('scanner');
    $('.scanner-form-panel')?.scrollIntoView({ block: 'start' });
  });
  $('#todayReview')?.addEventListener('click', () => showView('review'));
  return { refresh, last: () => last };
}
