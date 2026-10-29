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

export function assertValid(name: string, errors: string[]): void {
  if (errors.length > 0) throw new Error(`${name} failed validation:\n- ${errors.join('\n- ')}`);
}
