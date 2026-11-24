// A scatter-and-lines chart of the recorded asking prices of an edition's offers: one thin grey line
// per offer (its path through time) and a blue dot for every observation. One series, one colour
// (--wp-s1); the offers differ only by their line, so no legend of twenty colours. Hover: the title of a
// dot. These are asking prices, not sales. Pure markup (tested); the caller supplies the formatters.
const W = 720;
const H = 220;
const LEFT = 46;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 30;

/** @param {{ offerId: string, title: string, price: number, observedAt: string }[]} rows */
export function priceChartSvg(rows, { money, escapeHtml, formatDate }) {
  const points = rows
    .map((row) => ({ ...row, at: Date.parse(row.observedAt) }))
    .filter((row) => Number.isFinite(row.at) && row.price > 0);
  if (points.length < 2) return '';
  const minT = Math.min(...points.map((point) => point.at));
  const maxT = Math.max(...points.map((point) => point.at));
  const maxP = Math.max(...points.map((point) => point.price)) * 1.08;
  const spanT = Math.max(1, maxT - minT);
  const x = (t) => (LEFT + ((t - minT) / spanT) * (W - LEFT - RIGHT)).toFixed(1);
  const y = (p) => (TOP + (1 - p / maxP) * (H - TOP - BOTTOM)).toFixed(1);
  const byOffer = new Map();
  for (const point of points) byOffer.set(point.offerId, [...(byOffer.get(point.offerId) || []), point]);
  const lines = [...byOffer.values()]
    .filter((list) => list.length > 1)
    .map((list) => {
      const path = list
        .sort((a, b) => a.at - b.at)
        .map((point) => `${x(point.at)},${y(point.price)}`)
        .join(' ');
      return `<polyline class="pc-line" points="${path}"/>`;
    })
    .join('');
  const dots = points
    .map(
      (point) =>
        `<circle class="pc-dot" cx="${x(point.at)}" cy="${y(point.price)}" r="4.5"><title>${escapeHtml(`${formatDate(point.at)} · ${money(point.price)} · ${point.title}`)}</title></circle>`,
    )
    .join('');
  const grid = [0, 0.5, 1]
    .map((share) => {
      const price = (maxP / 1.08) * share;
      return `<line class="pc-grid" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(price)}" y2="${y(price)}"/><text class="pc-axis" x="${LEFT - 6}" y="${Number(y(price)) + 4}" text-anchor="end">${escapeHtml(money(Math.round(price)))}</text>`;
    })
    .join('');
  const label = `Ceny ofertowe w czasie: ${points.length} odczytów, od ${formatDate(minT)} do ${formatDate(maxT)}`;
  return `<svg class="price-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">${grid}${lines}${dots}<text class="pc-axis" x="${LEFT}" y="${H - 8}" text-anchor="start">${escapeHtml(formatDate(minT))}</text><text class="pc-axis" x="${W - RIGHT}" y="${H - 8}" text-anchor="end">${escapeHtml(formatDate(maxT))}</text></svg>`;
}
