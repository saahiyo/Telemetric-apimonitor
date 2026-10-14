-- Cloudflare D1 Schema for API Monitor & Management

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  raw_key TEXT,                        -- Plaintext secret, legacy: dashboard copy-back only
  key_hash TEXT NOT NULL UNIQUE,
  service TEXT NOT NULL DEFAULT 'all', -- 'all', 'vidbunker', 'flezen'
  rate_limit_per_min INTEGER DEFAULT 60,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  expires_at DATETIME                  -- NULL = never expires
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys(service);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active, expires_at);

-- Per-minute rate-limit counters, keyed by api_keys.id.
-- SDK upserts into the current minute bucket; rows older than ~10 minutes are pruned.
CREATE TABLE IF NOT EXISTS rate_limits (
  key_id TEXT NOT NULL,
  window_minute TEXT NOT NULL,          -- ISO-8601 minute bucket, e.g. '2026-10-13T21:42'
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_minute)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_minute);

CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,               -- 'vidbunker', 'flezen', etc.
  endpoint TEXT NOT NULL,              -- e.g. '/api/extract', '/api/stream'
  method TEXT NOT NULL,                -- 'GET', 'POST', etc.
  status_code INTEGER NOT NULL,        -- 200, 401, 500, etc.
  latency_ms INTEGER NOT NULL,         -- Request duration in milliseconds
  api_key_id TEXT,                     -- Reference to api_keys.id (or NULL)
  key_prefix TEXT,                     -- Prefix of the key used (e.g. vb_e2a3...)
  client_ip TEXT,                      -- CF Connecting IP
  client_country TEXT,                 -- CF IP Country (e.g. 'IN', 'US')
  user_agent TEXT,
  error_message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_service_status ON request_logs(service, status_code);
CREATE INDEX IF NOT EXISTS idx_logs_api_key ON request_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_logs_key_window ON request_logs(api_key_id, timestamp DESC);

-- =========================================================
-- MIGRATION: bring an existing D1 database up to this schema
-- =========================================================
-- CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists,
-- so an older database must be ALTERed explicitly. Run once:
--
--   ALTER TABLE api_keys ADD COLUMN raw_key TEXT;
--   ALTER TABLE api_keys ADD COLUMN expires_at DATETIME;
--   CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active, expires_at);
--   CREATE INDEX IF NOT EXISTS idx_logs_key_window ON request_logs(api_key_id, timestamp DESC);
--
-- rate_limits is created by the CREATE TABLE above, so it needs no ALTER.
-- Backfill last_used_at from the newest log per key if it is still NULL:
--
--   UPDATE api_keys
--   SET last_used_at = (SELECT MAX(timestamp) FROM request_logs WHERE api_key_id = api_keys.id)
--   WHERE last_used_at IS NULL;
