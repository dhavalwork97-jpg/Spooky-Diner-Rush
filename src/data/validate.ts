import { STATION_TYPES, rectsOverlap, type ZoneDef } from '../kitchen/zones';

export interface RestaurantDef {
  id: string;
  name: string;
  unlockLevel: number;
  background: string;
  backgroundSize: { width: number; height: number };
  zones: ZoneDef[];
}

export interface AssetDef {
  key: string;
  type: 'image' | 'svg' | 'spritesheet';
  frameWidth?: number;
  frameHeight?: number;
  file: string;
  scale: number;
  width?: number;
  height?: number;
  lazy?: boolean;
  preferFallback: boolean;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Returns a list of problems. Empty list means valid. */
export function validateRestaurants(data: unknown): string[] {
  const errors: string[] = [];
  const list = (data as { restaurants?: unknown })?.restaurants;
  if (!Array.isArray(list) || list.length === 0) return ['restaurants.json: "restaurants" must be a non-empty array'];

  const restaurantIds = new Set<string>();
  for (const r of list as Partial<RestaurantDef>[]) {
    const where = `restaurant ${r?.id ?? '?'}`;
    if (!isStr(r.id)) errors.push('restaurant is missing an id');
    else if (restaurantIds.has(r.id)) errors.push(`${where}: duplicate id`);
    else restaurantIds.add(r.id);
    if (!isStr(r.name)) errors.push(`${where}: missing name`);
    if (!isNum(r.unlockLevel) || r.unlockLevel < 1) errors.push(`${where}: unlockLevel must be >= 1`);
    if (!isStr(r.background)) errors.push(`${where}: missing background key`);
    if (!isNum(r.backgroundSize?.width) || !isNum(r.backgroundSize?.height))
      errors.push(`${where}: backgroundSize needs width and height`);
    if (!Array.isArray(r.zones) || r.zones.length === 0) {
      errors.push(`${where}: zones must be a non-empty array`);
      continue;
    }
    const ids = new Set<string>();
    for (const z of r.zones) {
      const zw = `${where} zone ${z?.id ?? '?'}`;
      if (!isStr(z.id)) errors.push(`${where}: zone without id`);
      else if (ids.has(z.id)) errors.push(`${zw}: duplicate zone id`);
      else ids.add(z.id);
      if (!STATION_TYPES.includes(z.station)) errors.push(`${zw}: unknown station type "${z.station}"`);
      if (!isNum(z.unlockLevel) || z.unlockLevel < 1) errors.push(`${zw}: unlockLevel must be >= 1`);
      for (const k of ['x', 'y', 'width', 'height'] as const) {
        if (!isNum(z[k])) errors.push(`${zw}: ${k} must be a number`);
      }
      if (isNum(z.x) && isNum(z.y) && isNum(z.width) && isNum(z.height)) {
        if (z.width <= 0 || z.height <= 0) errors.push(`${zw}: width and height must be > 0`);
        if (z.x < 0 || z.y < 0 || z.x + z.width > 1.0001 || z.y + z.height > 1.0001)
          errors.push(`${zw}: must lie inside 0..1`);
      }
    }
    for (let i = 0; i < r.zones.length; i++) {
      for (let j = i + 1; j < r.zones.length; j++) {
        if (rectsOverlap(r.zones[i], r.zones[j]))
          errors.push(`${where}: zones "${r.zones[i].id}" and "${r.zones[j].id}" overlap`);
      }
    }
  }
  return errors;
}

export function validateAssets(data: unknown): string[] {
  const errors: string[] = [];
  const list = (data as { assets?: unknown })?.assets;
  if (!Array.isArray(list)) return ['assets.json: "assets" must be an array'];
  const keys = new Set<string>();
  for (const a of list as Partial<AssetDef>[]) {
    if (!isStr(a.key)) errors.push('asset without key');
    else if (keys.has(a.key)) errors.push(`asset ${a.key}: duplicate key`);
    else keys.add(a.key);
    if (a.type !== 'image' && a.type !== 'svg' && a.type !== 'spritesheet') errors.push(`asset ${a.key}: unsupported type`);
    if (a.type === 'spritesheet' && (!isNum(a.frameWidth) || !isNum(a.frameHeight) || a.frameWidth <= 0 || a.frameHeight <= 0)) errors.push(`asset ${a.key}: spritesheet needs frameWidth and frameHeight`);
    if (!isStr(a.file)) errors.push(`asset ${a.key}: missing file`);
    if (!isNum(a.scale) || a.scale <= 0) errors.push(`asset ${a.key}: scale must be > 0`);
  }
  return errors;
}

const MOD_KEYS = ['fryerSpeed', 'grillSpeed', 'ovenSpeed', 'patience', 'tips', 'burnWindow', 'calm'];

/** upgrades.json: unique ids, known mod, at least one tier, cost > 0 and rising, value > 0 and rising. */
export function validateUpgrades(data: unknown): string[] {
  const errors: string[] = [];
  const list = (data as { upgrades?: unknown })?.upgrades;
  if (!Array.isArray(list) || list.length === 0) return ['upgrades.json: "upgrades" must be a non-empty array'];
  const ids = new Set<string>();
  for (const u of list as Record<string, unknown>[]) {
    const id = isStr(u.id) ? u.id : '(no id)';
    if (!isStr(u.id)) errors.push('upgrade without id');
    else if (ids.has(u.id)) errors.push(`upgrade ${id}: duplicate id`);
    else ids.add(u.id);
    if (!isStr(u.name)) errors.push(`upgrade ${id}: missing name`);
    if (!isStr(u.description)) errors.push(`upgrade ${id}: missing description`);
    if (typeof u.mod !== 'string' || !MOD_KEYS.includes(u.mod)) errors.push(`upgrade ${id}: unknown mod`);
    if (!isNum(u.unlockLevel) || u.unlockLevel < 1) errors.push(`upgrade ${id}: unlockLevel must be >= 1`);
    const tiers = u.tiers;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      errors.push(`upgrade ${id}: needs at least one tier`);
      continue;
    }
    let lastCost = 0;
    let lastValue = 0;
    tiers.forEach((t: { cost?: unknown; value?: unknown }, i: number) => {
      if (!isNum(t.cost) || t.cost <= 0) errors.push(`upgrade ${id} tier ${i + 1}: cost must be > 0`);
      else {
        if (t.cost <= lastCost) errors.push(`upgrade ${id} tier ${i + 1}: cost must rise`);
        lastCost = t.cost;
      }
      if (!isNum(t.value) || t.value <= 0) errors.push(`upgrade ${id} tier ${i + 1}: value must be > 0`);
      else {
        if (t.value <= lastValue) errors.push(`upgrade ${id} tier ${i + 1}: value must rise`);
        lastValue = t.value;
      }
    });
  }
  return errors;
}

