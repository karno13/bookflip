-- Etykiety: the owner's own marks on a book (catalog-labels.mjs), any text, several per book; the
-- catalogue can be filtered by one, and a label can become a series.
CREATE TABLE work_labels (
  work_id TEXT NOT NULL REFERENCES works(id) ON UPDATE CASCADE ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 60),
  normalized_label TEXT NOT NULL CHECK (length(normalized_label) BETWEEN 1 AND 60),
  created_at TEXT NOT NULL,
  PRIMARY KEY (work_id, normalized_label)
) STRICT;
CREATE INDEX idx_work_labels_label ON work_labels(normalized_label);

-- Series the owner created (work-series-api.mjs): they exist before any book is added and may
-- name the group they belong to ("Warhammer"); without one the series is its own group.
CREATE TABLE own_series (
  normalized_name TEXT PRIMARY KEY CHECK (length(normalized_name) BETWEEN 1 AND 120),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  grouping TEXT CHECK (grouping IS NULL OR length(trim(grouping)) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- A book can be in a series before its volume number is known: the number becomes optional.
CREATE TABLE work_series_annotations_v2 (
  work_id TEXT PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
  series TEXT NOT NULL CHECK (length(trim(series)) BETWEEN 1 AND 120),
  volume INTEGER CHECK (volume IS NULL OR volume BETWEEN 1 AND 10000),
  updated_at TEXT NOT NULL
) STRICT;
INSERT INTO work_series_annotations_v2(work_id, series, volume, updated_at)
  SELECT work_id, series, volume, updated_at FROM work_series_annotations;
DROP TABLE work_series_annotations;
ALTER TABLE work_series_annotations_v2 RENAME TO work_series_annotations;
