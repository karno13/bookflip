-- Etykiety as collections (catalog-labels.mjs): a label exists on its own (before any book has it),
-- can be renamed, and keeps its books in the owner's order. `position` is 1..n per label, `volume`
-- an optional volume number the owner types (organisation only, never ISBN evidence).
CREATE TABLE labels (
  normalized_label TEXT PRIMARY KEY CHECK (length(normalized_label) BETWEEN 1 AND 60),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 60),
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO labels(normalized_label, label, created_at)
  SELECT normalized_label, min(label), min(created_at) FROM work_labels GROUP BY normalized_label;

ALTER TABLE work_labels ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE work_labels ADD COLUMN volume INTEGER CHECK (volume IS NULL OR volume BETWEEN 1 AND 10000);
-- Existing order: when the label was added to the book.
UPDATE work_labels SET position = (
  SELECT count(*) FROM work_labels b
  WHERE b.normalized_label = work_labels.normalized_label
    AND (b.created_at < work_labels.created_at
      OR (b.created_at = work_labels.created_at AND b.rowid <= work_labels.rowid)));
