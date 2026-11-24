-- Covering index for the seller search ("Szukaj"): the distinct sellers with their names and offer
-- counts are read from the index alone, without visiting the offers table.
CREATE INDEX idx_offers_seller_name ON offers(source, seller_id, seller_name) WHERE seller_id IS NOT NULL;
