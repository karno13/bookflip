-- Stock attribution (stock-attribution.mjs): where a copy came from, kept as a snapshot taken when
-- it was bought, because the offer may disappear (offer_id ON DELETE SET NULL). Old copies are
-- filled once from their offer when it still exists; otherwise the source stays unknown (NULL).
ALTER TABLE stock_items ADD COLUMN source TEXT CHECK (source IS NULL OR length(source) <= 100);
ALTER TABLE stock_items ADD COLUMN source_seller_id TEXT CHECK (source_seller_id IS NULL OR length(source_seller_id) <= 100);
ALTER TABLE stock_items ADD COLUMN source_phrase TEXT CHECK (source_phrase IS NULL OR length(source_phrase) <= 300);
UPDATE stock_items SET
  source = (SELECT o.source FROM offers o WHERE o.id = stock_items.offer_id),
  source_seller_id = (SELECT o.seller_id FROM offers o WHERE o.id = stock_items.offer_id),
  source_phrase = (SELECT substr(json_extract(o.matched_queries_json, '$[0]'), 1, 300) FROM offers o
                   WHERE o.id = stock_items.offer_id AND json_valid(o.matched_queries_json))
WHERE offer_id IS NOT NULL;
