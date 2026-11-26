import recipesJson from '../../data/recipes.json';
import progressionJson from '../../data/progression.json';
import xpJson from '../../data/xp.json';
import customersJson from '../../data/customers.json';
import comboJson from '../../data/combo.json';
import wavesJson from '../../data/waves.json';
import eventsJson from '../../data/events.json';
import upgradesJson from '../../data/upgrades.json';
import careerJson from '../../data/career.json';
import chefJson from '../../data/chef.json';
import storyJson from '../../data/story.json';
import decorJson from '../../data/decor.json';
import recipebookJson from '../../data/recipebook.json';
import restaurantMenuJson from '../../data/restaurant_menu.json';

export type ItemKind = 'fries' | 'nuggets' | 'pizza' | 'burger' | 'cheeseburger' | 'garden_burger' | 'deluxe_burger' | 'drink' | 'icecream';

/** The plain burger and its variants (they share the grill, the buns and the plates). */
export const BURGER_KINDS: readonly ItemKind[] = ['burger', 'cheeseburger', 'garden_burger', 'deluxe_burger'];
export const isBurgerKind = (k: ItemKind): boolean => BURGER_KINDS.includes(k);

export interface RecipeSettings {
  plateSlots: number;
  sideSlots: number;
  /** Plates that only hold finished pizzas (the two dough bases), so burgers can never block the oven. */
  pizzaSlots: number;
  fryVats: number;
  ovens: number;
  grillBurners: number;
  /** Cups the drinks dispenser can fill at once. */
  drinkSpouts: number;
  /** Cones the ice cream machine can swirl at once (one lane each). */
  iceCreamMachines: number;
  beginnerMaxLevel: number;
  beginnerBurnBonus: number;
  trashPenaltyCoins: number;
  burnReputationPenalty: number;
}
export interface ItemDef {
  name: string;
  unlockLevel: number;
  price: number;
  xp: number;
  readyAfter?: number;
  sideSeconds?: number;
  burnWindow: number;
  layers?: string[];
}
export interface LevelDef {
  level: number;
  maxCustomers: number;
  arrivalGap: [number, number];
  orderSize: [number, number];
  patience: number;
  items: ItemKind[];
  /** Customer type weights. Missing means regular only. */
  types?: Record<string, number>;
  unlocks: string[];
}
export interface CustomerType {
  name: string;
  patienceMult: number;
  payMult: number;
  tipMult: number;
  repMult: number;
  extraItems: number;
}
export interface EventDef {
  id: string;
  name: string;
  minLevel: number;
  duration: number;
  arrivalMult?: number;
  coinMult?: number;
  ovenSpeed?: number;
  spawnType?: string;
  /** Look only (spooky events): which change the room gets. 'moon' brightens the moon, 'lights' makes the lamps flicker and turn green. Reduced motion shows both still. */
  look?: 'moon' | 'lights';
  /** Bat Delivery: the bat flies `flights` times; tapping it drops a bag worth a coin amount in `coins`; at most `maxDrops` bags per event. */
  bat?: { flights: number; coins: [number, number]; maxDrops: number };
  /** Ghost Party: `size` customers arrive together once `size` seats are free; serving all of them with nobody leaving angry pays `bonus` (a fraction) of what they paid, once. */
  party?: { size: number; bonus: number };
}
/** Which `KitchenState.mods` field an upgrade sets. */
export type ModKey = 'fryerSpeed' | 'grillSpeed' | 'ovenSpeed' | 'patience' | 'tips' | 'burnWindow' | 'calm';
export interface UpgradeTier {
  cost: number;
  /** The value the mod has once this tier is bought (not an increment). Most mods multiply; `calm` divides the burn penalty. */
  value: number;
}
export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  mod: ModKey;
  unlockLevel: number;
  tiers: UpgradeTier[];
}
export interface CareerTitle {
  minLevel: number;
  title: string;
}
export interface ChefTrigger {
  lines: string[];
  once?: boolean;
  /** Skips the global cooldown and the trigger's own cooldown. */
  priority?: boolean;
}
export interface ChefConfig {
  /** Seconds between any two bubbles. */
  cooldown: number;
  /** Seconds before the same trigger can speak again. */
  triggerCooldown: number;
  /** Seconds a bubble stays up. */
  hold: number;
  triggers: Record<string, ChefTrigger>;
}
export interface StoryCardDef {
  id: string;
  level: number;
  title: string;
  text: string;
}
export interface DecorDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  unlockLevel: number;
  /** Position and size in source-image pixels (the kitchen art is 1699 x 948). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Supplied art (a name in public/assets/diner_extras/decor, loaded on demand). Without it the piece is code-drawn like the first three. */
  art?: string;
  /** Small bonus while the piece is on display. Only existing mod keys; the total per mod is capped (see DECOR_PERK_CAP). */
  perk?: { mod: ModKey; pct: number };
  /** Given by a milestone chest, never sold in the shop. */
  chestOnly?: boolean;
}
export interface GameConfig {
  recipes: { settings: RecipeSettings; items: Record<ItemKind, ItemDef> };
  progression: {
    levels: LevelDef[];
    afterLast: { patienceStepPerLevel: number; patienceFloor: number; arrivalGapStepPerLevel?: number; arrivalGapFloor?: [number, number] };
    /** Optional diner-only late-game ramp (the Taco Truck and Pizza Place keep using `levels`/`afterLast`). */
    dinerRamp?: {
      levels: Record<string, { maxCustomers: number; arrivalGap: [number, number]; patience: number; items?: ItemKind[]; unlocks?: string[] }>;
      afterLast: { patienceStepPerLevel: number; patienceFloor: number; arrivalGapStepPerLevel?: number; arrivalGapFloor?: [number, number] };
    };
  };
  xp: {
    base: number;
    perLevel: number;
    /** Optional gentler slope for Lv 3 to `earlyUntilLevel`: XP to leave level n is base + earlyPerLevel * n there. Lv 1-2 and every level after keep the normal curve. */
    earlyPerLevel?: number;
    earlyUntilLevel?: number;
    /** Optional XP to leave Lv 1 only (the very first level-up). Every other level ignores it. Lets the first level-up land inside the first minute. */
    firstLevelXp?: number;
    speedBonusXp: number;
    speedBonusPatienceFraction: number;
    levelUpCoins: { base: number; perLevel: number };
    tipFraction: number;
    reputation: { start: number; angryLeave: number; serveGain: number; reopenTo: number };
  };
  customers: { types: Record<string, CustomerType> };
  combo: {
    maxCombo: number;
    multiplierPerStep: number;
    maxMultiplier: number;
    comboReputationFrom: number;
    comboReputationGain: number;
    rush: { patienceFraction: number; tipMultiplier: number; bonusXp: number };
    wrongItemPatiencePenalty: number;
    streak: { servesNeeded: number; bonusXp: number };
  };
  waves: { phases: { name: string; seconds: number; gapMult: number }[] };
  events: { firstAfter: number; gap: [number, number]; events: EventDef[] };
  upgrades: { upgrades: UpgradeDef[] };
  career: { titles: CareerTitle[] };
  chef: ChefConfig;
  story: { cards: StoryCardDef[] };
  decor: { items: DecorDef[] };
  recipebook: { entries: { id: string; steps: string[] }[] };
  restaurantMenu: { comingSoon: { id: string; name: string; unlockLevel: number }[] };
}

