# Spooky Diner Rush Style Guide

Status: DRAFT for approval. Every asset, UI element, and effect follows this document.

## 1. Look

Flat cartoon with bold dark outlines, soft drop shadows, subtle gradients and highlights, a warm limited palette, and one rounded friendly font. The supplied kitchen background (`kitchen_full.webp`, 2752 x 1536) sets the reference: saturated, glossy, clean edges, warm oranges against cool navy and teal.

## 2. Canvas and scaling

- Logical canvas: 1280 x 698 (matches the kitchen image ratio of about 1.835). Phaser `Scale.FIT`, centered, letterboxed.
- Background is used as supplied (2752 x 1536, laid out in a 1699 x 948 space). No runtime resize, no distortion.
- Supplied sprites are 2x textures: display size is half the file size.
- Minimum touch target and drop target: 88 x 88 CSS px (not logical px). Zone sizes are checked against the live scale factor.

## 3. Palette (limited, warm)

| Token | Hex | Use |
|---|---|---|
| ink | #2B1B17 | Outlines, dark text |
| cream | #FFF4DC | Panels, plates, text on dark |
| orange | #F28C28 | Primary buttons, progress ring while cooking |
| tomato | #D9382B | Danger, Rush tag, burn ring |
| mustard | #F6C445 | Coins, highlights, warning |
| leaf | #4CAF50 | Ready ring, ticks, patience full |
| teal | #2BA6A0 | Secondary buttons, info |
| navy | #1F2A44 | Station bodies, overlays |
| steel | #9AA7B5 | Metal, neutral UI |
| shadow | #000000 at 25% | Drop shadows |

Rules: no more than 6 palette colors per asset. Status colors (leaf, mustard, tomato) are reserved for state.

## 4. Outlines and shadows

- Outline: ink, one identical width everywhere, 4 px at the 2x texture size (2 px logical). Rounded joins and caps.
- Drop shadow: soft ellipse or offset blur, shadow color, offset (0, 4) logical, blur 6 logical.
- Highlights: one soft white highlight (20 to 30% opacity) on the top-left of rounded forms.
- Gradients: two-tone vertical, at most 12% lightness difference.

## 5. Typography

- One rounded friendly font family. Proposal: Fredoka, bundled as a subsetted woff2 (about 20 KB), weights 500 and 700. Needs your approval because it adds a font file. Fallback stack: `"Fredoka", "Baloo 2", "Trebuchet MS", sans-serif`.
- Sizes (logical px): HUD numbers 28, labels 20, buttons 26, popups 32, minimum body text 18.
- Text on dark panels uses cream. Text on light panels uses ink. Numbers get an ink stroke of 3 px.

## 6. Assets

- Formats: transparent WebP for art, SVG for `level_badge` and `xp_bar_frame`, plain WebP for backgrounds.
- Naming: `snake_case`, state suffixes: `patty_raw`, `patty_cooked`, `patty_burnt`, `fries_raw`, `fries_cooked`, `fries_burnt`, `customer_01_happy`.
- Layered ingredients: each is its own texture, 400 px wide for burger layers so they stack evenly.
- Loader: if a file exists in `/assets/art` it is used; otherwise a code-drawn builder produces the same key in this style. All textures are created once and cached by key.
- When supplied and code-made art differ in style, report it and propose fixes (scale, outline, palette). Never mix silently.
- Burnt state is never color only: black spots plus a smoke wisp.

## 7. UI

- Buttons: rounded rectangle, ink outline, orange (primary) or teal (secondary), 88 px minimum height, press scale 0.94, hover glow on desktop.
- Order card: tall cream card, vertical patience strip (leaf, mustard, tomato, shake in the red zone), up to 3 item icons, coin price, green tick per delivered item, red Rush tag.
- Order icons are shape plus color (color-blind safe).
- HUD: level badge shows "Lv N" only, XP bar with `xp_bar_frame.svg`, reputation bar, coin counter.
- Popups: cream panel, ink outline, auto-dismiss in 2 to 3 seconds, tap to skip, never block play.

## 8. Station states (visually distinct)

| State | Look |
|---|---|
| idle | Static art, no overlay |
| active | Soft cream outline on tap, 1.04 scale pulse |
| cooking or dispensing | Orange radial ring plus station effect (bubbles, sizzle, glow) |
| ready | Green ring turns to tick, bounce, ding |
| warning | Smoke wisps, slow pulse |
| danger | Dark smoke, red pulsing ring, rising beep |
| failed or expired | Burnt texture with black spots, smoke puff |

## 9. Animation rules

- `kitchen_full.webp` stays static. All motion comes from Phaser objects, tweens, small particle emitters, and procedural effects layered above it.
- Gameplay state is owned by systems. Animations only read state and never decide cooked, burnt, served, or ready.
- Reusable helpers in `/src/anim`: `bounce`, `pop`, `glow`, `shake`, `fade`, `moveTo`, `progressRing`, `emitBurst`.
- Pooling for particles, coins, and rings. Effects clean themselves up on completion. A per-target guard prevents duplicate animations from repeated taps.
- Timings come from data. A reduce-motion setting turns off shake, tilt, large particles, and loops, and keeps color and icon feedback.
- Durations (ms): tap feedback 120, pop 180, bounce 300, fade 200, coin flight 450.
