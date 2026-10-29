# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `npm run build` writes `robots.txt` (allow all, sitemap pointer) and `sitemap.xml` covering every indexable URL.
- Homepage title, description, canonical URL, Open Graph tags, and a Twitter `summary_large_image` card. The share image is `public/og.png` (1200×630). Regenerate it with `npm run seo:og`.
- JSON-LD: `WebSite` and `WebApplication` on the homepage; `BreadcrumbList` on guide, restock, store index, and store pages; `FAQPage` on `/iphone-duo`; `Dataset` on `/restock-times`.
- Prerendered pages: `/iphone-duo`, `/restock-times`, `/stores`, and `/store/<slug>` for all 269 stores. The HTML is in the build output, so crawlers can read it without the live-search script.
- Restock times are computed from published history into `data/restock-summary.json`. Refresh with `npm run seo:restock` (no Apple request). Counts are candidate restocks, not phones or confirmed deliveries.
- Footer links to the iPhone Duo guide, restock times, the store index, https://app.o1xhack.com/, and https://x.com/o1xhack. The Chinese toggle translates the new homepage labels.
- README section for the routes, the build, image and summary regeneration, the 404 host rules, and Search Console.

### Fixed

- Unknown URLs on Cloudflare Pages returned the homepage with HTTP 200 because the site had no top-level `404.html`. A small noindex 404 page is now served with HTTP 404. The Worker asset binding uses `not_found_handling: 404-page`. Pages redirects refuse a 200 rewrite back to `index.html`.