/** career.json: first band starts at Lv 1, bands rise, titles are non-empty and short. */
export function validateCareer(data: unknown): string[] {
  const errors: string[] = [];
  const list = (data as { titles?: unknown })?.titles;
  if (!Array.isArray(list) || list.length === 0) return ['career.json: "titles" must be a non-empty array'];
  let last = 0;
  (list as { minLevel?: unknown; title?: unknown }[]).forEach((t, i) => {
    if (!isNum(t.minLevel) || !Number.isInteger(t.minLevel) || t.minLevel < 1) errors.push(`title ${i + 1}: minLevel must be a whole number >= 1`);
    else {
      if (i === 0 && t.minLevel !== 1) errors.push('title 1: the first band must start at Lv 1');
      if (t.minLevel <= last) errors.push(`title ${i + 1}: minLevel must rise`);
      last = t.minLevel;
    }
    if (!isStr(t.title) || t.title.length > 24) errors.push(`title ${i + 1}: title must be 1 to 24 characters`);
  });
  return errors;
}

const CHEF_TRIGGERS = ['first_serve', 'rush', 'combo', 'burn', 'angry', 'event', 'level_up', 'idle', 'full_moon', 'bat', 'chest', 'regular', 'party', 'badge'];

/** chef.json: numbers >= 0, every known trigger present with short non-empty lines. */
export function validateChef(data: unknown): string[] {
  const errors: string[] = [];
  const d = data as { cooldown?: unknown; triggerCooldown?: unknown; hold?: unknown; triggers?: Record<string, { lines?: unknown }> };
  for (const k of ['cooldown', 'triggerCooldown', 'hold'] as const) {
    if (!isNum(d?.[k]) || (d[k] as number) < 0) errors.push(`chef.json: ${k} must be a number >= 0`);
  }
  if (!d?.triggers || typeof d.triggers !== 'object') return [...errors, 'chef.json: "triggers" must be an object'];
  for (const id of CHEF_TRIGGERS) if (!d.triggers[id]) errors.push(`chef.json: missing trigger ${id}`);
  for (const [id, t] of Object.entries(d.triggers)) {
    if (!CHEF_TRIGGERS.includes(id)) errors.push(`chef.json: unknown trigger ${id}`);
    if (!Array.isArray(t?.lines) || t.lines.length === 0) {
      errors.push(`chef.json: ${id} needs at least one line`);
      continue;
    }
    for (const l of t.lines) if (!isStr(l) || l.length > 60) errors.push(`chef.json: ${id} has a line that is empty or over 60 characters`);
  }
  return errors;
}

