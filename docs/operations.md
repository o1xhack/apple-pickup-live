# Operations and verification

## Verified behavior (2026-10-25)

- Cloudflare endpoint returned HTTP 200 and twelve parsed stores in a bounded initial probe.
- Initial 36-request round covered 247 catalog stores; subsequent rounds brought actual coverage to all 269 stores / 2,152 configurations.
- 320px and 390px browser-frame viewports had no horizontal document overflow. ZIP 95125 results were ordered by estimated distance. Chinese navigation and statistics rendered successfully.
- Public API tests verify compressed database snapshots round-trip as valid JSON, unauthenticated collection/ingest reject before any Apple query, invalid filters reject, and history/series return stored data.
- Local SQLite state and public counters survived switching from foreground collection to the independent LaunchAgent.
- The first extended sample included 206 HTTP 200 queries, seven HTTP 503 and one HTTP 541. Collection immediately entered a five-minute cooldown on the 541. This disproves any claim that a Cloudflare exit avoids all blocking.
- The adaptive budget was added after that result: halve regional requests on failures, retain the budget and cooldown across restarts, and recover slowly. It is a load-control mechanism, not a guarantee of uninterrupted stock data.

## Check health without querying Apple

Read `/api/latest` and inspect `publishedAt`, `health.cooldownUntil`,
`health.requestBudget`, `health.lastSuccess`, and individual cell `at` fields.
`/api/info`, `/api/series` and `/api/history` only read D1. Do not use the private
collector endpoint as a health check: it really requests Apple.

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
