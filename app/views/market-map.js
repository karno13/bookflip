// „Mapa rynku” in „Rynek”: every valued edition as one dot — right = the better the chance of a sale
// within 30 days, up = the higher its valuation (log scale: 10 zł and 300 zł share the page), the size of
// the dot = turnover (value × chance). The top right is where a book is both worth something and sells.
// One series, one colour (--wp-s1). Pure markup (tested); a click on a dot opens the book.
/** Only the biggest dots are in the tab order: 200 tab stops would trap the keyboard before the list below. */
export const KEYBOARD_DOTS = 20;
const W = 1100;
const H = 330;
const LEFT = 56;
const RIGHT = 16;
const TOP = 18;
const BOTTOM = 40;

/** @param {{ workId: string, title: string, value: number, turnover: number, liquidity: { chance: number } }[]} items */
export function marketMapSvg(items, { zl, escapeHtml }) {
  const dots = items.filter((item) => item.value > 0 && item.liquidity?.chance > 0);
  if (dots.length < 3) return '';
  const maxChance = Math.max(0.05, ...dots.map((item) => item.liquidity.chance)) * 1.08;
  const lo = Math.log(Math.max(500, Math.min(...dots.map((item) => item.value)) * 0.9));
  const hi = Math.max(Math.log(Math.max(...dots.map((item) => item.value)) * 1.1), lo + 0.1);
  const maxTurnover = Math.max(1, ...dots.map((item) => item.turnover || 0));
  const x = (chance) => (LEFT + (chance / maxChance) * (W - LEFT - RIGHT)).toFixed(1);
  const y = (value) => (TOP + (1 - (Math.log(value) - lo) / (hi - lo)) * (H - TOP - BOTTOM)).toFixed(1);
  const radius = (turnover) => (3.5 + 9 * Math.sqrt((turnover || 0) / maxTurnover)).toFixed(1);
  const ticksY = [500, 1000, 3000, 10000, 30000, 100000].filter((value) => Math.log(value) > lo && Math.log(value) < hi);
  const ticksX = [0.1, 0.2, 0.3, 0.4, 0.5].filter((chance) => chance < maxChance);
  const gridY = ticksY
    .map((value) => `<line class="mm-grid" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(value)}" y2="${y(value)}"/><text class="mm-axis" x="${LEFT - 8}" y="${Number(y(value)) + 4}" text-anchor="end">${escapeHtml(zl(value))}</text>`)
    .join('');
  const gridX = ticksX
    .map((chance) => `<text class="mm-axis" x="${x(chance)}" y="${H - BOTTOM + 18}" text-anchor="middle">${Math.round(chance * 100)}%</text>`)
    .join('');
  const circles = dots
    .sort((a, b) => (b.turnover || 0) - (a.turnover || 0)) // large first, small ones stay on top and clickable
    .map(
      (item, index) =>
        `<circle class="mm-dot" data-work="${escapeHtml(item.workId)}" cx="${x(item.liquidity.chance)}" cy="${y(item.value)}" r="${radius(item.turnover)}" ${index < KEYBOARD_DOTS ? 'tabindex="0" role="button"' : ''} aria-label="${escapeHtml(`${item.title}: wycena ${zl(item.value)}, szansa ${Math.round(item.liquidity.chance * 100)}%`)}"><title>${escapeHtml(`${item.title} · wycena ${zl(item.value)} · szansa ${Math.round(item.liquidity.chance * 100)}% · obrót ~${zl(item.turnover || 0)}`)}</title></circle>`,
    )
    .join('');
  return `<svg class="mm-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="Mapa rynku: ${dots.length} wydań, szansa sprzedaży w poziomie, wycena w pionie. Z klawiatury dostępnych jest ${Math.min(KEYBOARD_DOTS, dots.length)} wydań o największym obrocie, resztę znajdziesz na liście poniżej."><text class="mm-corner" x="${W - RIGHT}" y="${TOP + 12}" text-anchor="end">wysoka wycena i dobra sprzedaż</text>${gridY}${gridX}<text class="mm-axis mm-title" x="${(LEFT + W - RIGHT) / 2}" y="${H - 4}" text-anchor="middle">szansa sprzedaży w 30 dni</text>${circles}</svg>`;
}
