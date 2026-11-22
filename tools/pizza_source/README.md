Pizza Place source art (supplied 2026-11-21). `tools/make_pizza_art.py` reads this folder and writes the runtime WebP files to `public/assets/pizza/`.
Not shipped: nothing here is loaded by the game. The 85-frame wings fryer sheet (from the effects zip) is used, not the 49-frame copy in the pizza zip. Of the two
`sides_items_atlas.webp` copies only the one inside `pizza_sides_assets/` is kept (it has the matching JSON). The original 2752x1536 background was not supplied; the
1679x937 WebP is used and every coordinate is a 0-1 fraction of it.
