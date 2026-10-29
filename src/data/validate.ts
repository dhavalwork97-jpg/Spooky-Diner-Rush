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
  type: 'image' | 'svg';
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
    if (a.type !== 'image' && a.type !== 'svg') errors.push(`asset ${a.key}: unsupported type`);
    if (!isStr(a.file)) errors.push(`asset ${a.key}: missing file`);
    if (!isNum(a.scale) || a.scale <= 0) errors.push(`asset ${a.key}: scale must be > 0`);
  }
  return errors;
}

const MOD_KEYS = ['fryerSpeed', 'grillSpeed', 'ovenSpeed', 'patience', 'tips'];

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

const CHEF_TRIGGERS = ['first_serve', 'rush', 'combo', 'burn', 'angry', 'event', 'level_up', 'idle'];

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

/** decor.json: unique ids, cost > 0, level >= 1, and a rectangle that lies inside the 1699 x 926 art. */
export function validateDecor(data: unknown): string[] {
  const errors: string[] = [];
  const list = (data as { items?: unknown })?.items;
  if (!Array.isArray(list) || list.length === 0) return ['decor.json: "items" must be a non-empty array'];
  const ids = new Set<string>();
  (list as Record<string, unknown>[]).forEach((d, i) => {
    const id = isStr(d.id) ? d.id : `#${i + 1}`;
    if (!isStr(d.id)) errors.push(`decor ${id}: missing id`);
    else if (ids.has(d.id)) errors.push(`decor ${id}: duplicate id`);
    else ids.add(d.id);
    if (!isStr(d.name)) errors.push(`decor ${id}: missing name`);
    if (!isStr(d.description)) errors.push(`decor ${id}: missing description`);
    if (!isNum(d.cost) || d.cost <= 0) errors.push(`decor ${id}: cost must be > 0`);
    if (!isNum(d.unlockLevel) || d.unlockLevel < 1) errors.push(`decor ${id}: unlockLevel must be >= 1`);
    const { x, y, width, height } = d;
    if (!isNum(x) || !isNum(y) || !isNum(width) || !isNum(height) || width <= 0 || height <= 0) errors.push(`decor ${id}: needs x, y, width and height`);
    else if (x < 0 || y < 0 || x + width > 1699 || y + height > 926) errors.push(`decor ${id}: must lie inside the 1699 x 926 art`);
  });
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

export function assertValid(name: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${name} failed validation:\n- ${errors.join('\n- ')}`);
}
