# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- IndexNow. `npm run build` writes `/286d51f27fb2687514afa4fc89fbe80a.txt` with that key as the entire body. `npm run deploy:pages` then runs `npm run indexnow`, which waits until the key file is live at `https://pickup.o1xhack.com`, reads the live sitemap, and POSTs the URLs to `https://api.indexnow.org/indexnow` with `host`, `key`, and `keyLocation`, in batches of at most 10,000. The key is public. If the live check or IndexNow is unavailable, the script warns and exits successfully so the Pages deploy stays up. `npm run indexnow` submits again without deploying.
- `npm run build` writes `robots.txt` (allow all, sitemap pointer) and `sitemap.xml` covering every indexable URL.
- Homepage title, description, canonical URL, Open Graph tags, and a Twitter `summary_large_image` card. The share image is `public/og.png` (1200×630). Regenerate it with `npm run seo:og`.
- JSON-LD: `WebSite` and `WebApplication` on the homepage; `BreadcrumbList` on guide, restock, store index, and store pages; `FAQPage` on `/iphone-duo`; `Dataset` on `/restock-times`.
- Prerendered pages: `/iphone-duo`, `/restock-times`, `/stores`, and `/store/<slug>` for all 269 stores. The HTML is in the build output, so crawlers can read it without the live-search script.
- Restock times are computed from published history into `data/restock-summary.json`. Refresh with `npm run seo:restock` (no Apple request). Counts are candidate restocks, not phones or confirmed deliveries.
- Footer links on the new pages and the 404 page to the iPhone Duo guide, restock times, the store index, https://app.o1xhack.com/, and https://x.com/o1xhack. The existing homepage footer and layout are unchanged.
- README section for the routes, the build, image and summary regeneration, the 404 host rules, and Search Console.
- Chinese on the new pages and the 404 page. Each page has the same 中文 / English button as the homepage and shares its saved choice. The English HTML stays the indexed version; the Chinese text ships in the same file and is swapped in by `public/page-language.js`. Store-page stock labels are translated too.

### Fixed

- IndexNow keeps its request timeout armed until the response body is read. A server that sends headers and then stalls can no longer hold the end of `npm run deploy:pages` open. The step still warns and exits successfully.
- Store pages re-check saved pickup labels every 60 seconds and when the tab becomes visible, and they fetch `/api/latest` again on those occasions. An in-stock observation older than 15 minutes changes to “Not recently verified” instead of staying in stock.
- Unknown URLs on Cloudflare Pages returned the homepage with HTTP 200 because the site had no top-level `404.html`. A small noindex 404 page is now served with HTTP 404. The Worker asset binding uses `not_found_handling: 404-page`. Pages redirects refuse a 200 rewrite back to `index.html`. Static API redirects are listed before the store-slug placeholder.
