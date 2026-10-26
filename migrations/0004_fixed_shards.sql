-- Authenticated, idempotent Cloudflare execution; no public search can trigger it.
CREATE TABLE IF NOT EXISTS collector_executions (
 id TEXT PRIMARY KEY, at INTEGER NOT NULL, zip TEXT NOT NULL,
 result TEXT, completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS collector_executions_at ON collector_executions(at);
