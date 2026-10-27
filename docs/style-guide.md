# Chef Rush: Style Guide (draft for approval)

One rule above all: every asset must look like it came from the same hand. If an asset breaks a rule here, fix the asset, not the rule.

## 1. Canvas and scale
- Logical canvas: **1280 x 720**, landscape, Phaser `Scale.FIT` with centered letterboxing.
- Safe area: keep all interactive UI at least 48 px from every edge (phone notches, rounded corners).
- Minimum tap target: **88 x 88 logical px** (about 9 mm on a mid-range phone).
- Textures are generated at `2x` (or device pixel ratio, capped at 2) so outlines stay crisp, then cached by key.

## 2. Outline and shape
- **Outline width: 6 px at 1x** on every object, character, icon and UI element. No exceptions, no thin lines.
- Outline color: `#3B2417` (warm dark brown, never pure black).
- Line joins and caps: round.
- Corners: rounded. Default radius 16 px for panels, 12 px for buttons, 50% for icons and bubbles.
- Shapes are simple and chunky: few details, strong silhouettes, readable at 64 px.

## 3. Palette (warm, limited)
| Role | Hex | Use |
|---|---|---|
| Outline | `#3B2417` | all outlines, text shadow |
| Cream | `#FFF3DC` | panels, ticket cards, plates |
| Butter | `#FFD66B` | coins, highlights, stars |
| Tomato | `#E8483B` | alerts, ketchup, angry, danger |
| Orange | `#F58A2E` | primary buttons, fries, fire |
| Leaf | `#6BBF4E` | success, lettuce, ready ring |
| Bun | `#D9923B` | buns, wood |
| Patty | `#7A3E22` | cooked patty (raw `#C8665A`, burnt `#2B1A14`) |
| Teal | `#2FA7A0` | diner theme accent, secondary buttons |
| Sky | `#8FD3F4` | drinks, water, info |
| Steel | `#B9C0C9` | stations, metal, shadows on steel |

- Taco stand theme swaps the accent to `#E0643C` (terracotta) and `#F2B134` (marigold); the neutrals and outline stay the same.
- Gradients: at most a 2-stop, 8 to 12 percent lightness shift, top to bottom. Highlight is a small cream-white (`#FFFFFF` at 35 percent) shape on the upper-left.
- Shadows: soft drop shadow, offset (0, 6 px), blur 10 px, `#3B2417` at 25 percent. Contact shadow under items is a flat ellipse at 20 percent.

## 4. Typography
- One font family everywhere: a rounded, friendly display face (proposal: **Fredoka**, SIL OFL, self-hosted, Latin subset, about 20 KB). Needs your approval because it adds a font file.
- Fallback stack: `"Fredoka", "Baloo 2", "Nunito", system-ui, sans-serif`.
- Sizes (logical px): body 28, labels 24, buttons 36, headings 56, big numbers 72. Never below 24.
- Text is cream with a 6 px outline-colored stroke and a 3 px drop shadow, so it reads on any background.

## 5. Ingredients (layered, each its own texture)
- Standard ingredient footprint: 128 x 128 px canvas at 1x, centered, flat side-on view for the burger stack and top-down for stations.
- States are separate textures, not tints: patty raw / cooked / burnt, fries raw / cooked / burnt, nuggets raw / cooked / burnt.
- Burnt always means darker plus visible black spots plus a smoke wisp, never color alone (color-blind safe).
- Required set (v1): bun top, bun bottom, patty x3, lettuce, tomato, cheese, onion, sauce, fries x3, cup, drink, plate, tray.

## 6. Order icons (color-blind safe)
- Every order icon pairs a **distinct silhouette with a color**. No two icons share a silhouette.
- Icons sit in a cream circle with the standard outline. Ready-to-serve items get a small green tick; wrong items get a red cross.
- Patience is shown by bar fill **and** face expression **and** a shake in the red zone, never color alone.

## 7. Characters
- Chef plus at least 6 distinct customers (different silhouette, hair, clothing color, accessory).
- Proportions: big head (about 40 percent of height), small hands, bean-shaped body.
- Expressions (separate eye and mouth swaps): happy, neutral, impatient, angry. Idle poses: bob, blink every 3 to 5 s.
- Customer types read at a glance: regular (plain), impatient (sweat drop, tapping foot), VIP (gold star badge, hat), critic (glasses, notepad).

## 8. Environment
- Layers back to front: wall, wall decor, counter back, stations, counter front, floor.
- Diner (levels 1 to 10): teal and cream, checker floor, neon sign, stools.
- Taco stand (levels 11 to 20): terracotta and marigold, striped awning, papel picado, string lights.
- Stations share a base shape (rounded steel body, 6 px outline) and differ by top equipment and one accent color.

## 9. UI components
- Primary button: orange fill, cream text, 12 px radius, 6 px bottom "lip" in a darker orange. Pressed state scales to 0.94 and removes the lip.
- Secondary button: teal. Danger: tomato. Disabled: steel with 60 percent opacity.
- Panels and popups: cream fill, 16 px radius, outline plus drop shadow, title bar in teal.
- Progress ring: 12 px thick, outline-colored track, fills orange to green; flashes and bounces at "ready"; turns tomato with smoke at "burning".
- Patience bar: pill shape, green (above 50 percent), yellow (20 to 50), red (below 20) with shake.
- Coin: butter circle, inner ring, "C" mark. Star: five-point rounded star; empty star is steel with outline.

## 10. Motion rules (summary, full list lives in the prompt)
- Easing: `Back.Out` for pops, `Sine.InOut` for bobs, `Quad.Out` for slides.
- Durations: UI 120 to 200 ms, pops 250 ms, scene transitions 300 ms.
- Squash and stretch uses volume-preserving scales (e.g. 1.15 x 0.87).
- Every effect has a reduced-motion variant: no shake, no confetti, fades instead of slides.

## 11. Asset pipeline rules
- Every asset has a builder function in `/src/art` that returns a cached texture keyed by `name:state:scale`.
- `/data/assets.json` maps asset keys to optional files in `/assets/art`. If the file exists it is loaded; if not, the builder draws it.
- Supplied art is checked against this guide on load in dev mode: outline width, palette distance, and size. Mismatches are reported, never silently mixed.
