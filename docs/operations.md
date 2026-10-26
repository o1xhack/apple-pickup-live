# Operations and verification

## Verified behavior (2026-10-25)

- Cloudflare endpoint returned HTTP 200 and twelve parsed stores in a bounded initial probe.
- Initial 36-request round covered 247 catalog stores; subsequent rounds brought actual coverage to all 269 stores / 2,152 configurations.
- 320px and 390px browser-frame viewports had no horizontal document overflow. ZIP 95125 results were ordered by estimated distance. Chinese navigation and statistics rendered successfully.
- Public API tests verify compressed database snapshots round-trip as valid JSON, unauthenticated collection/ingest reject before any Apple query, invalid filters reject, and history/series return stored data.
- Local SQLite state and public counters survived switching from foreground collection to the independent LaunchAgent.
- The first extended sample included 206 HTTP 200 queries, seven HTTP 503 and one HTTP 541. Collection immediately entered a five-minute cooldown on the 541. This disproves any claim that a Cloudflare exit avoids all blocking.
- At 19:25 UTC, the independent service automatically resumed after the five-minute cooldown: 18/18 requests succeeded, covering 171 stores in that round, with counters preserved. This verifies one recovery, not long-term reliability.
- The adaptive budget was added after that result: halve regional requests on failures, retain the budget and cooldown across restarts, and recover slowly. It is a load-control mechanism, not a guarantee of uninterrupted stock data.

## Check health without querying Apple

Read `/api/latest` and inspect `publishedAt`, `health.cooldownUntil`,
`health.requestBudget`, `health.lastSuccess`, and individual cell `at` fields.
`/api/info`, `/api/series` and `/api/history` only read D1. The authenticated Cloudflare execution endpoint accepts only frozen Cloudflare-owned regional tasks. The Mac is the only scheduler; see `fixed-regional-split.md`.

On the collector Mac, use `launchctl print` for label
`com.o1xhack.apple-pickup-live.collector` and inspect `state.local/service.log`,
`service-error.log`, and the separate SQLite `requests` table. No desktop-app
restart or settings change is needed.

A recent publisher heartbeat does not mean every store was recently checked.
During cooldown the publisher continues saving heartbeats, while per-store times
age naturally into stale state. A successful HTTP response with a missing or
changed schema is a failed check, not an out-of-stock result.

## Resource boundaries

No public API can choose an arbitrary upstream URL or product. Collection is
private-token protected, and uses the checked-in ZIP/SKU catalog. Searches and
filters do not enqueue collection. There is a daily request budget, per-round
budget, cooldown, and one process lock.

The Worker/D1 service and the Mac collector are separate from the original
Apple Pickup Watcher installation, database, Bark settings, and release pipeline.
Changing this website's language does not change that app's notification language.

Keep `.env.local`, `.wrangler/`, `state.local/` and all `*.local*` files private.
The public repository contains no collection secret. Rotate the ingest token
in both Wrangler and `.env.local` if exposed; restart only this collector.

The service currently needs an awake, logged-in Mac. LaunchAgent startup does not
keep a sleeping Mac awake and does not run before user login. It never changes
power settings, Tailscale, or the user's desktop app.

## Mac transport cutover (2026-10-25)

At 21:09:38 UTC the public collector switched to direct Mac requests, preserving its budget, cooldown, SQLite counters and existing observations. Each committed response is pushed immediately to D1; visible browsers read new snapshots every 15 seconds. The separate desktop App was paused by explicit user request; its 96 saved targets and notification settings remain. It must stay paused until the user asks otherwise. Initial Mac responses succeeded, but do not infer long-term reliability from a small sample. Cloudflare does not select or rotate outbound Apple IPs in the current architecture.

## Fixed regional split experiment

The user authorized a fixed Mac/Cloudflare split after the earlier Mac-only trial. See [fixed-regional-split.md](fixed-regional-split.md) for frozen ownership, independent cooldowns, unchanged aggregate starting budget, duplicate prevention, measurements and rollback. The Mac-only architecture described above is historical; current mode is recorded in the live snapshot.

## Free-tier archive read pressure (2026-10-25)

The D1 dashboard for UTC 2026-10-26 00:00–05:19 showed about 4.16M rows read;
its top two legacy archive aggregation statements accounted for about 1.80M and
1.53M. This is database row usage, not outbound Apple query count. Workers daily
requests were about 8,042 / 100,000 at the inspection, while the new Cloudflare
shard had sent only 53 Apple requests. Dashboard aggregates are delayed and
rounded; do not present the user's earlier 77% as conclusively the same metric.

`legacyStatistics` now clamps the effective range to the immutable archive's
stored start/end, shares bounded in-flight/in-memory results and caches them at
the edge for five minutes. Both aggregate views use a single SQL statement, so
the archive is not separately scanned twice for one response. Exact boundary
samples and filters remain covered by tests. Metadata caching is one minute;
re-imported archive metadata changes the result key. Failed work is not cached.
No collection cadence, shard assignment, paid plan or private App is changed.
Already-consumed daily reads are not refunded by this optimization. Watch actual
D1 read totals, not only Worker request totals, before concluding free-tier
capacity is sufficient at larger visitor volumes.

### Persistent range reuse and browser-only statistics filters

Follow-up inspection for the hour ending around 23:28 PDT still showed 23
archive aggregate executions / approximately 491k rows read. A five-minute
per-edge cache did not adequately prevent repeat full-range work. Do not report
estimated percentage savings as achieved savings.

Migration `0005_archive_query_cache.sql` adds a persistent result cache keyed by
archive revision, exact bounded dates and result shape. Successful immutable
results expire after seven days; edge cache is one day. This avoids a fresh
archive scan after an isolate restart or edge miss. A cache hit performs a primary
key lookup (plus metadata lookup when needed), rather than scanning ~21k rows.
`x-archive-cache` distinguishes computed / edge / memory / persistent responses.

The website requests `series=0`: its archive response includes all store/SKU
aggregates for the selected dates but no unused archive series. Store, capacity,
color and ZIP changes filter those aggregates in the browser. Other callers can
retain filtered series behavior. Only entering statistics or applying dates reads
saved ranges; merely changing statistics geographic/product filters no longer
calls the API. The live page still polls `/api/latest` every 15 seconds, reading
one saved checkpoint; it does not query Apple. History selections still read
bounded historical events. Browser GETs now honor cache headers instead of
forcing revalidation. Existing open tabs must reload to receive the new client.

Production verification: complete archive remained 158,112 checks / 96 aggregate
rows, and subsequent Oakridge filtering returned 13,176 checks / 8 rows with
`x-archive-cache: memory`. Cached range was confirmed in D1. This proves reuse for
that tested range; it does not establish a new daily quota consumption rate.
