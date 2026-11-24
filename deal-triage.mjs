// @ts-check
// "Skrzynka okazji": the owner's state of work on each deal: seen ("Obejrzane"), snoozed ("Odłóż")
// or dismissed ("Nie dla mnie"). It changes what is shown, never the ranking. A seen or dismissed
// deal comes back when the price falls below the price it had when the state was set; a snoozed
// one comes back at its time or on such a price fall. Setting a state also marks the deal's alert as
// looked at, which gives the reaction time (alerted → seen) shown on „Dziś”.

export const TRIAGE_STATES = ['seen', 'snoozed', 'dismissed'];
const DAY = 86_400_000;

/** @param {string} code @param {number} status */
const fail = (code, status = 400) => {
  throw Object.assign(Error(code), { statusCode: status });
};

/**
 * @param {{ database: any }} repository
 * @param {string} offerId
 * @param {string} state
 * @param {{ until?: string | null, now?: () => Date }} [options] until: ISO time for a snooze (default: a day)
 */
export function setDealTriage(
  repository,
  offerId,
  state,
  { until = null, now = () => new Date() } = {},
) {
  if (!TRIAGE_STATES.includes(state)) fail('INVALID_TRIAGE_STATE');
  const database = repository.database;
  const offer = database.prepare('SELECT current_price FROM offers WHERE id=?').get(offerId);
  if (!offer) fail('OFFER_NOT_FOUND', 404);
  if (!(Number(offer.current_price) > 0)) fail('OFFER_HAS_NO_PRICE');
  const at = now();
  let snoozeUntil = null;
  if (state === 'snoozed') {
    const wanted = until ? Date.parse(until) : at.getTime() + DAY;
    if (!Number.isFinite(wanted) || wanted <= at.getTime()) fail('INVALID_SNOOZE_TIME');
    snoozeUntil = new Date(wanted).toISOString();
  }
  database
    .prepare(
      `INSERT INTO deal_triage(offer_id, state, until, price_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(offer_id) DO UPDATE SET state=excluded.state, until=excluded.until,
         price_at=excluded.price_at, updated_at=excluded.updated_at`,
    )
    .run(
      offerId,
      state,
      snoozeUntil,
      Number(offer.current_price),
      at.toISOString(),
      at.toISOString(),
    );
  // Looking at a deal (any state) answers its alert: the reaction time is alerted_at → seen_at.
  database
    .prepare('UPDATE deal_alerts SET seen_at=? WHERE offer_id=? AND seen_at IS NULL')
    .run(at.toISOString(), offerId);
  return { offerId, state, until: snoozeUntil };
}

/** @param {{ database: any }} repository @param {string} offerId */
export function clearDealTriage(repository, offerId) {
  const result = repository.database
    .prepare('DELETE FROM deal_triage WHERE offer_id=?')
    .run(offerId);
  if (!result.changes) fail('TRIAGE_NOT_FOUND', 404);
  return { offerId, state: null };
}

/**
 * The triage of a deal now: its state and whether it is shown.
 * @param {{ state: string, until: string | null, priceAt: number } | undefined} row
 * @param {number} price the offer price now (grosze)
 * @param {number} at
 */
export function triageView(row, price, at) {
  if (!row) return null;
  const cheaper = price < row.priceAt;
  const snoozeOver = row.state === 'snoozed' && row.until != null && Date.parse(row.until) <= at;
  return {
    state: row.state,
    until: row.until,
    priceAt: row.priceAt,
    // Shown again: the snooze ran out, or the price fell below what it was when it was set aside.
    visible: snoozeOver || cheaper,
    returned: snoozeOver ? 'snooze_over' : cheaper ? 'price_drop' : null,
  };
}

/** All triage rows by offer id. @param {{ database: any }} repository */
export function triageRows(repository) {
  /** @type {Map<string, { state: string, until: string | null, priceAt: number }>} */
  const rows = new Map();
  for (const row of repository.database
    .prepare('SELECT offer_id, state, until, price_at FROM deal_triage')
    .all())
    rows.set(String(row.offer_id), {
      state: String(row.state),
      until: row.until == null ? null : String(row.until),
      priceAt: Number(row.price_at),
    });
  return rows;
}

/** Median minutes from the alert to the first look, over looked-at alerts (null: none yet). */
export function reactionMedianMinutes(/** @type {{ database: any }} */ repository) {
  const minutes = repository.database
    .prepare(
      `SELECT (julianday(seen_at) - julianday(alerted_at)) * 1440 AS minutes
       FROM deal_alerts WHERE seen_at IS NOT NULL ORDER BY minutes`,
    )
    .all()
    .map((row) => Number(row.minutes))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!minutes.length) return null;
  const middle = Math.floor((minutes.length - 1) / 2);
  return Math.round(minutes[middle] * 10) / 10;
}
