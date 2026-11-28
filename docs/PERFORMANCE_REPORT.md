# Recovery 1.0 — performance measurement and safe optimization

## Baseline from the Recovery 1.0 source archive

Static asset accounting from data/assets.json and the matching public files:

- 79 manifest assets: 37 eager and 42 lazy.
- Eager manifest images: 2,671,267 bytes (2.55 MiB).
- Lazy manifest images: 5,354,480 bytes (5.11 MiB).
- Total public directory: 21,444,697 bytes (20.45 MiB, 222 files).
- The seven burger-variant images added for the Level 10 diner progression account for 220,380 bytes (215.2 KiB). All seven were initially eager.

The source-archive baseline build before the M4/M5 completion pass reported:
- Standard app JS: 475.74 kB (140.18 kB gzip).
- Phaser chunk: 1,367.08 kB (357.00 kB gzip).
- CrazyGames app JS: 475.29 kB (140.00 kB gzip).
- CrazyGames Phaser chunk: 1,367.08 kB (357.00 kB gzip).

These are build-size measurements, not a substitute for mobile runtime profiling. The repository's audit reported a prior CrazyGames load time around 1.8 seconds and a 5.8 MB startup download estimate; no new device-level timing or heap measurement is claimed here.

## Change

The seven burger-variant images are now lazy manifest assets. The diner requests them at Lv 9 (one level before their Lv 10 unlock), so existing players do not download them on initial boot and the art is ready before the new recipes become available. The normal game logic, orders, rewards, and CrazyGames SDK are unchanged.

The maximum startup transfer avoided by this change is 220,380 bytes (215.2 KiB), about 8.3% of the previous eager manifest bytes. The total public package size is not reduced; the assets are fetched later when needed.

## Remaining measurement limits

- CI verifies the standard and CrazyGames builds, not network waterfalls, FPS, memory, or touch latency on a phone.
- Browser/device profiling and a manual Lv 9 → Lv 10 visual check remain owner QA items.
- No speculative engine, renderer, physics, or gameplay changes were made.

## After M5 on recovery/1.0

The final successful verification run (GitHub Actions run 45927213836) confirms:

- Manifest: 30 eager and 49 lazy assets (79 total).
- Eager manifest images after the change: 2,450,887 bytes (2.34 MiB).
- Lazy manifest images after the change: 5,574,860 bytes (5.32 MiB).
- Deferred from initial load: 220,380 bytes (215.2 KiB), 8.3% of the previous eager manifest image bytes.
- Standard app JS: 481.86 kB (142.21 kB gzip); Phaser chunk unchanged at 1,367.08 kB (357.00 kB gzip).
- CrazyGames app JS: 481.41 kB (142.05 kB gzip); Phaser chunk unchanged at 1,367.08 kB (357.00 kB gzip).
- Uploaded CI artifact: 20,251,326 bytes. This is a GitHub Actions artifact only, not a CrazyGames submission.

The small JS increase versus the archive baseline includes the new local analytics and lazy-image loader code. The 215.2 KiB change defers image loading; it does not shrink the complete downloadable package.