export const defaultConfig: GameConfig = {
  recipes: recipesJson as unknown as GameConfig['recipes'],
  progression: progressionJson as unknown as GameConfig['progression'],
  xp: xpJson as unknown as GameConfig['xp'],
  customers: customersJson as unknown as GameConfig['customers'],
  combo: comboJson as unknown as GameConfig['combo'],
  waves: wavesJson as unknown as GameConfig['waves'],
  events: eventsJson as unknown as GameConfig['events'],
  upgrades: upgradesJson as unknown as GameConfig['upgrades'],
  career: careerJson as unknown as GameConfig['career'],
  chef: chefJson as unknown as GameConfig['chef'],
  story: storyJson as unknown as GameConfig['story'],
  decor: decorJson as unknown as GameConfig['decor'],
  recipebook: recipebookJson as unknown as GameConfig['recipebook'],
  restaurantMenu: restaurantMenuJson as unknown as GameConfig['restaurantMenu'],
};

/**
 * Progression entry for a level. Past the last entry, patience slowly tightens down to a floor and
 * (when set) the arrival gaps shrink by a step per level down to a floor, so late levels keep
 * getting busier after patience stops moving. Customer types and order size stay as in the last entry.
 */
export function levelDef(cfg: GameConfig, level: number): LevelDef {
  const levels = cfg.progression.levels;
  const exact = levels.find((l) => l.level === level);
  if (exact) return exact;
  const last = levels[levels.length - 1];
  const extra = Math.max(0, level - last.level);
  const after = cfg.progression.afterLast;
  const patience = Math.max(after.patienceFloor, last.patience + extra * after.patienceStepPerLevel);
  let arrivalGap = last.arrivalGap;
  if (after.arrivalGapStepPerLevel && after.arrivalGapFloor) {
    const step = extra * after.arrivalGapStepPerLevel;
    const [fLo, fHi] = after.arrivalGapFloor;
    arrivalGap = [Math.max(fLo, last.arrivalGap[0] + step), Math.max(fHi, last.arrivalGap[1] + step)];
  }
  return { ...last, level, patience, arrivalGap, unlocks: [] };
}

