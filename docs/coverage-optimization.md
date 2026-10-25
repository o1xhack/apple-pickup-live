# Coverage planning

The five-minute cadence is a target, not a claim that all 269 stores were successfully checked every five minutes. Request budgets and Apple cooldowns take precedence. A failed, missing, or geometrically predicted store never gains a successful observation.

`compactVerifiedCoverage` removes redundant ZIP queries using only actual successful response membership. On the 45 learned regions available on October 25, this preserves all 269 stores with 40 queries, versus the previous greedy pass's 42. The set is recomputed after newly learned coverage, so it can shrink or adapt without certifying predictions.

`data/learning-hubs.json` contains geography proposals based on nearest stores and a 250-mile approximation. In calibration, 435/442 store memberships matched, but only 38/45 complete regional sets matched exactly; boundary differences require real verification. A predicted 29-region tour remains unverified. Tonopah and Elko are tested first during normal scheduled work; Elko has a close radius boundary and must retain fallback coverage for Reno.

At most one normal request per round is replaced by a learning candidate. This uses the existing adaptive budget, is persisted, does not retry failed learning candidates, and honors regional/global cooldowns. A failed prediction quarantines only its query ZIP, not guessed store membership. Only successful validated responses update actual coverage. Original store ZIPs and polling hubs remain fallback candidates. Unvisited stores take priority across rounds; no burst is sent to catch up after cooldown.

The current maximum budget is 36 requests per five-minute round, and blocking can lower it. Forty verified regions cannot all fit under that ceiling. Reducing overlap is the route toward five-minute coverage; raising concurrency, ignoring cooldowns or assuming predicted membership is not. `verifiedRegionCount` and `estimatedCoverageSeconds` in collector health expose the current planning lower bound under its budget, excluding request failures/cooldowns and learning overhead.

Deployment validation is queued in persisted collector health as `deploymentValidation`. Its `notBefore` preserves any active cooldown; the collector wakes at the earlier of its normal heartbeat or cooldown expiry, and validates through normal scheduled requests. It records actual attempts, covered stores, errors and the first response, marking a round `passed` or `degraded`. A passed round is not a guarantee of nationwide five-minute coverage. A process restart does not reset the queue, cooldown or request budget.

## Full-country five-minute target

The Mac collector now uses a fixed, verified regional tour when actual learned membership covers all 269 stores. At activation it replaces the inherited Cloudflare-throttled budget once with the number of required regional requests (bounded at 36). A cooldown delays activation; later blocks still reduce the budget and are not overwritten by the target setting. The full-country window takes priority over learning new regions. Queries remain serial, evenly paced, with 20 seconds reserved for the final response/publication.

`health.currentCoverageRound` reports actual progress. `health.lastCoverageRound` retains start/end, elapsed time, requests, actual covered stores, errors and missing store IDs. Only all 269 stores actually observed inside 300 seconds produces `status=complete`; time overruns, changed membership, budget limits or blocking remain partial. This is a measured coverage goal, not a promise to defeat upstream rate limits. Offline tests include a recorded public regional-membership fixture covering the entire catalog.
