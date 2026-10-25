# ManzanaTracker comparison (2026-10-25)

Sources: [How it works](https://manzanatracker.com/guides/how-manzanatracker-works),
[pricing FAQ](https://manzanatracker.com/pricing),
[terms](https://manzanatracker.com/terms),
[Duo stock](https://manzanatracker.com/stock/iphone-duo),
[Duo history near 95125](https://manzanatracker.com/stock/iphone-duo?view=history&zip=95125).

Their published frequency is about five minutes for models with active alerts;
opening a product can recheck a result older than five minutes. It is not a
promise that every US store/configuration is successfully sampled every five
minutes. Public free lookups have hourly limits; we did not automate repeated
refreshes, create accounts or evade those limits.

The stock page exposes a History view scoped to the nearby stores for a ZIP.
The inspected 95125 view returned no change records; the default 10001 response
also supplied an empty history list. The national summary is aggregated and does
not reveal the number or exact timestamps of all individual queries. No documented
public national 24-hour event export was found in the inspected pages.

No third-party rows have been imported as our scans. A five-minute advertised
schedule cannot be expanded into invented check timestamps/counts. If factual
source events become available, import them with source, original time, store,
configuration and observation state; keep them out of our successful scan totals.
An empty scoped history does not establish that the entire country had no stock.

Our observed 20-minute zero-scan gap came from our global cooldown after one 541,
not an Apple-documented nationwide shutdown. The collector now uses per-region
backoff, an escalation rule for repeated blocks, persistent coverage and paced
requests. Current stability must be judged from subsequent real observations.
