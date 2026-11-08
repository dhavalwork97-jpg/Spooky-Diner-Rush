TACO FIESTA - GAME INTEGRATION PACK

Read in this order:
  1. AGENT_PROMPT.md                    the task and flows
  2. data/taco_fiesta_hotspots.json     every station, slot, anchor, the window polygon, customer slots,
                                        cookingFlow, ovenFlow, drinks, suggestedMenu (12 dishes)
                                        (pixels + normalised 0-1, all in the 2754x1536 kitchen image)
  3. data/hotspots_preview.png          picture of all hotspots on the kitchen

FOLDERS
  background/   kitchen_street_back (depth 0), kitchen_front (depth 20): both full 2754x1536, transparent PNG/WebP.
                Draw customers between them. back + front = kitchen_full_v5.png exactly.
                kitchen_full_v5.png and window_layers_demo.png are for reference only (do not load in the game).
  sprites/      raw_/cooked_ chicken, shrimp, fish, veggies; finished taco_*, taco_soft_*, burrito_*, nachos_* per protein;
                guacamole_bowl, crema_bowl, lime_pile; pan_red, pan_blue
  animations/   cook_<protein> (7 frames), oven_taco_shell (5), burrito_<protein> (7), nachos_<protein> (5),
                taco_soft_<protein>_build (soft taco build-up stages: 5 frames chicken, 4 for the others),
                drink_cups (2 drinks x 5 fill levels). Each: _sheet.webp (+ .png fallback), .atlas.json (Phaser atlas),
                .anim.json (frame size, fps, origin, frame labels).
  icons/        41 order-bubble icons (128x128): every recipe step, all 12 dishes, both drinks. icons.json maps the step
                ids used in suggestedMenu to icon names; icons_atlas.webp/.png + .atlas.json is the same set as one atlas.
  optional_ghost_customers/   ghost cutouts + scare sprite sheets. Only use them if ghosts should be the customers
                of this restaurant; otherwise ignore or delete the folder. See its scare_sprites/README.txt.

Prefer .webp; .png is only a fallback.

WHAT THE KITCHEN CONTAINS (painted in the background)
  Static supplies (tap to add): lettuce, tomato, greens, shredded bowl, red salsa, cheese, peppers, cooler salsa,
  corn and flour tortilla warmers, steam-table items (beans, rice, jalapenos), sauce bottles, guacamole and crema bowls,
  limes. Griddle: raw chicken/shrimp/fish/veggies = unlimited supply. 4 empty pans = cook slots.
  Empty oven tray = shell/nacho slots. Two empty orange plates on the pass counter = assembly spots. Empty dispensers.

KNOWN ISSUES
  Crispy tacos have no build-up stages yet (only the finished sprite); soft tacos have both.
  There is no chip bowl in the kitchen art; the corn tortilla stack stands in for tortilla chips.
  The veggie nachos and veggie burrito final frames were regenerated separately, so their toppings/pose differ slightly
  from the other three rows.
