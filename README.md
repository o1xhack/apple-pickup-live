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

A Mac coordinator runs a bounded collection round every 300 seconds. Two fixed,
non-overlapping assignments sample Apple: `mac-local` covers 122 stores and
`cloudflare` covers 147. Failed regions do not move to the other executor.
Actual coverage depends on successful responses; nationwide freshness is not guaranteed.
Local SQLite preserves observations, counters, state changes and sampling gaps.

Public browsing does **not** query D1. The collector publishes a live snapshot to
KV at most every five minutes. An independent exporter publishes today's compressed
history to a second KV key; closed dates and earlier California Duo observations
are versioned static files. ZIP/product/date searches run inside the browser.
Search, History and Statistics remain usable when the D1 daily quota is exhausted.
An unavailable collector leaves saved data visible with its actual timestamps.

Normal live + history publication is approximately 576 KV writes/day, independent
of visitor searches. Closed-date static uploads happen at most daily, with at most
two automatic attempts/day. Workers/KV request limits still apply; this is not
unlimited real-time traffic. D1 is retained only for authenticated Cloudflare
execution leases and bounded cleanup, not visitor SQL or historical ingestion.
See [public history architecture and operations](docs/public-history-architecture.md).

Apple throttling still applies. A single 541 rests its region and collection
continues elsewhere. Exhausting the round without a success triggers global
backoff; explicit 403/429/Retry-After can also pause collection. There is no
rotating proxy, challenge bypass or automatic paid-plan upgrade.

## Search indexing

`npm run build` prerenders HTML and writes `robots.txt` and `sitemap.xml` into `dist/`. Cloudflare Pages and the Worker both serve that output. `robots.txt` allows all crawlers and points at `https://pickup.o1xhack.com/sitemap.xml`.

Indexable URLs, in addition to the homepage:

- `/iphone-duo` — what the tracker does, how to search, and an FAQ
- `/restock-times` — when candidate restocks were observed, from published history
- `/stores` — every tracked Apple Store
- `/store/<slug>` — one page per store, using the slug already stored in `data/us-stores.json`

These pages are HTML at build time. Store pages then fill the latest saved status in the browser from `/api/latest`. While a store tab stays open, those labels are checked again every 60 seconds and when the tab becomes visible, and the published snapshot is fetched again on that same cadence. An in-stock observation older than 15 minutes becomes “Not recently verified,” the same freshness rule as the homepage. A ZIP search still does not call Apple. Candidate restocks are adjacent out-of-stock → in-stock observations, not phones and not a delivery schedule. Public totals still start at 2026-10-24 00:00 America/Los_Angeles.

Like the homepage, these pages and the 404 page open in English and have a 中文 / English button. They share the homepage's saved choice (`apl-language` in local storage). The English HTML is what search engines index. Each file also carries the Chinese version in a `<template>`, which `public/page-language.js` swaps in for visitors who chose Chinese.

The homepage, guide, restock page, store index, store pages, and 404 page share Open Graph and Twitter `summary_large_image` tags. The image is `public/og.png` (1200×630). Regenerate it, after `python3 -m pip install pillow`, with:

```sh
npm run seo:og
```

Restock copy is baked from `data/restock-summary.json`. Refresh that file from the already published history (no Apple request) before a frontend deploy when the numbers should move:

```sh
npm run seo:restock
npm run build
```

Unknown paths return HTTP 404. Pages does that when a top-level `404.html` exists; without it, Pages serves the homepage with status 200. The Worker asset binding uses `not_found_handling: 404-page`. Do not add a `_redirects` rule that rewrites unknown URLs to `index.html` with status 200.

The existing homepage layout, copy, and controls are unchanged. Its `<head>` gains the title, description, canonical URL, share tags, and JSON-LD. Footer links to https://app.o1xhack.com/ and https://x.com/o1xhack are on the new pages and the 404 page. The homepage header still links to the hub, as it did before.

