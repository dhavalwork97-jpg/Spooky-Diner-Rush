# Taco Truck order variety: before and after

Measured on 2026-11-20 with `tests/taco_variety.test.ts` and `tests/helpers/tacoVarietySim.ts`. Re-create with:

`TACO_VARIETY_REPORT=1 npx vitest run tests/taco_variety.test.ts -t "prints the distribution tables"`

Method: 40,000 customer orders per menu step for each version, every dish on that step's menu already learned (steady state), same data otherwise. "Before" is the plain weighted random pick the truck used until now; "after" is the new pick (recent-order memory, kind balance, no duplicate dish inside one order while another dish exists, gentler three-item orders). The real regulars, drinks and station limits run in both.

## Repetition by menu step

| Step | Dishes | Same first dish as previous customer | Any dish repeated from previous customer | Same dish twice in one order | 3rd+ in a row of the same dish kind | Orders with 3 items |
|---:|---:|---|---|---|---|---|
| 1 | 1 | 72.4% → 72.6% | 72.4% → 72.6% | 36.3% → 35.6% | n/a (one kind) | 3.5% → 3.5% |
| 2 | 2 | 36.0% → 29.6% | 48.3% → 49.8% | 19.2% → 1.7% | n/a (one kind) | 3.5% → 3.5% |
| 3 | 4 | 20.4% → 9.3% | 41.7% → 23.1% | 19.9% → 0.0% | n/a (one kind) | 36.0% → 15.4% |
| 4 | 6 | 14.1% → 6.5% | 32.5% → 17.3% | 12.7% → 0.0% | 32.7% → 16.1% | 36.2% → 23.6% |
| 5 | 8 | 10.2% → 4.8% | 25.2% → 13.3% | 9.6% → 0.0% | 24.4% → 14.5% | 36.2% → 28.0% |
| 6 | 9 | 9.2% → 4.1% | 23.2% → 11.8% | 9.0% → 0.0% | 17.1% → 6.9% | 36.8% → 29.0% |
| 7 | 10 | 8.3% → 3.4% | 21.5% → 10.0% | 8.0% → 0.0% | 13.5% → 5.0% | 37.0% → 28.7% |
| 8 | 12 | 6.9% → 2.7% | 18.7% → 8.0% | 6.5% → 0.0% | 10.6% → 4.4% | 37.0% → 28.7% |
| 9 | 14 | 6.0% → 2.2% | 15.6% → 6.5% | 5.6% → 0.0% | 7.0% → 2.2% | 36.7% → 28.8% |
| 10 | 16 | 5.3% → 2.0% | 14.5% → 5.8% | 5.0% → 0.0% | 6.1% → 1.9% | 36.8% → 28.7% |

## Drinks and coverage

| Step | Drinks, share of items | Least-ordered dish vs a fair share (1.00 = even) | Regulars: share of customers, different regulars seen |
|---:|---|---|---|
| 1 | 25.0% → 25.0% | 1.00 → 1.00 | 0.0% / 0 → 0.0% / 0 |
| 2 | 25.0% → 25.0% | 1.00 → 1.00 | 0.0% / 0 → 0.0% / 0 |
| 3 | 24.8% → 25.1% | 1.00 → 1.00 | 0.0% / 0 → 0.0% / 0 |
| 4 | 23.7% → 24.1% | 0.95 → 0.88 | 10.0% / 5 → 10.0% / 5 |
| 5 | 23.9% → 24.2% | 0.93 → 0.94 | 9.9% / 5 → 9.9% / 5 |
| 6 | 23.9% → 24.3% | 0.94 → 0.89 | 9.8% / 6 → 9.8% / 6 |
| 7 | 23.8% → 24.3% | 0.94 → 0.87 | 10.3% / 6 → 10.3% / 6 |
| 8 | 23.6% → 24.4% | 0.91 → 0.93 | 9.8% / 6 → 9.8% / 6 |
| 9 | 24.0% → 24.4% | 0.91 → 0.88 | 9.8% / 6 → 9.8% / 6 |
| 10 | 23.5% → 24.1% | 0.91 → 0.92 | 9.9% / 6 → 9.9% / 6 |

