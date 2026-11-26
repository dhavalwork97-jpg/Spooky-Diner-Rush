# Recovery M2 - XP smoothing and restaurant unlock timing

Measured with the seeded bots in `tests/xp_pace.test.ts` (`XP_REPORT=1 XP_SECONDS=5400 XP_SEEDS=4 npx vitest run tests/xp_pace.test.ts`).
Bots: fast (0.8 s reaction), average (1.3 s), casual (2.0 s). Numbers are minutes of continuous play to reach the Lv, with shop upgrades. They are a bot's pace, not real players: real sessions are about 13 minutes and include pauses.

## XP to leave each Lv

| Lv | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Before | 100 | 260 | 250 | 300 | 350 | 400 | 450 | 500 | **820** | 900 | 980 | 1060 | 1140 | 1220 | 1300 | +80 per Lv |
| After  | 100 | 200 | 250 | 300 | 350 | 400 | 450 | 500 | 570 | 660 | 750 | 860 | 990 | 1130 | 1300 | unchanged |

- Removed the Lv 2 > Lv 3 dip (260 > 250) and the +64% jump at Lv 8 > 9 (500 > 820). Biggest step now is +25% (Lv 2 > 3) then 20%, 17% ... and about 15% through Lv 15.
- Lv 15 and later are identical, so Taco Truck and Pizza Place menu-step costs (they borrow Lv 15-24) did not change.
- Set in `data/xp.json` as `levelXp` (explicit table for Lv 1-15); the old formula still sets Lv 16+.

## Pace, average bot, with upgrades (minutes)

| Lv | 10 | 15 | 20 |
|---|---|---|---|
| Before | 10.2 | 32.6 | 62.7 |
| After | 9.2 | 28.6 | 59.9 |

Fast bot: Lv 10 6.9 > 5.9, Lv 15 18.3 > 14.5, Lv 20 33.2 > 29.0, Lv 30 79.0 > 76.3. Casual bot: Lv 10 16.9 > 16.6, Lv 15 54.3 > 49.0.

## Restaurant unlocks

| Restaurant | Before | After | Why |
|---|---|---|---|
| Taco Truck | Lv 10, 1,500 coins | unchanged | Reached about minute 9 (average bot): inside a first session. Its own 10-step menu keeps players busy for a long time. |
| Pizza Place | Lv 30, 3,000 coins | **Lv 20**, 3,000 coins | Lv 30 needs 76+ minutes even for the fast bot; almost nobody would ever see it. Lv 20 is about 29 min (fast) / 60 min (average): a goal for returning players, after most of the Taco track. Coins are not the limit (about 3,000 coins on hand by Lv 15 even after shopping). Lv 20 is also the Kitchen Boss title and full diner seating. |

Existing saves: nothing is lost. A player already past Lv 20 who did not own the Pizza Place can now buy it. Coin cost unchanged.
Not verified: real players' pace (bots only); no device testing.
