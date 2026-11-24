-- When the listing page of an offer was last read for its listing age (listing-age-backfill.mjs).
-- Each page is read for it once: a page without an age is not read again and again.
ALTER TABLE offers ADD COLUMN listing_age_checked_at TEXT;
