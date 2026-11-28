# Recovery 1.0 — on-device analytics

Recovery 1.0 records aggregate gameplay counters in the browser's localStorage key
spooky-diner-rush-local-analytics.

## Privacy and boundaries

- No analytics network requests, third-party trackers, player IDs, names, emails, raw event history, or ad data.
- Only aggregate counts and foreground active-play milliseconds are stored.
- Data stays in the current device/browser profile. It is not synced between devices.
- Debug and automated test sessions are excluded.
- If localStorage is blocked or full, the game continues; analytics are best-effort and never block play.
- Resetting analytics does not reset the game save.

## Recorded funnel counters

- Session starts/ends and foreground active time.
- Restaurant entries (Diner, Taco Truck, Pizza Place).
- Global levels reached and each restaurant's menu steps reached.
- Recipe Book opens.
- Dish deliveries and completed orders.
- Closed and reopened kitchen counts.

## Export during local testing

Open the browser developer console and run:

    JSON.stringify(window.__chefRushAnalytics.snapshot(), null, 2)

Copy the returned JSON for a local playtest report. To clear only these analytics counters:

    window.__chefRushAnalytics.reset()

The debug helper is installed only in a browser page. It is not a user-facing menu or a remote dashboard.
