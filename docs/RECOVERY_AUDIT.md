# Recovery 1.0 - Milestone 0 audit (2026-11-26)

Branch: `recovery/1.0`, made from `main` at 617cec2. Nothing in the game has been changed yet. This is the audit and the plan, as the brief asks.

## 1. Baseline tests

- `npm test` on `main` (default 5 s timeout): 1030 passed, 2 skipped, **1 failed**.
- The one failure is `tests/balance_upgrades.test.ts` > "the other shopping plans give the same kind of relief...". It runs three 30-seed simulations and takes 5.0-5.7 s on this machine, just over the default 5 s limit. This is a **test speed problem**, not a gameplay regression: the same test passes with a longer limit and the numbers it checks are unchanged.
- The brief also mentions two failing comparison assertions in that file. They **pass here** (seeded, repeatable). I cannot read the CI log from this session (GitHub access is not enabled), so I cannot see which commit failed. They are probably from an older commit. The fix for the timeout is an explicit longer timeout on that one test (not weakening any check).

## 2. How progression works today (verified in code and data)

- One **global Lv** (save field `level`, XP curve in `data/xp.json`, `xpForLevel` in `src/game/config.ts`).
- **Spooky Diner**: dishes unlock by global Lv in `data/progression.json`. Six dishes: Fries (Lv 1), Burger (2), Nuggets (4), Pizza (5), Drink (6), Ice cream (8). Lv 3, 7, 9, 13, 14, 16, 20 add seats or customer types. **Lv 9 to Lv 29 add no new dish.**
- **Taco Truck**: opens at Lv 10 (1,500 coins). It has its **own menu track**, steps 1-10 (`tacoStep`, `tacoXp` in the save). 18 dishes, 1-2 new dishes per step.
- **Pizza Place**: opens at Lv 30 (3,000 coins). It has its **own menu track**, steps 1-10 (`pizzaStep`, `pizzaXp`). 17 dishes, 1-2 new dishes per step.
- So rules "each restaurant has its own recipe progression", "unlocking in one restaurant does not unlock in another" and "switching restaurants keeps progress" are already how the game is built. I will add tests that prove it, not change it.
- First-dish introductions: Taco and Pizza already use `introNeedsServes: 2` and `practiceServes: 3`, which matches the brief (2 servings, never more than 3). I will verify this with a test.
- Menu steps already cost less in the early steps (`src/game/menuPace.ts`, done earlier on `main`).

## 3. The key problem: "every level gets a new recipe" cannot be met with today's catalogue

| Restaurant | Real dishes | New-dish moments |
|---|---|---|
| Spooky Diner | 6 | 6 (Lv 1-8) |
| Taco Truck | 18 | 10 (steps 1-10) |
| Pizza Place | 17 | 10 (steps 1-10) |

That is 26 recipe moments for 49+ global levels. The brief says not to invent dishes without artwork and mechanics, so a new dish at every global Lv is not possible without new art. The biggest gap is the diner after Lv 8 (21 levels in a row with no new dish).

Already in the project, unused by any dish: `cheese`, `onion` and `pickle` images (`data/assets.json`, lazy) and a diner **Prep station** zone that unlocks at Lv 10. I have not yet checked whether this art is suitable or what the Prep station does. These could carry diner dish variants (for example cheeseburger) with no new art. This still needs checking.

## 4. XP curve

XP needed to leave each Lv, today: Lv 1: 100, 2: 260, 3: 250, 4: 300, 5: 350, 6: 400, 7: 450, 8: 500, **9: 820**, 10: 900, then +80 per Lv.

- Lv 8 to Lv 9 jumps **+64%** (500 to 820) because the gentler early curve (+50 per Lv) ends at Lv 8 and the normal curve (+80 per Lv) starts at a higher base.
- Lv 2 (260) costs more than Lv 3 (250), a small dip.
- Proposal: blend the two curves over Lv 8-12 so the cost rises smoothly, and re-run the pace simulation so Lv 20 timing stays close to today.

## 5. Customers and difficulty

- Diner customer types arrive at Lv 9 (impatient), 14 (VIP) and 16 (critics). The diner difficulty is flat from Lv 13.
- Unmerged branch `feature/diner-late-ramp` (4th seat at Lv 11, faster patience and arrival ramp for Lv 11-20, diner only) addresses part of the "fair difficulty" goals. It is not in this branch.

## 6. Saves

`SaveData` is version 2 with defaults for missing fields (older saves load fine). New save fields must be optional with defaults, and I will add migration tests.

## 7. Analytics

- Nothing exists today. The SDK wrapper only calls gameplay start and stop and the ad breaks.
- I am not aware of a custom-event API in the CrazyGames HTML5 SDK, and the brief forbids adding tracking services. Without somewhere to send events, in-game events cannot answer "where do players stop". CrazyGames' own dashboard already gives plays, play time, retention and conversion.

## 8. Performance and loading

- CrazyGames build: about 5.8 MB at start (target under 20 MB), average load 1.8 s on the dashboard, crash rate 0.36%. Loading is already good.
- Earlier asset optimisation found only about 0.5% safe saving (`docs/ASSET_OPTIMIZATION_REPORT.md`).
- Restaurant art already loads per scene (Taco and Pizza load their backgrounds in their own scenes; 53 of 83 registered assets are lazy).
- Conclusion: Milestone 5 should be a measured runtime check (timers, listeners, memory on a phone-sized screen), not a large optimisation.

## 9. Proposed plan and files

- M1 progression: `data/progression.json`, `data/recipebook.json`, `data/intros.json`, new "next unlock" helper in `src/game/`, tests `tests/recovery_progression.test.ts`.
- M2 XP and balance: `data/xp.json`, `src/game/config.ts` (curve), balance tests and a before/after report.
- M3 UI: `src/scenes/RecipeBookScene.ts`, level-up screen in `GameScene.ts`, `RestaurantSelectScene.ts` (small changes only).
- M4 analytics: new `src/telemetry/` (isolated, never blocks gameplay).
- M5 performance: measurements first.
- M6 regression: all tests, CrazyGames and Poki builds, smoke tests.
- Test fix now: explicit timeout on the one slow test.

## 10. Decisions needed before M1

1. Diner content after Lv 8: which route?
2. Analytics: where should events go?
3. Include `feature/diner-late-ramp` in the recovery work?
