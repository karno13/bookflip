-- "Kupuję do … zł": the most the owner will pay for an edition, or for the Polish editions of a
-- work (price-targets.mjs). An offer at or below it is a deal whatever the market valuation says.
-- Switching a target off (active=0) keeps the row and every alert already announced.
CREATE TABLE price_targets (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('edition','work')),
  edition_id TEXT REFERENCES editions(id) ON DELETE CASCADE,
  work_id TEXT REFERENCES works(id) ON DELETE CASCADE,
  max_price INTEGER NOT NULL CHECK (max_price > 0 AND max_price < 1000000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((scope='edition' AND edition_id IS NOT NULL AND work_id IS NULL)
      OR (scope='work' AND work_id IS NOT NULL AND edition_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX uq_price_targets_edition ON price_targets(edition_id) WHERE edition_id IS NOT NULL;
CREATE UNIQUE INDEX uq_price_targets_work ON price_targets(work_id) WHERE work_id IS NOT NULL;