Canonical URLs have no `.html` suffix and no trailing slash. Pages redirects `/page.html` to `/page`. Trailing-slash redirects are in the generated `_redirects` file, and the Worker uses `html_handling: drop-trailing-slash`. Static redirect rules are written before the `/store/:slug/` placeholder so the existing API redirects keep working.

Deploy the frontend with `npm run deploy:pages` so the released site shell includes the new HTML. Later data-only history publishes reuse that shell. In Google Search Console, submit `https://pickup.o1xhack.com/sitemap.xml` and inspect `/`, `/iphone-duo`, `/restock-times`, `/stores`, and one `/store/<slug>` URL. After the pages are public, refresh the X card cache if an old preview is stuck. No new paid Cloudflare product is required.

## Local setup / deployment

Node >=22.13 (tested on 26), npm, a Cloudflare account and Wrangler authentication:

```sh
npm ci
npm test
npm run build
npx wrangler d1 create apple-pickup-live
# Replace database_id in wrangler.jsonc with the returned ID.
npx wrangler d1 migrations apply apple-pickup-live --remote
npx wrangler kv namespace create LIVE_CACHE
# Set LIVE_CACHE namespace ID in wrangler.jsonc.
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
node scripts/publish-public-history.mjs --prepare
npm run deploy:pages
node scripts/publish-public-history.mjs --adopt-deployed
node scripts/install-history-publisher.mjs
```

The installer verifies the expected SSD UUID; adapt that guard deliberately for
another machine. To stop this service only:

```sh
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.o1xhack.apple-pickup-live.collector.plist
```

State/logs are under ignored `state.local/`. Duplicate collectors are rejected.
Restart preserves SQLite counters, learned coverage, cooldown and unpublished history.
The history publisher requires the released Pages shell captured after a successful deployment.
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
- Public recent-stock labels use fifteen minutes; the collector still targets five-minute nationwide coverage. Failures do not overwrite the last success.
- History lists availability changes and can filter in-stock results before pagination; Statistics includes unchanged repeated checks.
- The homepage has eight scoped metrics. Stock and header recent-check coverage use fifteen minutes. Stores checked today, in-stock observations today and configuration checks today reset at 00:00 America/Los_Angeles. Public counts and default date ranges start at 00:00 America/Los_Angeles on October 24, 2026. Every repeated in-stock store × SKU result increments the hit count. Million-scale cards use M/K notation (1,234,567 → 1M 234K) with the exact value retained in their tooltip/accessibility label.
- The public product scope is iPhone Duo only. Earlier CA Duo history is combined automatically in History/Statistics, without source/model controls; only observations from October 24 onward contribute to public counters.
- Raw HTTP/collector errors remain in operational logs, not public banners. Per-store age/stale labels remain visible.
- Date comparisons use saved cumulative checkpoints, not exact sub-minute boundaries. The daily chart counts repeated in-stock observations per Pacific date and follows all store/product filters; it does not count distinct phones.
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

公开索引页在 `npm run build` 时预渲染：`/iphone-duo`、`/restock-times`、`/stores` 和 `/store/<slug>`。`robots.txt` 与 `sitemap.xml` 同时生成。未知地址返回 404 页面，而不是 200 的首页。分享图为 `public/og.png`，用 `npm run seo:og` 重新生成。补货时间摘要来自已发布历史，用 `npm run seo:restock` 更新，不会向 Apple 发请求。新页面和 404 页脚链到 https://app.o1xhack.com/ 和 https://x.com/o1xhack 。这些新页面和 404 页面同样默认英文、可切换中文，和首页共用同一个语言选择；搜索引擎索引的是英文 HTML，中文文字放在同一个文件里，由 `public/page-language.js` 切换。现有首页的版式和文案不变，只增加 head 元数据。前端改动后运行 `npm run deploy:pages`，再在 Google Search Console 提交 sitemap。

A single HTTP 541 quarantines its collection region. Two blocked regions do not imply a nationwide failure. The collector tries the remaining planned regions first; all-region failure, 403/429 or explicit Retry-After trigger global backoff. Coverage progress persists across rounds and the greedy planner minimizes repeated coverage. Upload retries apply only to our idempotent ingestion endpoint, never to Apple queries.
