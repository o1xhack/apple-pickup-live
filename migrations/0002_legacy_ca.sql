ALTER TABLE stock_events ADD COLUMN source TEXT NOT NULL DEFAULT 'national';
CREATE INDEX IF NOT EXISTS events_source_time ON stock_events(source,ts);
CREATE TABLE IF NOT EXISTS legacy_hourly(
 source TEXT NOT NULL,bucket INTEGER NOT NULL,store TEXT NOT NULL,part TEXT NOT NULL,
 checks INTEGER NOT NULL,hits INTEGER NOT NULL,unknown INTEGER NOT NULL,pending INTEGER NOT NULL,last_hit INTEGER NOT NULL,samples TEXT NOT NULL,
 PRIMARY KEY(source,store,part,bucket)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS legacy_hourly_time ON legacy_hourly(bucket);
