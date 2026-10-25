# Apple Pickup Live

A public, mobile-friendly US iPhone Duo pickup-stock dashboard.

**Live site:** https://pickup.o1xhack.com

Fallback: https://apple-pickup-live.o1xhack.workers.dev

- Search saved stock by ZIP and 25 / 50 / 100 / 250 mile radius, state, city/store, storage and color.
- View stock freshness, per-store configurations, recorded changes, date-filtered statistics and a US map.
- English first, Chinese toggle; language stays in that browser.
- Public searches never request Apple. All visitors share the same observations.
- Independent of Apple Pickup Watcher: no desktop-app settings, Bark tokens or notifications are accessed.

## Architecture

A separate Node collector on a Mac runs one collection round every 300 seconds, with requests spread across the round.
It asks an authenticated Cloudflare endpoint for fixed-catalog regional Apple
pickup results. Apple sees Cloudflare egress, not the desktop app's Mac egress.
The collector learns actual store coverage, prioritizes old/missing stores,
limits each round to up to 36 requests over 300 seconds, and persists state in its own SQLite
database. A complete nationwide sweep is **not** guaranteed every five minutes during adaptive throttling or cooldown.

Once per round it publishes a compressed cumulative checkpoint plus state changes
to Cloudflare D1. The public website only reads this database. Browser feed refresh
is every 15 seconds while visible; it does not poll Apple. The Mac must be awake,
online, and logged in for its LaunchAgent to collect. The site still serves saved
observations when the collector is unavailable, with explicit stale status.

There is a 52,000/day collector request cap. HTTP 403/429/541 or three consecutive
failures trigger persistent 5/10/20/30-minute backoff and halve the regional
request budget (minimum four/round). It increases by one only after a 30-minute
recovery period without another block. There is no rotating proxy,
challenge bypass, guarantee against Apple blocking, or automatic paid-plan upgrade.

Cloudflare free-tier limits still apply: Workers request/CPU limits, D1 storage and
row budgets can stop service as traffic grows. Collection alone can use roughly
53,300 Worker invocations/day at its maximum budget (checks plus uploads), leaving
limited room for public API traffic under the free 100,000/day quota. Static assets
are separate. Monitor actual usage before advertising large-scale service.

## Local setup / deployment

Node >=22.13 (tested on 26), npm, a Cloudflare account and Wrangler authentication:

```sh
npm ci
npm test
npm run build
npx wrangler d1 create apple-pickup-live
# Replace database_id in wrangler.jsonc with the returned ID.
npx wrangler d1 migrations apply apple-pickup-live --remote
npx wrangler secret put INGEST_TOKEN
npm run deploy
```

Create **ignored**, owner-only `.env.local` with `INGEST_TOKEN` (same secret) and
`PUBLISH_URL` (your Worker origin), one `NAME=value` per line. Never publish it.

```sh
chmod 600 .env.local
npm run collect       # foreground collector; --once for one bounded round
# On this StudioSSD Mac only, install independent login/background service:
node scripts/install-collector.mjs
```

The installer verifies the expected SSD UUID; adapt that guard deliberately for
another machine. To stop this service only:

```sh
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.o1xhack.apple-pickup-live.collector.plist
```

State/logs are under ignored `state.local/`. Duplicate collectors are rejected.
Restart preserves SQLite counters, learned coverage, cooldown and unsent events.
There are no Apple credentials or checkout/cart actions.

## Data and definitions

Catalog: 269 US stores × 8 iPhone Duo configurations. Distances use ZIP centroids
and are approximate straight-line miles, not driving distances. See
[provenance and licenses](docs/data-sources.md).

- **Configuration check:** one returned store × SKU observation, including repeats.
- **In-stock observation:** one check showing available, not a count of phones.
- **First/recovered:** first sighting or a sighting after a sampling gap; not proven restock.
- **Restock candidate:** adjacent valid out-of-stock → in-stock observations.
- **Unknown / unscanned / pickup not open / stale:** kept distinct from confirmed out of stock.
- Fresh means checked within five minutes. Failures do not overwrite the last success.
- History lists availability changes; Statistics includes unchanged repeated checks.
- Date comparisons use saved cumulative checkpoints, not exact sub-minute boundaries.
- Remote/local checkpoints retain minute detail for 14 days, then hourly checkpoints.
  Changes are retained; local diagnostic requests retain 30 days.

The national catalog is a checked-in snapshot, not a promise that Apple has never
opened/closed another store. Update source data and validate coverage periodically.

## Attribution

GPL-3.0-or-later. Catalogs and pickup-response behavior derive from
[o1xhack/apple-pickup-watcher](https://github.com/o1xhack/apple-pickup-watcher),
itself derived from
[suversal/apple-store-inventory-monitor](https://github.com/suversal/apple-store-inventory-monitor).
Retained notices: [NOTICE](NOTICE), [upstream notice](data/NOTICE-upstream.txt).
GeoNames ZIP data is CC BY 4.0; geographic boundaries and D3 dependencies have
separate notices. Apple / iPhone marks belong to Apple; this site is unaffiliated.

---

## 中文

独立的全美 iPhone Duo 库存网站，支持 ZIP 附近门店、容量／颜色筛选、地图、
历史变化与日期统计。访问者只查询已采集数据，不向 Apple 发起额外请求。

Mac 独立采集器每 300 秒启动一轮，并把区域请求均匀摊开，Cloudflare 负责 Apple 查询出口与公开网站，
D1 保存共享快照。不是每家店都能严格每 300 秒刷新；受预算、分区覆盖与冷却影响，
以门店显示的采样时间为准。失败、未知与过期不能视为无货。

原桌面 App、监控配置、Bark 通知保持独立。Mac 需要开机、登录且联网才能继续采集；
关闭后网站仍能看历史，但会标注数据过期。没有开通收费计划，流量增长仍可能触及免费额度。

Custom domain: Cloudflare Pages serves public assets and reads the existing Worker API using public CORS. Only the `pickup` CNAME is added at DNSPod; existing domain records and nameservers remain unchanged. Run `npm run deploy:pages` after frontend changes, and `npm run deploy` after Worker/API changes.

A single HTTP 541 quarantines its collection region. Two consecutively blocked regions trigger global backoff; 403/429, explicit Retry-After, or three consecutive service failures still pause globally. Coverage progress persists across rounds and the greedy planner minimizes repeated coverage. Upload retries apply only to our idempotent ingestion endpoint, never to Apple queries.