/** story.json: unique ids, whole levels >= 1, short title and text, and a card for Lv 1. */
export function validateStory(data: unknown): string[] {
  const errors: string[] = [];
  const list = (data as { cards?: unknown })?.cards;
  if (!Array.isArray(list) || list.length === 0) return ['story.json: "cards" must be a non-empty array'];
  const ids = new Set<string>();
  let hasFirst = false;
  (list as { id?: unknown; level?: unknown; title?: unknown; text?: unknown }[]).forEach((c, i) => {
    const id = isStr(c.id) ? c.id : `#${i + 1}`;
    if (!isStr(c.id) || c.id.length > 64) errors.push(`story card ${id}: id must be 1 to 64 characters`);
    else if (ids.has(c.id)) errors.push(`story card ${id}: duplicate id`);
    else ids.add(c.id);
    if (!isNum(c.level) || !Number.isInteger(c.level) || c.level < 1) errors.push(`story card ${id}: level must be a whole number >= 1`);
    else if (c.level === 1) hasFirst = true;
    if (!isStr(c.title) || c.title.length > 28) errors.push(`story card ${id}: title must be 1 to 28 characters`);
    if (!isStr(c.text) || c.text.length > 160) errors.push(`story card ${id}: text must be 1 to 160 characters`);
  });
  if (!hasFirst) errors.push('story.json: needs a card for Lv 1');
  return errors;
}

const PERK_MODS = ['fryerSpeed', 'grillSpeed', 'ovenSpeed', 'patience', 'tips', 'burnWindow', 'calm'];

/** decor.json: unique ids, cost > 0, level >= 1, and a rectangle that lies inside the 1699 x 948 art. */
export function validateDecor(data: unknown): string[] {
  const errors: string[] = [];
  const list = (data as { items?: unknown })?.items;
  if (!Array.isArray(list) || list.length === 0) return ['decor.json: "items" must be a non-empty array'];
  const ids = new Set<string>();
  const perkSums = new Map<string, number>();
  (list as Record<string, unknown>[]).forEach((d, i) => {
    const id = isStr(d.id) ? d.id : `#${i + 1}`;
    if (!isStr(d.id)) errors.push(`decor ${id}: missing id`);
    else if (ids.has(d.id)) errors.push(`decor ${id}: duplicate id`);
    else ids.add(d.id);
    if (!isStr(d.name)) errors.push(`decor ${id}: missing name`);
    if (!isStr(d.description)) errors.push(`decor ${id}: missing description`);
    if (d.chestOnly === true) {
      if (d.cost !== 0) errors.push(`decor ${id}: a chest-only piece has cost 0`);
    } else if (!isNum(d.cost) || d.cost <= 0) errors.push(`decor ${id}: cost must be > 0`);
    if (d.art !== undefined && !isStr(d.art)) errors.push(`decor ${id}: art must be a name`);
    if (d.perk !== undefined) {
      const pk = d.perk as { mod?: unknown; pct?: unknown };
      if (!isStr(pk.mod) || !PERK_MODS.includes(pk.mod)) errors.push(`decor ${id}: perk.mod must be one of ${PERK_MODS.join(', ')}`);
      if (!isNum(pk.pct) || pk.pct <= 0 || pk.pct > 0.04) errors.push(`decor ${id}: perk.pct must be above 0 and at most 0.04`);
      else if (isStr(pk.mod)) perkSums.set(pk.mod, (perkSums.get(pk.mod) ?? 0) + pk.pct);
    }
    if (!isNum(d.unlockLevel) || d.unlockLevel < 1) errors.push(`decor ${id}: unlockLevel must be >= 1`);
    const { x, y, width, height } = d;
    if (!isNum(x) || !isNum(y) || !isNum(width) || !isNum(height) || width <= 0 || height <= 0) errors.push(`decor ${id}: needs x, y, width and height`);
    else if (x < 0 || y < 0 || x + width > 1699 || y + height > 948) errors.push(`decor ${id}: must lie inside the 1699 x 948 art`);
  });
  // Every piece on display at once: the perks of one mod may add up to at most +8 percent (DECOR_PERK_CAP in game/decor.ts).
  for (const [mod, sum] of perkSums) if (sum > 0.08 + 1e-9) errors.push(`decor: perks for ${mod} add up to ${Math.round(sum * 100)}%, the cap is 8%`);
  return errors;
}

