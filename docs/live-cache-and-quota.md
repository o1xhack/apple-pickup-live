# Live snapshot isolation from D1 quota

The account's D1 daily row-read limit was confirmed exhausted on 2026-10-26:
all D1-dependent reads returned the provider's quota error. The daily reset is
00:00 UTC (17:00 Pacific while daylight time applies). A depleted account must
not be described as a healthy historical backend.

## Independent free-tier live mirror

`LIVE_CACHE` is a dedicated Workers KV namespace. `/api/info` uses a checked-in
public catalog/legacy manifest, and `/api/latest` reads the `latest` KV key.
Neither endpoint reads D1. The original D1 checkpoint and stock-event history
remain intact. KV is not an Apple request proxy or a replacement historical DB.

The authenticated `/api/live/publish` accepts only the public catalog shape and
current timestamp, rejects stale/regressed publication, and rate-limits the single
scheduler to one write per five minutes. The collector durably remembers its next
live-publication time. Normal continuous operation is about 288 KV writes/day,
below the free 1,000/day cap. The one-time seed is copied from the real SQLite
snapshot with original observation timestamps. KV propagation can lag; never
refresh cell timestamps merely because a mirror was written. Browser freshness
continues to be based on actual store observations, not mirror timestamps.

This uses a free-plan namespace only. It does not enable a paid subscription,
change DNS/Tailscale, or modify the private desktop App. KV and Workers still have
independent free quotas, so high visitor traffic needs separate capacity review.

## Quota behavior and recovery

* D1-dependent history APIs return an explicit 503 `history_unavailable`, not a
  successful empty history or a false out-of-stock observation.
* Ingest returns `historyPersisted: false` with `retryAt` at the next UTC midnight.
  The Mac stops history-upload retries until then and keeps event/checkpoint
  outboxes unacknowledged. Live mirror publication continues independently.
* The Cloudflare Apple executor requires a D1 atomic lease. With D1 unavailable,
  that source is skipped/paused until the reset, not misclassified as Apple 541.
  Its fixed regions are never transferred to the Mac. Mac-owned collection
  continues subject to its existing Apple cooldown and budget.
* New complete local snapshots are written atomically with each request outcome.
  At most two historical snapshots are replayed with each normal ingestion after
  recovery. Old timestamps are preserved; historical ingestion permits these
  authenticated backfills. A failed/partial batch is idempotent and not acked.
* Before this fix, local checkpoints were inserted only after cloud ingest ACK.
  An earlier quota gap may contain request/event rows and the latest snapshot but
  not every complete intermediate snapshot. Do not reconstruct missing history
  from counters or claim the earlier gap was fully covered.

Static metadata `data/site-info.json` was regenerated read-only from the approved
pre-launch California export and checked against 158,112 observations and eight
Duo SKUs. Catalog fields use current build-time products/stores. Historical query
cache improvements remain in place; moving the live mirror does not refund
already-consumed D1 reads. Existing open browser tabs should reload once.
