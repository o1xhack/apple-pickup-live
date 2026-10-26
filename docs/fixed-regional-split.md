# Fixed Mac / Cloudflare regional experiment

The user authorized a fixed split on 2026-10-25. `data/collection-shards.json`
freezes the verified 30-query tour: 15 western queries / 122 owned stores for
`mac-local`, 15 other queries / 147 owned stores for `cloudflare`. All 269 stores
have exactly one owner, every query ZIP is assigned once, and ownership is not
changed after an error. Apple's incidental neighboring-store returns are filtered
by owner and deduplicated within each round before counters or events are saved.
This is not proxy/IP rotation, failover, or a guarantee of avoiding 541.

## Execution and request budget

The existing Mac LaunchAgent remains the only scheduler, snapshot writer and
publisher. It directly queries its assigned ZIPs and sends authenticated execution
tasks to the existing Worker for Cloudflare-assigned ZIPs. The Worker makes that
Apple request itself and returns the result. Cloudflare does not independently
run a second cron scanner; when the Mac stops both shards stop. Public search
still only reads cached snapshots. No desktop/private App settings are changed.

Set `COLLECTION_MODE=fixed-split` in the ignored `.env.local`. The nominal period
remains 300 seconds. The current reduced national budget is divided between the
two sources at rollout (4 becomes 2+2), not reset to 30. Each source spaces its own
quota across the entire five minutes and retains its next request time across
restarts. An unused/blocked source's quota is never assigned to the other source.
After a block the affected source halves its quota, minimum one. Recovery adds
at most one request per source per hour, to a maximum of 15 each; the combined
recovery rate does not exceed the old +1 per 30 minutes. Existing global/server
waits and active Mac regional rests are retained at first migration.

A 541 applies regional backoff, an all-assigned-regions failure pass applies a
source-wide cooldown, and explicit 403/429/Retry-After pauses that source. There
are no immediate retries of Apple requests. Learning hubs are disabled during
this experiment so the frozen assignment remains comparable.

## Authentication and duplicate prevention

`POST /api/collector/check` requires the existing ingest secret, the plan version,
a preassigned Cloudflare ZIP, a fresh timestamp and a task ID. Local-owned ZIPs
and arbitrary destinations are rejected before any Apple call. A D1 atomic lease
permits each task ID only once, each ZIP at most once per five minutes, at least
20 seconds between Cloudflare starts and at most 15 starts per rolling five
minutes. Completed replay returns the cached result. A lost response/pending lease
does not trigger a second Apple request. Migration `0004_fixed_shards.sql` is
additive; this new table holds public request outcomes and no credentials.

## Measurement

SQLite `requests.source` distinguishes `mac-local` / `cloudflare`, preserving
request time, ZIP, HTTP status, latency, Retry-After and cooldown decision. The
snapshot's `health.shards.sources` contains independent budgets, cooloffs and
actual request/success/error counts. `health.sourceSummary` also records assigned
store count and 15-minute fresh-store coverage. Skipped server leases are not
counted as Apple HTTP failures. A transport failure between Mac and Worker is
unknown, not proof of an Apple 541. No outbound IP is recorded, so do not infer
Cloudflare's exact address or claim a controlled residential-vs-cloud IP study.

Compare both source cohorts over the same wall-clock window, including cooldown
and never-scanned stores. Different regions and prior IP load prevent causal
claims from a short success-rate comparison. A few 200 responses only prove the
path works, not national five-minute stability.

## Rollback

Before rollout use `scripts/backup-collector.mjs` for a consistent SQLite backup.
To disable all scanning, boot out only the public collector LaunchAgent. To end
the experiment, do not transfer blocked Cloudflare work to Mac immediately:
stop the collector, preserve per-source cooldowns in the snapshot, and establish
an explicit single-source budget and wait before switching to the old collector
mode. Changing the mode alone is not a safe automatic failover. Leave the additive
D1 table and historical counters intact; never reset history to the backup merely
to roll back code. The separate desktop App remains paused.
