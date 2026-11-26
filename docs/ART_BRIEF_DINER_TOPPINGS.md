# Art brief: Spooky Diner toppings (4 images)

For the new diner dishes (cheeseburger, garden burger, deluxe burger). The cheese, onion and pickle burger layers already exist in the game (`public/assets/art/cheese.webp`, `onion.webp`, `pickle.webp`). Send those three files and `lettuce.webp` and `tomato.webp` to Gemini as style references so the new pictures match.

Common rules for all 4 images: same thick dark-brown outline, same glossy cartoon style and colours as the existing burger layer art; transparent background; saved as PNG (I convert to WebP); no text; no shadows outside the object.

## 1. `prep_toppings_tray` (goes on the diner's Prep station)

- Size: 540 x 600 px (it is drawn at about half size, over a spot of roughly 260 x 290 px in the kitchen picture).
- Content: one steel tray seen from the same slightly-above angle as the tomato tray, with three compartments: sliced yellow cheese, red onion rings, green pickle slices. The three toppings must be easy to tell apart at a small size.
- It must fully cover the area where a teal bowl and a purple tray with pink cups show today, so give the tray a solid base.
- Prompt idea: "Cartoon game asset, steel tray with three compartments holding cheese slices, red onion rings and pickle slices, three-quarter top view, thick dark brown outline, glossy, transparent background, matches a spooky diner kitchen game."

## 2-4. Order-bubble dish icons (shown small, about 25 px, in the customer's order bubble)

All three: 360 x 360 px, one complete burger, side view, same bun as `bun_top.webp`, centred, with the layers clearly visible.

- `cheeseburger_cooked`: bun, patty, a cheese slice hanging over the edge, lettuce, tomato.
- `garden_burger_cooked`: bun, patty, lettuce, tomato, red onion rings and pickle slices (no cheese).
- `deluxe_burger_cooked`: bun, patty, cheese, lettuce, tomato, onion rings and pickle slices (the tallest burger).

They must look different from each other even when tiny: cheese edge for the cheeseburger, purple and green rings for the garden burger, tall stack for the deluxe.

## What happens when they arrive

Save the four files in `public/assets/art/`. I register them, add the three dishes, wire the toppings tray and test it. Until the real pictures arrive I add nothing visible to the game.
