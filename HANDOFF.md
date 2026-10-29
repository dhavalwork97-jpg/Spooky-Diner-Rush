# HANDOFF

Last saved by: (nobody yet)
Last saved at: -

## Goal
Chef Rush: a browser restaurant game (serve customers, fryer/grill/oven, coins, XP, levels). Built in milestones; Milestone 3 is done, Milestone 4 (shop and progression systems) is next.

## Done so far
- Milestone 3 complete, open as PR #5 (targets main, not yet merged): https://github.com/dhavalwork97-jpg/Chef-Rush/pull/5
- Combo system: fast consecutive serves build a combo up to 8; +10% coins/XP per step, capped at x1.5; breaks on a slow serve or an angry customer leaving.
- Rush tag: red tag while the customer is fresh; serving then doubles the tip and gives bonus XP.
- Wrong item: item snaps back, customer shakes and loses patience; no coin or reputation cost.
- Customer types in data (impatient, VIP, critic); regular customers only for Lv 1-10; VIPs unlock at Lv 14, 17, 19 (VIP visit event shows them early).
- Events (one at a time, calm moments only): lunch rush, double coins, slow oven, VIP visit.
- Waves: calm -> build -> rush -> calm; bonus for ten serves in a row with no burn or angry customer.
- Progression Lv 6-10: three customers at once from Lv 7; tutorial hand only Lv 1-2.
- Shop hooks: game reads fryer/grill/oven speed, patience and tip modifiers (ready for the M4 shop to set them).
- XP formula changed to 100 + 80 x level; nuggets at Lv 4, pizza at Lv 5.
- Verified: 77 unit tests pass (21 new); bot reaches Lv 10 in 8-9 min; browser check of banner, combo meter, Rush tag, chips, floating text; 5 game minutes at 10x speed with no errors.

## In progress (exact stopping point)
- Nothing started on Milestone 4. Waiting for the owner's go-ahead.

## Next steps (ordered)
1. Get go-ahead, then merge or confirm PR #5.
2. Milestone 4: shop and upgrades, decor, RecipeBook, RestaurantSelect, career titles, story cards, chef's speech bubbles.
3. Check the unverified items below.

## Decisions & constraints
- Failure modes should stay user-friendly (no punishing wrong-item serves).
- Keep tests passing (77 currently).

## Not verified yet
- Pacing with a human player (numbers are from the bot only)
- Wrong-item shake animation on screen
- Double coins, slow oven and lunch rush visuals
- Sound
- Phone performance
