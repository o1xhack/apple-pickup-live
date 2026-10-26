CREATE TABLE IF NOT EXISTS archive_query_cache (
 cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS archive_query_cache_expiry ON archive_query_cache(expires_at);
