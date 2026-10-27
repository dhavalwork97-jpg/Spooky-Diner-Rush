# Chef Rush: Style Guide (v2)

One rule above all: every asset must look like it came from the same hand. If an asset breaks a rule here, fix the asset, not the rule.

Progression is shown as a plain player level ("Lv 7"), never with icons or ratings. See section 9.

## 1. Canvas and scale
- Logical canvas: **1280 x 720**, landscape, Phaser `Scale.FIT` with centered letterboxing.
- Backgrounds arrive at 1280 x 714. They are scaled to cover the full 720 height (factor 1.0084) and centered, so nothing is stretched.
- Safe area: keep interactive UI at least 48 px from every edge (notches, rounded corners).
- Minimum tap and drop target: **88 x 88 logical px**.
- All supplied art is a **2x texture**: a 400 px wide file displays 200 logical px wide. Code-made art is baked at 2x as well and cached by key.

## 2. Outline and shape
Measured on the supplied art (texture px at 2x, shown here as logical px): burger layers, order bubble and tomato are about 4 px; fryer 3 px; customers and trash can 2 px; coin and fries 1.5 px.

- **Code-made art uses a 4 px outline at 1x** (8 px in the 2x texture). This matches the burger layers and the order bubble, which are the most common shapes on screen.
- Outline color: `#3B2417` (warm dark brown, never pure black). Round joins and caps.
- Corners: rounded. Default radius 16 px for panels, 12 px for buttons, 50 percent for icons and bubbles.
- Simple chunky shapes with strong silhouettes, readable at 64 px.
- Open question for the art owner: new art should aim for about 8 px of outline in the 2x file (4 px logical) so everything lines up. Existing files that are thinner are listed in `docs/asset-list.md`.

## 3. Palette (warm, limited)
| Role | Hex | Use |
|---|---|---|
| Outline | `#3B2417` | outlines, text stroke |
| Cream | `#FFF3DC` | panels, cards, text |
| Butter | `#FFD66B` | coins, level badge, highlights |
| Tomato | `#E8483B` | alerts, danger, angry |
| Orange | `#F58A2E` | primary buttons, fire, XP fill |
| Leaf | `#6BBF4E` | success, ready ring, patience full |
| Bun | `#D9923B` | wood, buns |
| Patty | `#7A3E22` | cooked patty |
| Teal | `#2FA7A0` | secondary buttons, diner accent |
| Sky | `#8FD3F4` | drinks, info |
| Steel | `#B9C0C9` | stations, disabled |

- Gradients: two stops at most, a lightness change of 8 to 12 percent from top to bottom. Highlight is a small cream-white shape (35 percent opacity) at the upper left.
- Shadows: soft drop shadow, offset (0, 6), blur 10, outline color at 25 percent. Contact shadows under items are a flat ellipse at 20 percent.

## 4. Typography
- One family everywhere: **Fredoka** (SIL Open Font License, self-hosted, Latin subset, about 16 KB). License text ships in `public/fonts`.
- Fallback stack: `"Fredoka", "Baloo 2", "Nunito", system-ui, sans-serif`.
- Sizes (logical px): body 28, labels 24, buttons 36, headings 56, big numbers 72. Never below 24.
- Light text gets a 4 px outline-colored stroke (6 px at sizes of 36 and above) and a 3 px drop shadow. Text on cream panels uses dark ink with no stroke.

## 5. Supplied art and code-made fallbacks
The asset loader reads `/data/assets.json`. For every asset id:
1. If a file exists in `/assets/art`, it is loaded and used.
2. If not, a builder in `/src/art` draws the asset in code from this guide.
3. If an asset is marked `preferFallback`, the builder is used even when a file exists.

Supplied now: burger layers, fries, nuggets, pizza, drinks, stations, backgrounds, chef, three customers, logo, coin, order bubble, patience bar frame, trash can, level badge and XP bar frame (SVG).
Code-made for now: buttons, panels, pills, reputation bar, story cards, customer expressions, additional customers, sauce, ice cream, hot dog.
Defective files are held back and described in `docs/asset-list.md`.

## 6. Ingredients (layered, each its own asset)
- Burger layers (bun top, bun bottom, patty, lettuce, tomato, cheese) are 400 px wide in the file, so they stack evenly at 200 logical px. Onion and pickle are 360 px wide and are centered on the stack.
- States are separate textures, not tints: patty raw, cooked, burnt; fries raw, cooked, burnt; nuggets raw, cooked, burnt; pizza raw and cooked.
- Burnt always means darker plus visible black spots plus a smoke wisp, never color alone.
- Layers drop onto the stack with a 4 px overlap so the outlines read as one burger.

## 7. Order icons (color-blind safe)
- Every order icon pairs a **distinct silhouette with a color**. No two icons share a silhouette.
- Icons sit in the supplied order bubble. A delivered item gets a green tick; the whole bubble pops out when every item is delivered.
- Patience is shown by bar fill, by the customer's expression, and by a shake in the red zone, never by color alone.

## 8. Characters
- The chef plus at least 6 distinct customers (silhouette, hair, clothing color, accessory). Three are supplied; the rest are drawn in code until supplied.
- Expressions: happy, neutral, impatient, angry. Until expression variants are supplied, expression shows as a small emote bubble above the head plus a posture change.
- Customer types read at a glance: regular (plain), impatient (sweat drop), VIP (gold badge), critic (glasses and notepad).

## 9. UI components
- **Level badge**: the supplied shield, with the number "Lv 7" in Fredoka on top. Always shows the number only.
- **XP bar**: the supplied pill frame with an orange fill that grows smoothly. No numbers on the bar during play.
- **Reputation bar**: pill frame, leaf green above 50 percent, butter 20 to 50 percent, tomato below 20 percent.
- **Patience bar**: the supplied frame with a leaf, butter or tomato fill, shaking in the red zone.
- Primary button: orange fill, cream text, 12 px radius, 8 px bottom lip in a darker orange. Press drops the face onto the lip. Secondary: teal. Danger: tomato. Disabled: steel at 60 percent.
- Panels and popups: cream fill, 16 px radius, outline and drop shadow.
- Progress ring: 12 px thick, fills orange, turns green when ready, pulses red in the danger phase.
- Story cards: comic-style panel with a thick outline and at most two lines of text.
- Recipe Book cards: unlocked in full color with cook times; locked as a flat dark silhouette with the unlock level.
- No star icons anywhere. The coin art is the only exception and is flagged in `docs/asset-list.md`.

## 10. Motion
- Easing: `Back.Out` for pops, `Sine.InOut` for bobs, `Quad.Out` for slides.
- Durations: UI 120 to 200 ms, pops 250 ms, scene transitions 300 ms, level-up card 2 to 3 s (skippable, never blocks play).
- Squash and stretch uses volume-preserving scales (for example 1.15 by 0.87).
- Every effect has a reduced-motion variant: no shake, no confetti, fades instead of slides.

## 11. Asset pipeline rules
- Every asset has a builder function that returns a cached texture keyed by `name:state:scale`.
- Supplied SVGs are rasterized at twice their display size so outlines stay crisp.
- In development, supplied art is checked against this guide on load (size, outline width, palette). Mismatches are reported, never silently mixed.
