CREATE TABLE IF NOT EXISTS checkpoints (
 ts INTEGER PRIMARY KEY,
 payload BLOB NOT NULL,
 checks INTEGER NOT NULL,
 positives INTEGER NOT NULL,
 requests INTEGER NOT NULL,
 errors INTEGER NOT NULL,
 fresh_stores INTEGER NOT NULL,
 source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_events (
 id TEXT PRIMARY KEY,
 ts INTEGER NOT NULL,
 store TEXT NOT NULL,
 part TEXT NOT NULL,
 state TEXT NOT NULL,
 kind TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_store_time ON stock_events(store,ts);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO metadata(key,value) VALUES ('site_start',CAST(strftime('%s','now') AS INTEGER)*1000);