/** The diner's own customer table: `levelDef` with the diner-only late ramp laid over it (no ramp in data = same as `levelDef`). */
export function dinerLevelDef(cfg: GameConfig, level: number): LevelDef {
  const base = levelDef(cfg, level);
  const ramp = cfg.progression.dinerRamp;
  if (!ramp) return base;
  const keys = Object.keys(ramp.levels).map(Number).filter((n) => Number.isFinite(n));
  if (keys.length === 0) return base;
  const lastKey = Math.max(...keys);
  const row = ramp.levels[String(level)];
  if (row) return { ...base, ...row };
  if (level < lastKey) return base;
  const last = ramp.levels[String(lastKey)];
  const extra = level - lastKey;
  const a = ramp.afterLast;
  const patience = Math.max(a.patienceFloor, last.patience + extra * a.patienceStepPerLevel);
  let arrivalGap = last.arrivalGap;
  if (a.arrivalGapStepPerLevel && a.arrivalGapFloor) {
    const step = extra * a.arrivalGapStepPerLevel;
    arrivalGap = [Math.max(a.arrivalGapFloor[0], last.arrivalGap[0] + step), Math.max(a.arrivalGapFloor[1], last.arrivalGap[1] + step)];
  }
  return { ...base, maxCustomers: last.maxCustomers, patience, arrivalGap, ...(last.items ? { items: last.items } : {}) };
}

/** First level the early curve applies to: Lv 2 stays as tuned; Lv 1 has its own optional value (`firstLevelXp`). */
export const EARLY_XP_FROM_LEVEL = 3;

/** XP needed to leave `level`. The mid-game (Lv 3 to earlyUntilLevel) can be made gentler in data so casual players reach the pizza level sooner. */
export const xpForLevel = (cfg: GameConfig, level: number): number => {
  const { base, perLevel, earlyPerLevel, earlyUntilLevel, firstLevelXp } = cfg.xp;
  if (level === 1 && firstLevelXp !== undefined) return firstLevelXp;
  if (earlyPerLevel !== undefined && earlyUntilLevel !== undefined && level >= EARLY_XP_FROM_LEVEL && level <= earlyUntilLevel) return base + earlyPerLevel * level;
  return base + perLevel * level;
};

/** Items that cook in a fryer vat. */
export type FriedKind = 'fries' | 'nuggets';
