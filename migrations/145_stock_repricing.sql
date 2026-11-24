-- Przypomnienie o obniżce (stock-aging.mjs): dates only, no amounts. repriced_at is when the owner
-- pressed "Obniżyłem cenę"; aging_snoozed_at is when they chose "Zostaw", and aging_snoozed_market
-- is the market (middle-tier) price in grosze at that moment: the reminder stays silent until the
-- market price differs (NULL: there was no reliable valuation then). Not an amount of the owner.
ALTER TABLE stock_items ADD COLUMN repriced_at TEXT;
ALTER TABLE stock_items ADD COLUMN aging_snoozed_at TEXT;
ALTER TABLE stock_items ADD COLUMN aging_snoozed_market INTEGER;