## Per dish share of all items, step 10 (16 dishes, fair share 4.5%)

| Dish | Before | After |
|---|---:|---:|
| chicken_burrito | 4.5% | 4.6% |
| chicken_nachos | 4.4% | 4.6% |
| chicken_soft_taco | 5.2% | 5.1% |
| chicken_taco | 5.3% | 5.1% |
| fish_burrito | 4.4% | 4.5% |
| fish_nachos | 4.5% | 4.6% |
| fish_soft_taco | 5.2% | 5.0% |
| fish_taco | 4.5% | 4.5% |
| shrimp_burrito | 4.4% | 4.4% |
| shrimp_nachos | 4.7% | 4.6% |
| shrimp_soft_taco | 5.3% | 5.2% |
| shrimp_taco | 4.5% | 4.4% |
| veggies_burrito | 5.3% | 5.3% |
| veggies_nachos | 4.5% | 4.5% |
| veggies_soft_taco | 4.5% | 4.4% |
| veggies_taco | 5.5% | 5.2% |

## Learning a new dish (perfect server, 200 customers from the start of each step)

| Step | New dishes | First ordered at customer | Learned (served 3 times) by customer | Orders mixing a first-time dish with other items | Orders with two unlearned dishes |
|---:|---|---|---:|---:|---:|
| 1 | 1 | veggies soft taco #1 | 2 | 0 | 1 |
| 2 | 1 | chicken soft taco #1 | 4 | 0 | 0 |
| 3 | 2 | shrimp soft taco #1, fish soft taco #4 | 9 | 0 | 0 |
| 4 | 2 | chicken taco #1, veggies taco #9 | 18 | 0 | 0 |
| 5 | 2 | shrimp taco #1, fish taco #8 | 35 | 0 | 0 |
| 6 | 1 | veggies burrito #1 | 6 | 0 | 0 |
| 7 | 1 | chicken burrito #1 | 13 | 0 | 0 |
| 8 | 2 | shrimp burrito #1, fish burrito #6 | 49 | 0 | 0 |
| 9 | 2 | chicken nachos #1, veggies nachos #12 | 37 | 0 | 0 |
| 10 | 2 | shrimp nachos #1, fish nachos #22 | 49 | 0 | 0 |

At step 1 the only dish can be ordered twice in one practice order, so the last column reads 1 there; that is the same dish twice, not two different new dishes.

## What this shows

- Back-to-back repeats fall by roughly half or more from step 3 up (any dish repeated from the previous customer: 41.7% → 23.1% at step 3, 25.2% → 13.3% at step 5, 14.5% → 5.8% at step 10).
- A customer no longer gets the same dish twice while another dish can be offered (0% at steps 3 and up; at step 2 only 1.7% remain because of the first-time dish rules).
- Long runs of one dish kind drop about 3x at steps 7 to 10, with no kind shut out.
- Every dish stays in rotation. The least-ordered dish is 87% to 94% of a fair share, a little lower than before at some steps because kinds with fewer dishes (burritos, nachos) are nudged up on purpose when they are under-used.
- Drinks stay at about the 25% setting. Regulars still arrive about one customer in ten and all six turn up.
- Three-item orders are fewer (about 37% → 29% at the busy steps, 36% → 15% at step 3). Extra items from VIP-type customers still count, so the share is above the plain setting.
- Steps 1 and 2 cannot get more varied by weighting, because the menu holds one and two dishes. That needs more dishes, not a different pick.

## Economy check (existing `tests/taco_midnight_report.test.ts`, 6 seeds, 2400 s)

Time to reach each menu step and the coins earned are within noise of the old pick (step 3, fast bot: 363 s → 352 s, about 2,800 coins in both; step 6, fast bot: 1,275 s → 1,233 s, about 7,700 coins in both). The variety change does not slow the truck's progression or its income in this measurement. Six seeds is a small sample.

