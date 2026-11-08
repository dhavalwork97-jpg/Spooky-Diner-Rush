import { CrazyGames } from '../sdk/crazygames';
import { clampStep, stepFromLevel } from '../game/taco/tacoMenu';

export interface SaveData {
  /** 2 since Milestone 4. Version 1 saves load fine and get the new fields from defaults. */
  version: 2;
  level: number;
  xp: number;
  coins: number;
  /** Shop upgrades: upgrade id -> tier bought (0 or missing means none). */
  owned: Record<string, number>;
  /** Decor ids the player has bought. */
  decor: string[];
  /** Story card ids already shown, so each shows once. */
  seenStory: string[];
  /** Last restaurant played (see data/restaurants.json). */
  lastRestaurant: string;
  /** Restaurants the player owns (the diner always). Older saves have none of this and get just the diner. */
  restaurants: string[];
  /** Taco Truck menu step (1-10) and the XP towards the next one. Separate from Lv: buying the truck late still starts at 1. Saves from before this existed get a step worked out from Lv if the truck is already owned. */
  tacoStep: number;
  tacoXp: number;
  settings: { reduceMotion: boolean | null; musicVolume: number; sfxVolume: number; muted: boolean };
}

const KEY = 'chef-rush-save';

export function defaultSave(): SaveData {
  return {
    version: 2,
    level: 1,
    xp: 0,
    coins: 0,
    owned: {},
    decor: [],
    seenStory: [],
    lastRestaurant: 'burger_diner',
    restaurants: ['burger_diner'],
    tacoStep: 1,
    tacoXp: 0,
    settings: { reduceMotion: null, musicVolume: 0.6, sfxVolume: 0.8, muted: false },
  };
}

function read(key: string): string | null {
  const fromSdk = CrazyGames.getItem(key);
  if (fromSdk !== null) return fromSdk;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (CrazyGames.setItem(key, value)) return;
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable: play on without saving */
  }
}

const MAX_LIST = 200;

/** Keep only short non-empty strings, without repeats, and cap the length. */
function cleanIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0 && x.length <= 64 && !out.includes(x)) out.push(x);
    if (out.length >= MAX_LIST) break;
  }
  return out;
}

/** Owned restaurant ids: cleaned, and the diner is always owned. */
function ownedRestaurants(v: unknown): string[] {
  const ids = cleanIds(v);
  return ids.includes('burger_diner') ? ids : ['burger_diner', ...ids];
}

/** Keep only id -> whole-number tier (1 to 99) pairs. */
function cleanOwned(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
    if (k.length === 0 || k.length > 64 || typeof t !== 'number' || !Number.isFinite(t)) continue;
    const tier = Math.floor(t);
    if (tier >= 1 && tier <= 99) out[k] = tier;
    if (Object.keys(out).length >= MAX_LIST) break;
  }
  return out;
}

/** Merge unknown input over defaults so old or corrupt saves never crash the game. */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave();
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<SaveData>;
    const num = (v: unknown, d: number, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : d);
    return {
      version: 2,
      level: Math.max(1, Math.floor(num(p.level, base.level, 1))),
      xp: num(p.xp, base.xp),
      coins: Math.floor(num(p.coins, base.coins)),
      owned: cleanOwned(p.owned),
      decor: cleanIds(p.decor),
      seenStory: cleanIds(p.seenStory),
      lastRestaurant:
        typeof p.lastRestaurant === 'string' && p.lastRestaurant.length > 0 && p.lastRestaurant.length <= 64
          ? p.lastRestaurant
          : base.lastRestaurant,
      restaurants: ownedRestaurants(p.restaurants),
      tacoStep: typeof p.tacoStep === 'number' && Number.isFinite(p.tacoStep) ? clampStep(p.tacoStep) : cleanIds(p.restaurants).includes('taco_truck') ? stepFromLevel(Math.max(1, Math.floor(num(p.level, base.level, 1)))) : 1,
      tacoXp: num(p.tacoXp, 0),
      settings: {
        reduceMotion: typeof p.settings?.reduceMotion === 'boolean' ? p.settings.reduceMotion : null,
        musicVolume: Math.min(1, num(p.settings?.musicVolume, base.settings.musicVolume)),
        sfxVolume: Math.min(1, num(p.settings?.sfxVolume, base.settings.sfxVolume)),
        muted: p.settings?.muted === true,
      },
    };
  } catch {
    return base;
  }
}

export const SaveSystem = {
  data: defaultSave(),
  load(): SaveData {
    this.data = parseSave(read(KEY));
    return this.data;
  },
  save(): void {
    write(KEY, JSON.stringify(this.data));
  },
  /** Reduced motion: explicit setting wins, otherwise follow the OS preference. */
  reduceMotion(): boolean {
    if (this.data.settings.reduceMotion !== null) return this.data.settings.reduceMotion;
    try {
      return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      return false;
    }
  },
};