/** recipebook.json: one entry for each menu item id, no extras, each with 1 to 5 short steps. */
export function validateRecipeBook(data: unknown, itemIds: string[]): string[] {
  const errors: string[] = [];
  const list = (data as { entries?: unknown })?.entries;
  if (!Array.isArray(list)) return ['recipebook.json: "entries" must be an array'];
  const seen = new Set<string>();
  (list as { id?: unknown; steps?: unknown }[]).forEach((e, i) => {
    const id = isStr(e.id) ? e.id : `#${i + 1}`;
    if (!isStr(e.id)) errors.push(`recipe ${id}: missing id`);
    else if (seen.has(e.id)) errors.push(`recipe ${id}: duplicate id`);
    else {
      seen.add(e.id);
      if (!itemIds.includes(e.id)) errors.push(`recipe ${id}: not a menu item`);
    }
    if (!Array.isArray(e.steps) || e.steps.length < 1 || e.steps.length > 5) errors.push(`recipe ${id}: needs 1 to 5 steps`);
    else for (const st of e.steps) if (!isStr(st) || st.length > 80) errors.push(`recipe ${id}: a step is empty or over 80 characters`);
  });
  for (const id of itemIds) if (!seen.has(id)) errors.push(`recipe ${id}: missing from recipebook.json`);
  return errors;
}

/** restaurant_menu.json: coming-soon entries with unique ids that do not clash with playable restaurants. */
export function validateRestaurantMenu(data: unknown, playableIds: string[]): string[] {
  const errors: string[] = [];
  const list = (data as { comingSoon?: unknown })?.comingSoon;
  if (!Array.isArray(list)) return ['restaurant_menu.json: "comingSoon" must be an array'];
  const seen = new Set<string>(playableIds);
  (list as { id?: unknown; name?: unknown; unlockLevel?: unknown }[]).forEach((r, i) => {
    const id = isStr(r.id) ? r.id : `#${i + 1}`;
    if (!isStr(r.id)) errors.push(`coming soon ${id}: missing id`);
    else if (seen.has(r.id)) errors.push(`coming soon ${id}: id already used`);
    else seen.add(r.id);
    if (!isStr(r.name) || r.name.length > 24) errors.push(`coming soon ${id}: name must be 1 to 24 characters`);
    if (!isNum(r.unlockLevel) || !Number.isInteger(r.unlockLevel) || r.unlockLevel < 1) errors.push(`coming soon ${id}: unlockLevel must be a whole number >= 1`);
  });
  return errors;
}

/** xp.json: the optional gentler early curve needs both settings, a sane slope, and a level range that does not touch Lv 1-2. */
export function validateXp(data: unknown): string[] {
  const errors: string[] = [];
  const x = data as Record<string, unknown> | null;
  if (!x || typeof x !== 'object') return ['xp.json: must be an object'];
  if (!isNum(x.base) || x.base < 0) errors.push('xp.json: base must be a number >= 0');
  if (!isNum(x.perLevel) || x.perLevel <= 0) errors.push('xp.json: perLevel must be a number > 0');
  const hasSlope = x.earlyPerLevel !== undefined;
  const hasUntil = x.earlyUntilLevel !== undefined;
  if (hasSlope !== hasUntil) errors.push('xp.json: earlyPerLevel and earlyUntilLevel must be given together');
  if (hasSlope && hasUntil) {
    if (!isNum(x.earlyPerLevel) || x.earlyPerLevel <= 0) errors.push('xp.json: earlyPerLevel must be a number > 0');
    else if (isNum(x.perLevel) && x.earlyPerLevel > x.perLevel) errors.push('xp.json: earlyPerLevel must not be steeper than perLevel (the early part is meant to be gentler)');
    if (!isNum(x.earlyUntilLevel) || !Number.isInteger(x.earlyUntilLevel) || x.earlyUntilLevel < 3) errors.push('xp.json: earlyUntilLevel must be a whole number >= 3 (Lv 1-2 keep the normal curve)');
  }
  if (x.firstLevelXp !== undefined) {
    if (!isNum(x.firstLevelXp) || !Number.isInteger(x.firstLevelXp) || x.firstLevelXp <= 0) errors.push('xp.json: firstLevelXp must be a whole number > 0');
    else if (isNum(x.base) && isNum(x.perLevel) && x.firstLevelXp > x.base + x.perLevel) errors.push('xp.json: firstLevelXp must not be more than the normal Lv 1 cost (base + perLevel)');
  }
  return errors;
}

