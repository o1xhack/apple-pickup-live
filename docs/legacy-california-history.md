# Early California history

The public site imports original, pre-launch California observations from Apple Pickup Watcher using a consistent read-only SQLite transaction. No notification payloads, settings, credentials, private ZIPs, or proxy data are exported.

The archive is labelled `legacy_ca`; current nationwide collection remains `national`. Historical observations do not change the live snapshot, collection start time, nationwide sweep totals, or current freshness. Public statistics allow separate or combined sources and model/store/configuration/date filters. The activity chart remains nationwide-only.

The first archive contains 170,988 store × configuration observations, including 5,122 in-stock, 15,848 unknown and 110,688 pickup-not-open observations, across 12 California stores and 10 configurations. There are 3,221 recorded local cycles and 341 reconstructed stock transitions. Observations are not phone quantities, request counts, or replenishment counts. First sightings and recovery after gaps are distinguished from confirmed restocks.

Original millisecond timestamps and state codes are retained inside hourly sample arrays. Fully covered hours use precomputed sums; boundary hours are filtered sample by sample. The importer excludes observations at or after the public site launch, rejects non-California/non-US targets, and deduplicates store/part/time. Inserts are idempotent. Imported model metadata is separate from the current iPhone Duo catalog.

Run `scripts/export-legacy-ca.py --help` for the export CLI. Apply migration `0002_legacy_ca.sql` once, then execute the generated SQL using Wrangler D1. Always verify the SSD identity and use BuildScratch for the generated SQL/database fixtures. Never copy a live WAL database primary file in isolation.
