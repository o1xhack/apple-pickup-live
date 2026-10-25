# Early California history

The public site imports original, pre-launch California observations from Apple Pickup Watcher using a consistent read-only SQLite transaction. No notification payloads, settings, credentials, private ZIPs, or proxy data are exported.

The archive is labelled `legacy_ca`; current nationwide collection remains `national`. Historical observations do not change the live snapshot, collection start time, nationwide sweep totals, or current freshness. Public history and statistics combine the earlier Duo observations automatically and offer store/configuration/date filters. There is no public source/model selector. The activity chart remains nationwide-only.

The first archive contains 158,112 store × configuration observations, including 18 in-stock, 14,400 unknown and 110,688 pickup-not-open observations, across 12 California stores and 8 iPhone Duo configurations. There are 3,221 recorded local cycles and 23 reconstructed stock transitions. Observations are not phone quantities, request counts, or replenishment counts. First sightings and recovery after gaps are distinguished from confirmed restocks.

Original millisecond timestamps and state codes are retained inside hourly sample arrays. Fully covered hours use precomputed sums; boundary hours are filtered sample by sample. The importer excludes observations at or after the public site launch, rejects non-California/non-US targets, and deduplicates store/part/time. Inserts are idempotent. Non-Duo observations are excluded; the original private App database remains unchanged.

Run `scripts/export-legacy-ca.py --help` for the export CLI. Apply migration `0002_legacy_ca.sql` once, then execute the generated SQL using Wrangler D1. Always verify the SSD identity and use BuildScratch for the generated SQL/database fixtures. Never copy a live WAL database primary file in isolation.
