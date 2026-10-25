# Request-outcome analysis (2026-10-25)

All stock requests use the same API route, `https://www.apple.com/shop/retail/pickup-message`. Regional ZIP changes the `location` query parameter. The same eight iPhone Duo SKUs and request flags are used. Distinct regions are not distinct endpoint paths, but that alone does not identify Apple's internal limiting key.

The 14:27:53 PDT Mac full-country attempt planned 36 requests but sent only 29: requests 1–27 succeeded; request 28 (`60642`, 14:31:23) and 29 (`91423`, 14:31:31) returned 541. The old collector's heuristic then stopped the round. Requests 30–36 were not sent and must not be described as failed.

Earlier Cloudflare collection had interleaved results: `95123` returned 541 at 13:22:49, then `98409` succeeded about 14 seconds later. `76107` failed at 13:56:15, then `45236` succeeded about 30 seconds later. `92260` failed at 13:58:46, then `89801` succeeded about 31 seconds later. The Cloudflare outbound IP for each request was not recorded, so these are evidence of mixed outcomes, not proof of per-region buckets on a single IP.

Many of the same ZIPs have both 200 and 541 results over time. No fixed request-number cutoff or per-region quota can be derived from these samples. The local full-rate burst is consistent with a broader cross-region restriction, but frequency, rolling-window count, IP and other server criteria cannot be distinguished from the existing records. New logs preserve additional timing, round, transport, Retry-After and decision-reason fields to support better analysis.

## Subsequent all-region check

After applying region-only failure handling, the Mac continued at the reduced budget. Between 14:46:03 and 14:55:48 PDT it made 36 requests to 36 distinct ZIPs: all 34 currently planned coverage regions, plus two learning proposals. Every response was 541, and the parsed Retry-After value was zero on each. The final request triggered `all-regions-failed`; the collector did not stop after only the first two. This demonstrates a broad cross-region rejection during that interval, while still not identifying whether the server limit is keyed by IP, request rate, rolling-window count or another property.
