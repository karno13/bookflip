-- The owner's state of work on a deal (deal-triage.mjs): seen, snoozed until a time, or dismissed.
-- It only decides whether a deal is shown, never how it ranks. price_at is the offer price (grosze)
-- when the state was set: a later price below it brings a seen or dismissed deal back. The state
-- goes with the offer (ON DELETE CASCADE).
CREATE TABLE deal_triage (
  offer_id TEXT PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('seen','snoozed','dismissed')),
  until TEXT,
  price_at INTEGER NOT NULL CHECK (price_at > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
