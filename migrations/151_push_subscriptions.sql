-- Phones (browsers) that asked for push notifications of new deals (push-notify.mjs). The endpoint
-- is the browser vendor's push address; p256dh and auth are the browser's keys that encrypt each
-- message end to end (RFC 8291), so the push service never reads it.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY CHECK (length(endpoint) BETWEEN 10 AND 2000),
  p256dh TEXT NOT NULL CHECK (length(p256dh) BETWEEN 80 AND 100),
  auth TEXT NOT NULL CHECK (length(auth) BETWEEN 16 AND 32),
  created_at TEXT NOT NULL,
  last_sent_at TEXT,
  last_error TEXT,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0)
) STRICT;
