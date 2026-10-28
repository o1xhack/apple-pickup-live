# Public history without visitor database scans

Implemented and deployed 2026-10-26: preserve local SQLite as the source of
truth and fixed Mac/Cloudflare sampling assignments. Precompute date-sharded,
compressed public history. Closed dates are immutable static assets; today's
records plus manifest are one KV value updated at most every five minutes.
Existing live mirror is a separate KV key, so normal history + live publication
is approximately 576 writes/day, below the free 1,000/day quota. Browser searches
and date comparisons execute locally. No public GET endpoint can query D1.

D1 may remain solely for the authenticated Cloudflare collection execution lease,
whose workload is bounded by the existing collector's fixed budget. Public history
and ingestion APIs are retired with explicit 410 responses, not successful empty
histories. Historical data is not deleted. No subscription is enabled.

A separate local exporter reads a consistent SQLite snapshot without Apple calls.
It indexes changed per-store cumulative cell records and checkpoint totals in an
independent SQLite cache, preserving original timestamps, counters, unknowns and
real gaps. Historical California export is whitelisted to the eight Duo SKUs.
Cumulative jumps are endpoints, never invented intermediate samples/restocks.

Closed-date assets are direct-uploaded at most daily, not per query or scan.
A saved released frontend shell is used for data-only deployments so unattended
publication cannot ship unreviewed source edits. Failures keep the last public
bundle and retain unfinalized days in the current bundle until static deployment
is confirmed. New files are versioned by content hash. Publication receipt is
written only after a successful upload; local data/outboxes are not deleted.

Free-tier feasibility: static assets are free/unlimited, daily site deployment is
about 31/month (rather than every-five-minute builds), KV publication is bounded
and independent of visitor SQL complexity. Workers/KV still have daily request
limits; this is not a promise of unlimited real-time traffic. Browser caches a
history download per publication window. No R2 billing enrollment or proxy/IP
rotation, no DNS/Tailscale changes, and no private desktop App modifications.


## Operation and recovery

After environment/SSD checks and configuring the existing authenticated publisher:

```sh
node scripts/publish-public-history.mjs --prepare
npm run deploy
npm run deploy:pages
node scripts/publish-public-history.mjs --adopt-deployed
node scripts/install-history-publisher.mjs
```

The LaunchAgent `com.o1xhack.apple-pickup-live.history` runs every 300 seconds.
Its logs and index live in ignored `state.local/`. `receipt.json` acknowledges
only a successfully published checkpoint. The collector marks corresponding
outbox entries sent without deleting source observations. Automatic closed-day
uploads use `state.local/released-site`, captured after a successful explicit
frontend deployment, and persist a maximum of two attempts per UTC day.

Both service installers resolve Homebrew Node to its stable `bin/node` (or
versioned-formula `opt/node@…/bin/node`) symlink, never a removable Cellar keg.
The 2026-10-28 incident left live sampling intact but stopped history publication
at Oct 27 10:54 PT: launchd reported `EX_CONFIG` after the pinned Node executable
was removed by an upgrade. Reinstalling the history service recovered the saved
backlog; all 30 in-stock changes from Pacific midnight through the recovered
checkpoint matched the local event IDs. No observations were invented or deleted.

If live totals advance while History stops, compare the publication receipt to
`/api/public-history`, then inspect `launchctl print` for the history service and
its executable. Empty stderr does not prove health when launchd cannot spawn the
process. The History page shows the latest synchronized checkpoint and explicitly
notes when it is over 15 minutes old. The publisher resumes incrementally from its
cursor after repair; normal 300-second cadence and existing publication budgets
still apply.

On upload failure, retain SQLite, the previous KV publication and all versioned
assets. Retry the publisher after fixing the cause; do not delete counters or
invent missing observations. D1 history/ingest endpoints intentionally return 410.
Rollback should restore a compatible file-based frontend and last good files;
restoring the old SQL-reading frontend reintroduces the exhausted-quota failure.
Never delete D1 tables or local history as a quota workaround.

## Verification

Production verification during the exhausted D1 quota recovered all earlier CA
Duo data: 158,112 checks and 18 in-stock observations. National file totals matched
the live cumulative checkpoint at the same publication. ZIP 95014, changed start
dates, and History were exercised in the actual browser. Observed browser APIs
were only `/api/info`, `/api/latest` and `/api/public-history`; filtering never
called retired history/checkpoint/series SQL APIs.

Tests cover exact boundaries, unchanged repeated checks, deduplicated changes,
unknowns, incremental export, deterministic static files, failed deployment
retention, current-day preservation, native browser fetch binding, and repeated
queries reusing downloaded files. Existing source assignments, collection budget
and private desktop application remain unchanged. Sampling gaps remain unknown.