export function assertValid(name: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${name} failed validation:\n- ${errors.join('\n- ')}`);
}

/** Pizza Place data (data/pizza.json). Returns a list of problems; empty means valid. */
export function validatePizza(data: unknown): string[] {
  const errors: string[] = [];
  const d = data as Record<string, any> | null;
  if (!d || typeof d !== 'object') return ['pizza: not an object'];
  const r = d.restaurant;
  if (!r || r.id !== 'pizza_place' || !isStr(r.name) || !isNum(r.unlockLevel) || !isNum(r.cost)) errors.push('pizza: restaurant needs id pizza_place, name, unlockLevel and cost');
  const cu = d.custom;
  if (!cu || !isNum(cu.fromStep) || cu.fromStep < 1 || cu.fromStep > 10 || !Array.isArray(cu.chance) || !Array.isArray(cu.maxToppings) || cu.chance.some((x: number) => !isNum(x) || x < 0 || x > 1) || cu.maxToppings.some((x: number) => !isNum(x) || x < 1 || x > 3) || !Array.isArray(cu.countWeights) || cu.countWeights.length !== 3 || !isNum(cu.basePrice) || !isNum(cu.toppingPrice) || !isNum(cu.xpBase) || !Array.isArray(cu.excludeToppings)) errors.push('pizza: custom is missing or has bad values');
  if (!d.dailySpecial || !isNum(d.dailySpecial.fromStep) || d.dailySpecial.fromStep < 1 || d.dailySpecial.fromStep > 10) errors.push('pizza: dailySpecial.fromStep must be 1 to 10');
  const pb = d.perfectBake;
  if (!pb || !isNum(pb.share) || !isNum(pb.tipFraction) || pb.share <= 0 || pb.share > 1 || pb.tipFraction < 0 || pb.tipFraction > 1) errors.push('pizza: perfectBake needs share (0 to 1) and tipFraction (0 to 1)');
  const dr = d.events?.delivery_rush;
  if (!dr || !isStr(dr.name) || !isNum(dr.minStep) || !isNum(dr.duration) || dr.duration <= 0 || !Array.isArray(dr.tickets) || dr.tickets.length !== 2 || !isNum(dr.tickets[0]) || !isNum(dr.tickets[1]) || dr.tickets[0] < 1 || dr.tickets[1] < dr.tickets[0] || !isNum(dr.coinMult) || dr.coinMult < 1 || !isNum(dr.completeBonus) || dr.completeBonus < 0 || dr.completeBonus > 1)
    errors.push('pizza: events.delivery_rush needs name, minStep, duration, tickets [min, max], coinMult (1 or more) and completeBonus (0 to 1)');
  const cm = d.comboMeal;
  if (!cm || !isNum(cm.coinBonus) || !isNum(cm.xpBonus) || cm.coinBonus < 0 || cm.xpBonus < 0 || cm.coinBonus > 1 || cm.xpBonus > 1) errors.push('pizza: comboMeal needs coinBonus and xpBonus between 0 and 1');
  const ing = d.ingredients ?? {};
  const known = new Set<string>();
  for (const [kind, list] of [['sauce', ing.sauces], ['cheese', ing.cheeses], ['topping', ing.toppings]] as const) {
    if (!Array.isArray(list) || list.length === 0) errors.push(`pizza: ingredients.${kind}s missing`);
    for (const i of list ?? []) {
      if (!isStr(i.id) || !isStr(i.name) || !isNum(i.unlockStep) || i.unlockStep < 1 || i.unlockStep > 10) errors.push(`pizza: bad ${kind} ${i?.id}`);
      known.add(`${kind}:${i.id}`);
    }
  }
  const stepOf = new Map<string, number>();
  for (const [kind, list] of [['sauce', ing.sauces], ['cheese', ing.cheeses], ['topping', ing.toppings]] as const) for (const i of list ?? []) stepOf.set(`${kind}:${i.id}`, i.unlockStep);
  const ids = new Set<string>();
  const kinds = ['pizza', 'side', 'fried', 'dessert'];
  for (const dish of d.dishes ?? []) {
    if (!isStr(dish.id) || ids.has(dish.id)) errors.push(`pizza: dish id missing or repeated: ${dish.id}`);
    ids.add(dish.id);
    if (!kinds.includes(dish.kind)) errors.push(`pizza: ${dish.id} has unknown kind ${dish.kind}`);
    if (!isStr(dish.name) || !isStr(dish.icon)) errors.push(`pizza: ${dish.id} needs name and icon`);
    if (!isNum(dish.unlockStep) || dish.unlockStep < 1 || dish.unlockStep > 10) errors.push(`pizza: ${dish.id} unlockStep must be 1-10`);
    if (!isNum(dish.price) || dish.price <= 0 || !isNum(dish.xp) || dish.xp <= 0) errors.push(`pizza: ${dish.id} needs a price and xp`);
    if (dish.kind === 'pizza') {
      const rc = dish.recipe;
      if (!rc) {
        errors.push(`pizza: ${dish.id} has no recipe`);
        continue;
      }
      const parts = [`sauce:${rc.sauce}`, `cheese:${rc.cheese}`, ...(rc.toppings ?? []).map((t: string) => `topping:${t}`)];
      for (const part of parts) {
        if (!known.has(part)) errors.push(`pizza: ${dish.id} uses unknown ingredient ${part}`);
        else if ((stepOf.get(part) ?? 99) > dish.unlockStep) errors.push(`pizza: ${dish.id} needs ${part} before it is on the menu`);
      }
      if (new Set(rc.toppings).size !== rc.toppings.length || rc.toppings.length > 3) errors.push(`pizza: ${dish.id} toppings must be 0-3 and different`);
    } else if (dish.recipe) errors.push(`pizza: ${dish.id} is not a pizza but has a recipe`);
    if (dish.kind === 'fried' && ![0, 1].includes(dish.basket)) errors.push(`pizza: ${dish.id} needs basket 0 or 1`);
  }
  const pizzas = (d.dishes ?? []).filter((x: any) => x.kind === 'pizza');
  const sig = new Set<string>();
  for (const p of pizzas) {
    const k = `${p.recipe?.sauce}|${p.recipe?.cheese}|${[...(p.recipe?.toppings ?? [])].sort().join(',')}`;
    if (sig.has(k)) errors.push(`pizza: ${p.id} has the same recipe as another pizza`);
    sig.add(k);
  }
  for (let s = 1; s <= 10; s++) if (!(d.dishes ?? []).some((x: any) => x.unlockStep === s)) errors.push(`pizza: nothing joins the menu at step ${s}`);
  if ((d.ramp ?? []).length !== 10) errors.push('pizza: ramp needs one row per step (10)');
  for (const u of d.upgrades ?? []) {
    if (!isStr(u.id) || !isStr(u.name) || !isStr(u.description) || !isStr(u.mod)) errors.push(`pizza: bad upgrade ${u?.id}`);
    let prev = 0;
    for (const t of u.tiers ?? []) {
      if (!isNum(t.cost) || t.cost <= 0 || !isNum(t.value) || t.value <= 1 || !isNum(t.step) || t.step < 1 || t.step > 10 || t.step < prev) errors.push(`pizza: upgrade ${u.id} has a bad tier`);
      prev = t.step;
    }
  }
  const zoneIds = new Set<string>();
  for (const z of d.zones ?? []) {
    if (!isStr(z.id) || zoneIds.has(z.id)) errors.push(`pizza: zone id missing or repeated: ${z.id}`);
    zoneIds.add(z.id);
    if (![z.x, z.y, z.width, z.height].every(isNum) || z.x < 0 || z.y < 0 || z.width <= 0 || z.height <= 0 || z.x + z.width > 1 || z.y + z.height > 1) errors.push(`pizza: zone ${z.id} is outside 0-1`);
  }
  const zs = d.zones ?? [];
  for (let i = 0; i < zs.length; i++)
    for (let j = i + 1; j < zs.length; j++) {
      const a = zs[i], b = zs[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) errors.push(`pizza: zones ${a.id} and ${b.id} overlap`);
    }
  const cw = d.customerWindow;
  if (!cw || !Array.isArray(cw.slots) || cw.slots.length < 5) errors.push('pizza: customerWindow needs 5 slots');
  return errors;
}
