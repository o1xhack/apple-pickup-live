# Catalog and geographic data

## Source and attribution

- **Store/product catalog:** imported on 2026-10-25 from the public Apple Pickup Watcher source snapshot at https://github.com/o1xhack/apple-pickup-watcher (itself based on https://github.com/ENCHIGO/apple-pickup-watcher and https://github.com/hteen/apple-store-helper). The original GPL-3.0-or-later license and modification notices are retained in `data/LICENSE-upstream.txt` and `data/NOTICE-upstream.txt`. Store details originate from Apple retail metadata; this import is a catalog snapshot, not a real-time store-directory refresh.
- **Postal geographic estimates:** https://download.geonames.org/export/zip/US.zip, downloaded 2026-10-25. GeoNames explicitly licenses this postal dataset under **Creative Commons Attribution 4.0**. Original accompanying terms/field definitions are in `data/LICENSE-geonames.txt` and https://download.geonames.org/export/zip/readme.txt.
- A visible website attribution should link **[GeoNames](https://www.geonames.org/)**, mention **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)**, and indicate that records were normalized/combined. This geographic dataset keeps its own license; do not relabel it as GPL-only.

## Files and schema

- `data/us-stores.json`: 269 catalog stores, unique Apple store IDs, names/slugs, street-address text, city, state, state code, ZIP and derived `lat`/`lon`. Both `id` and `number` contain the Apple store code. `url` links to its official Apple retail page.
- `data/products.json`: eight distinct iPhone Duo part numbers, covering 256GB / 512GB / 1TB / 2TB in Star White and Night Sky. Duplicate purchase-page rows (for payment/carrier choices) were removed by exact part number. Titles and colors remain Apple's display strings. These are valid catalog candidates, not stock claims.
- `data/us-zips.json`: 41,488 five-digit ZIP records, with `city`, alternate `cities`, state/state code and published geographic estimates. Leading zeros are preserved. Averages are used for duplicate ZIP entries; alternate place names are retained.
- `data/zip-index.json`: a compact client-side lookup object, `ZIP -> [latitude, longitude, city, stateCode]`. It can be served as a cacheable static asset; user ZIP searches need not call Apple or write D1.
- `data/metadata.json`: import timestamp, counts, source URLs, licenses, and SHA-256 of the normalized downloaded text.

## Geographic accuracy and coverage

All 269 stores join to a known ZIP. Coordinates are **postal-code location estimates**, not verified store entrances, mall locations, or routing points. Each store declares `coordinatePrecision: "zip_centroid_estimate"`; the source ZIP record declares `precision: "postal_code_estimate"`. GeoNames documents that some coordinates are inferred from place names or neighboring ZIPs. No store's coordinate has been presented as a precisely geocoded Apple address.

Use Haversine straight-line miles for 50 / 100 mile filters and label distances as approximate. Boundary cases can differ from real entrance-to-entrance distance. Do not present these as driving distances or travel times. A future official-store coordinate refresh can replace individual estimates with a separately identified source.

The snapshot contains stores in 45 state/DC codes. “All US stores” on the site means all known stores in this imported US catalog, not a certification that Apple has no newly opened/closed stores. A state with zero catalog stores is not an inventory failure.

## Polling hubs: suggestions, not proven response coverage

`polling-hubs.json` gives a conservative **61-hub** geometric proposal: for each candidate store ZIP, take up to 12 nearest known stores within 100 straight-line miles, then greedily cover all 269 IDs. `polling-hubs-wide.json` gives a looser **31-hub** proposal with the same assumed nearest-12 response but no geographic distance cutoff. Some wide hubs span hundreds/thousands of miles and are especially speculative.

Neither plan queried Apple's inventory endpoint. Apple's actual returned stores may differ in count, distance, eligibility or order. These plans **must not be treated as demonstrated national coverage or a guarantee that 61 (or 31) requests are sufficient**.

A correct collector should:

1. Send a scheduled, budgeted query for a hub and its chosen SKU batch.
2. Record only stores/SKUs actually present with a parseable availability result.
3. Measure returned coverage and learn a new hub coverage set from successful responses.
4. Mark absent stores/configurations `unknown`/`unobserved`, never out of stock.
5. Queue budgeted per-store or alternate-location fallback requests for genuinely missing IDs.
6. Persist last successful observation timestamps separately per store/SKU and expose staleness, cooldowns and partial coverage.

The eight Duo SKUs fit a single SKU batch under the previous app's validated 20-SKU batching constraint, but national location coverage still needs multiple requests. At 61 successful hub requests per minute, the geometric proposal would imply 87,840 requests/day; the 31-hub proposal implies 44,640/day. Those are arithmetic estimates, not validated safe polling rates. Do not start at that rate or promise “never blocked.”

## Validation performed

- Exact catalog count: 269 unique store IDs; zero missing ZIP joins.
- Product count: eight unique iPhone Duo part numbers; four capacities and two colors.
- ZIP count: 41,488 unique five-digit codes; valid numeric coordinates in latitude/longitude ranges.
- Both geometric hub proposals cover every known store ID in their *planned* sets.
- No inventory endpoint was called and no live stock was fabricated during data preparation.


## Offline U.S. state boundary map

`data/us-states-topology.json` was downloaded on 2026-10-25 from the pinned **us-atlas 3.0.1** package:

- File: https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json
- Project and provenance: https://github.com/topojson/us-atlas
- Package metadata: https://registry.npmjs.org/us-atlas/3.0.1
- Original download SHA-256: `d76b391ccfa8bff601d51e3e3da5d43a89fa46cd5caca72ce731b383be5596d0`

This is the **unprojected** `states-10m.json` topology with `objects.states` and `objects.nation`, containing 56 state/territory features, including Alaska and Hawaii. It is quantized and simplified from the **U.S. Census Bureau's 2017 cartographic boundary shapefiles**, not a new 2026 boundary survey. The source describes the provenance at https://github.com/topojson/us-atlas#states-10mjson and links the Census cartographic boundaries at https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html.

The us-atlas package's declared license is **ISC**. Retain the following copyright and permission notice when redistributing the package-derived topology. This license is separate from the GeoNames postal-coordinate attribution and the imported catalog's GPL notices.

```text
Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

For the site's store map, convert `topology.objects.states` with `topojson-client.feature`, then project both boundaries and the actual `[store.lon, store.lat]` points with the **same** `d3-geo` `geoAlbersUsa` projection. Do not position markers using arbitrary screen coordinates. Alaska/Hawaii use the composite projection's insets; any point for which the projection returns `null` should be omitted from that map while remaining visible in the list. Store coordinates still have the ZIP-estimate precision described above. The topology can be self-hosted as a static asset, with no runtime map-tile API or third-party map requests.
