# THE GAME IS WATCHING YOU

A zero-cost, browser-native puzzle game about the habits you bring into a room. The observer uses deterministic authored rules, not an LLM, and only tracks in-game actions.

## Play locally

No install or build step is required. Open index.html in a modern browser or use a static server. Optional Node smoke tests:

~~~bash
npm test
npm run serve
~~~

Then visit http://localhost:8080.

## Controls

- Move: Arrow keys or WASD
- Interact with a nearby console: E or Space
- Restart room: R
- Reveal a clue: H or the Field Note button
- Touch devices: use the on-screen direction pad

## Rooms

1. **It Knows You** — repeat a direction and the route temporarily closes; vary movement and wait.
2. **Stop Rushing** — three quick moves wake the corridor sensor; let it cool before finishing.
3. **Your Favourite Button** — find the console and interact once.
4. **Insanity Is Repeating** — repeatedly test the same blocked direction to reveal a passage.
5. **You Taught It Everything** — combine calm movement, a varied route, and one deliberate console interaction.

Every room has a direct clue. No random traps or paid AI services are used.

## Current MVP boundaries

- Static HTML/CSS/JavaScript prototype with canvas rendering; no backend, cloud save, analytics, or external asset dependency.
- Not yet tested across a full browser/device matrix or submitted to CrazyGames.
- CrazyGames SDK, ads, and platform-specific integrations are intentionally deferred until current official requirements are verified.
- Indie Game Control Center remote feature flags are not connected; puzzle logic runs locally.

## Next validation steps

1. Run npm test.
2. Play all five rooms using keyboard and touch.
3. Check mobile sizing, accessibility, and browser console errors.
4. Review current official CrazyGames submission requirements before packaging or adding platform SDK calls.