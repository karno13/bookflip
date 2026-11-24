// „Puls rynku” in „Dziś”: three small daily bar charts (new offers, offers gone, deals announced) from
// /api/activity. Small multiples, each with its own scale (the counts differ by orders of magnitude, so
// never one shared axis). Colours follow the series, not the rank: blue / orange / aqua are --wp-s1/2/3.
// Pure markup builders are tested without a DOM; installPulse wires the hover tooltip.
const W = 800;
const H = 120;
const TOP = 16;
const BASE = 98;
const SIDE = 6;

export const PULSE_SERIES = [
  { key: 'new', label: 'Nowe oferty w skanach', short: 'nowych', tone: 'new', note: 'zależy od tego, co i kiedy skanowałeś' },
  { key: 'gone', label: 'Oferty, które zniknęły (sprzedane lub nieaktualne)', short: 'zniknęło', tone: 'gone', note: '' },
  { key: 'alerts', label: 'Okazje ogłoszone', short: 'okazji', tone: 'alerts', note: '' },
];

/** "20.11" from "2026-11-20". */
export const shortDate = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** A bar with a rounded top end and a flat base: x, width, height. */
function barPath(x, width, height) {
  const r = Math.min(4, width / 2, height);
  const y = BASE - height;
  return `M${x} ${BASE}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${width - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${BASE}Z`;
}

/** SVG of one series. `days`: [{ date, <key> }]. */
export function pulseChartSvg(days, series) {
  const max = Math.max(1, ...days.map((day) => day[series.key]));
  const slot = (W - 2 * SIDE) / Math.max(1, days.length);
  const width = Math.max(3, slot - 3);
  const bars = days
    .map((day, index) => {
      const value = day[series.key];
      const x = SIDE + index * slot + (slot - width) / 2;
      const height = value ? Math.max(2, ((BASE - TOP) * value) / max) : 0;
      const bar = height ? `<path class="pulse-bar is-${series.tone}" d="${barPath(x.toFixed(1), width.toFixed(1), height.toFixed(1))}"/>` : '';
      return `<g class="pulse-slot" data-day="${day.date}" data-value="${value}">${bar}<rect class="pulse-hit" x="${(SIDE + index * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}"/></g>`;
    })
    .join('');
  const mid = Math.floor(days.length / 2);
  const tick = (index, anchor) =>
    `<text class="pulse-axis" x="${(SIDE + index * slot + slot / 2).toFixed(1)}" y="${H - 4}" text-anchor="${anchor}">${shortDate(days[index].date)}</text>`;
  return `<svg class="pulse-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${series.label}: ${days.reduce((sum, day) => sum + day[series.key], 0)} w ${days.length} dniach"><line class="pulse-base" x1="${SIDE}" x2="${W - SIDE}" y1="${BASE}" y2="${BASE}"/><text class="pulse-axis" x="${SIDE}" y="10">${max}</text>${bars}${tick(0, 'start')}${tick(mid, 'middle')}${tick(days.length - 1, 'end')}</svg>`;
}

/** One chart with its headline number. */
export function pulseCardHtml(data, series, escapeHtml) {
  const total = data.totals[series.key];
  const perDay = (total / data.days.length).toFixed(1).replace('.', ',');
  const note = series.note ? `<small>${escapeHtml(series.note)}</small>` : '';
  return `<figure class="pulse-card"><figcaption><span class="pulse-swatch is-${series.tone}" aria-hidden="true"></span><span class="pulse-title">${escapeHtml(series.label)}</span><strong>${total}</strong><small>${escapeHtml(series.short)} w ${data.days.length} dniach · śr. ${perDay} dziennie</small>${note}</figcaption>${pulseChartSvg(data.days, series)}</figure>`;
}

/** The accessible table behind the charts. */
export function pulseTableHtml(data) {
  const rows = data.days
    .map((day) => `<tr><th scope="row">${shortDate(day.date)}</th><td>${day.new}</td><td>${day.gone}</td><td>${day.alerts}</td></tr>`)
    .join('');
  return `<details class="pulse-table"><summary>Tabela danych</summary><div class="table-wrap"><table><thead><tr><th scope="col">Dzień</th><th scope="col">Nowe oferty</th><th scope="col">Zniknęły</th><th scope="col">Okazje</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

export function pulseHtml(data, escapeHtml) {
  if (!data?.days?.length) return '<p class="inline-note">Brak danych o aktywności.</p>';
  return `<div class="pulse-grid">${PULSE_SERIES.map((series) => pulseCardHtml(data, series, escapeHtml)).join('')}</div><div class="pulse-tip" role="status" hidden></div>${pulseTableHtml(data)}`;
}

/** Fills #pulseBody from /api/activity and shows a tooltip for the slot under the pointer. */
export function installPulse({ $, json, escapeHtml }) {
  let serial = 0;
  async function refresh() {
    const body = $('#pulseBody');
    if (!body) return;
    const request = ++serial;
    try {
      const data = await json('/api/activity?days=30');
      if (request !== serial) return; // a newer refresh is on its way
      body.innerHTML = pulseHtml(data, escapeHtml);
    } catch {
      body.innerHTML = '<p class="inline-note">Nie udało się wczytać aktywności.</p>';
      return;
    }
    const tip = body.querySelector('.pulse-tip');
    const show = (event) => {
      const slot = event.target.closest?.('.pulse-slot');
      if (!slot || !tip) return;
      body.querySelectorAll('.pulse-slot.is-active').forEach((other) => other.classList.remove('is-active'));
      slot.classList.add('is-active');
      const card = slot.closest('.pulse-card');
      tip.textContent = `${shortDate(slot.dataset.day)}: ${slot.dataset.value}`;
      const box = body.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = `${Math.min(box.width - 90, Math.max(0, event.clientX - box.left + 12))}px`;
      tip.style.top = `${card.getBoundingClientRect().top - box.top + 8}px`;
    };
    const hide = () => {
      if (tip) tip.hidden = true;
      body.querySelectorAll('.pulse-slot.is-active').forEach((other) => other.classList.remove('is-active'));
    };
    body.querySelectorAll('.pulse-svg').forEach((svg) => {
      svg.addEventListener('pointermove', show);
      svg.addEventListener('pointerleave', hide);
    });
  }
  return { refresh };
}
