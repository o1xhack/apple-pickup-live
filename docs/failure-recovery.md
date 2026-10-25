# Failure handling, rollback and validation

## Five-minute scheduling

The site collector now starts a round every 300 seconds. It spreads the bounded
regional budget across that period, uses observed coverage to choose the region
covering the most overdue stores, and persists unfinished national coverage.
Individual stores are not guaranteed a successful observation every five minutes.
The original desktop app's interval and notification settings are independent.

Changing cadence normalizes the old throttled request budget once, preserving its
average request rate instead of accidentally reducing it again. Per-round budget
is still capped at 36 and at the daily cap. Source regions with stale or missing
samples are prioritized; repeated overlapping coverage is reduced.

## Errors and retries

- A single 541 rests that region and its known stores for 5/10/20/30 minutes.
- Two consecutively blocked regions trigger global backoff. A successful request
  breaks that streak. 403/429 and explicit Retry-After pause globally immediately.
- Three consecutive service/network failures also pause globally. Existing global
  cooldown is preserved on restart; success is never invented during that gap.
- Apple queries are not retried immediately. They wait for the normal paced schedule.
- Our own idempotent ingestion retries at most three times (2s/4s waits), retaining
  unsent events. Authorization/payload errors do not enter that retry loop.
- SQLite commits each request, events, counters and cooldown together. If a write
  fails, the in-memory collector returns to the last committed state.
- Failed/unknown/stale data never overwrites a valid prior observation as no stock.

## Offline fault tests

`npm test` injects HTTP 503, invalid JSON, network timeout, one 541, consecutive
regional blocks, 429 with Retry-After, publication failure, duplicate acknowledgement,
and SQLite transaction failure. It tests preserved counters, outbox recovery,
coverage selection, sorting and five-minute pacing without sending Apple requests.

With the two origin environment variables set, additional tests read the deployed
public APIs, verify the custom domain and check that writes reject. Those tests
also do not request Apple.

## Backup and rollback

On this Mac, `node scripts/backup-collector.mjs <new-path>` makes a consistent
SQLite online backup, including committed WAL state, and runs integrity checking.
Output must be below StudioSSD BuildScratch and the installer checks the expected
volume identity. Never copy only the live SQLite primary file.

For a code rollback: stop only `com.o1xhack.apple-pickup-live.collector`, keep
`.env.local` and `state.local/` unchanged, check out the last known good commit,
and use `node scripts/install-collector.mjs` to restart that independent service.
Do not roll back the live database with the code: its schema is additive and
newer counters/events must remain. Do not reinstall or restart the desktop app.

The pre-change consistent backup is disaster recovery only. A database restore
must happen with this collector stopped and preserve the broken current database
for investigation. It is not a normal deployment step. The backup/integrity check
was run against this independent collector; its old desktop counterpart was not
read or modified for backup.

A website/API deployment can separately use the previous Cloudflare Worker
version or Pages deployment in the dashboard. Keep the ingest secret and D1
binding unchanged. Recheck `/api/latest`, stored history, and both public origins
after rollback. Never reset historical counters to make a health check pass.
