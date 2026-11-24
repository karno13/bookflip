-- Sub-labels (podetykiety) inside a label collection (label-groups.mjs): the owner's own division of
-- one label into named groups. A book of the label belongs to at most one group
-- (`work_labels.group_id`; NULL = in the main list); its position and volume stay as they are.
-- Not identification evidence, never shown outside the label view.
CREATE TABLE label_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_label TEXT NOT NULL CHECK (length(normalized_label) BETWEEN 1 AND 60),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  normalized_name TEXT NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 60),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (normalized_label, normalized_name)
) STRICT;
ALTER TABLE work_labels ADD COLUMN group_id INTEGER;
