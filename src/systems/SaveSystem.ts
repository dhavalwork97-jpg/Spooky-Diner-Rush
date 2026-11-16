import { seedMasteryPaid } from '../game/taco/tacoExtras';
import { CrazyGames } from '../sdk/crazygames';
import { defaultTacoConfig } from '../game/taco/tacoConfig';
import { seedLearned } from '../game/taco/tacoLearning';
import { clampStep, stepFromLevel } from '../game/taco/tacoMenu';
import { defaultIntros, introsSeededFor } from '../game/intros';

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
  /** Mastery badges: item id -> number of fast serves (see src/game/extras.ts). Missing in older saves. */
  mastery: Record<string, number>;
  /** Day (YYYY-MM-DD, player's own clock) the Daily Special was last served, or '' for never. */
  specialDay: string;
  /** Daily login bonus: the last visit's local day (YYYY-MM-DD, '' = never) and the days-in-a-row count. Missing in older saves. */
  lastLoginDay: string;
  loginStreak: number;
  /** The Taco Truck's own upgrades: upgrade id -> tier bought. Separate from `owned` (the diner's). */
  tacoOwned: Record<string, number>;
  /** Times each Taco Truck dish was served: decides when a new dish counts as learned. Saves from before this get every dish older than the current menu step as learned. */
  tacoServed: Record<string, number>;
  /** Pointer tutorial state per Taco Truck dish: times shown (1, 2) or 9 once done. */
  tacoLessons: Record<string, number>;
  /** Station intro cards already shown (ids from data/intros.json). A save from before they existed gets every unlock at or below its Lv as seen. */
  seenIntros: string[];
  /** Milestone chests opened, by the Lv they belong to (5, 10, 14). A player already past a milestone gets one claim card per missing chest. */
  chestsOpened: number[];
  /** Taco mastery badges already paid: dish id -> tiers paid (1 bronze to 3 gold). Missing in older saves: whatever their serve counts already earned counts as paid (no payout). */
  tacoMastery: Record<string, number>;
  /** Taco badges earned (ids from data/taco.json "badges") and their counters. */
  tacoBadges: string[];
  tacoStats: Record<string, number>;
  /** The all-16-bronze coin bonus has been paid. */
  tacoMasteryBonus: boolean;
  /** Taco milestone chests opened, by menu step (3, 6, 10). A player already past a step gets one claim card per missing chest. */
  tacoChests: number[];
  /** Badges earned (ids from data/badges.json). */
  badges: string[];
  /** Lifetime counters behind the badges (id -> count). Additive; missing in older saves. */
  stats: Record<string, number>;
  settings: { reduceMotion: boolean | null; musicVolume: number; sfxVolume: number; muted: boolean };
}

const KEY = 'spooky-diner-rush-save';
/** The key used before the rename. Still read once so nobody loses progress; never written and never deleted (it stays as a backup). */
export const LEGACY_SAVE_KEY = 'chef-rush-save';

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
    mastery: {},
    specialDay: '',
    lastLoginDay: '',
    loginStreak: 0,
    tacoOwned: {},
    tacoServed: {},
    tacoLessons: {},
    seenIntros: [],
    chestsOpened: [],
    tacoMastery: {},
    tacoMasteryBonus: false,
    tacoBadges: [],
    tacoStats: {},
    tacoChests: [],
    badges: [],
    stats: {},
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

/** Keep only id -> whole-number count (1 to 100000) pairs. */
function cleanCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
    if (k.length === 0 || k.length > 64 || typeof t !== 'number' || !Number.isFinite(t)) continue;
    const n = Math.floor(t);
    if (n >= 1) out[k] = Math.min(n, 100000);
    if (Object.keys(out).length >= MAX_LIST) break;
  }
  return out;
}

/** Whole numbers only (a milestone Lv), without repeats, sorted. */
function cleanLevels(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) if (typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 1000 && !out.includes(x)) out.push(x);
  return out.sort((a, b) => a - b).slice(0, 50);
}

/** Merge unknown input over defaults so old or corrupt saves never crash the game. */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave();
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<SaveData>;
    const num = (v: unknown, d: number, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : d);
    const tacoStep = typeof p.tacoStep === 'number' && Number.isFinite(p.tacoStep) ? clampStep(p.tacoStep) : cleanIds(p.restaurants).includes('taco_truck') ? stepFromLevel(Math.max(1, Math.floor(num(p.level, base.level, 1)))) : 1;
    // A save from before dish learning: the player already knows every dish that joined the menu before their current step.
    const seeded = seedLearned(defaultTacoConfig, tacoStep);
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
      tacoStep,
      tacoXp: num(p.tacoXp, 0),
      mastery: cleanCounts(p.mastery),
      lastLoginDay: typeof p.lastLoginDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.lastLoginDay) ? p.lastLoginDay : '',
      loginStreak: typeof p.loginStreak === 'number' && Number.isFinite(p.loginStreak) ? Math.min(100000, Math.max(0, Math.floor(p.loginStreak))) : 0,
      specialDay: typeof p.specialDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.specialDay) ? p.specialDay : '',
      tacoOwned: cleanOwned(p.tacoOwned),
      tacoServed: p.tacoServed === undefined ? seeded.served : cleanOwned(p.tacoServed),
      tacoLessons: p.tacoLessons === undefined ? seeded.lessons : cleanOwned(p.tacoLessons),
      seenIntros: p.seenIntros === undefined ? introsSeededFor(defaultIntros, Math.max(1, Math.floor(num(p.level, base.level, 1)))) : cleanIds(p.seenIntros),
      chestsOpened: cleanLevels(p.chestsOpened),
      tacoMastery: p.tacoMastery === undefined ? seedMasteryPaid(p.tacoServed === undefined ? seeded.served : cleanOwned(p.tacoServed)) : cleanCounts(p.tacoMastery),
      tacoMasteryBonus: p.tacoMasteryBonus === true,
      tacoBadges: cleanIds(p.tacoBadges),
      tacoStats: cleanCounts(p.tacoStats),
      tacoChests: cleanLevels(p.tacoChests),
      badges: cleanIds(p.badges),
      stats: cleanCounts(p.stats),
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
    this.data = parseSave(read(KEY) ?? read(LEGACY_SAVE_KEY)); // the next save() writes the new key
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
