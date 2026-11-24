-- Watched sellers (watched-sellers.mjs): the owner marks a seller (the marketplace's own seller id)
-- whose new offers are worth a look. Only a mark and a filter: it never changes a ranking and sends
-- no request of its own. Removing the mark deletes nothing else.
CREATE TABLE watched_sellers (
  source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 100),
  seller_id TEXT NOT NULL CHECK (length(seller_id) BETWEEN 1 AND 100),
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source, seller_id)
) STRICT;
