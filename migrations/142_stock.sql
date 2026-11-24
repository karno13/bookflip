-- Rejestr zapasu (stock.mjs): the owner's copies, only states and dates (bought -> listed -> sold,
-- or dropped); no amounts. A copy always belongs to an edition (ISBN evidence); the source offer
-- may disappear (ON DELETE SET NULL) and the copy stays. stock_events is the journal of state
-- changes: the last one that is not undone can be taken back (undone_at), nothing is rewritten.
CREATE TABLE stock_items (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id),
  offer_id TEXT REFERENCES offers(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('bought','listed','sold','dropped')),
  bought_at TEXT NOT NULL,
  listed_at TEXT,
  sold_at TEXT,
  dropped_at TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_stock_items_status ON stock_items(status);
CREATE INDEX idx_stock_items_offer ON stock_items(offer_id) WHERE offer_id IS NOT NULL;
CREATE TABLE stock_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('bought','listed','sold','dropped')),
  to_status TEXT NOT NULL CHECK (to_status IN ('bought','listed','sold','dropped')),
  at TEXT NOT NULL,
  undone_at TEXT
) STRICT;
CREATE INDEX idx_stock_events_item ON stock_events(item_id, id);
