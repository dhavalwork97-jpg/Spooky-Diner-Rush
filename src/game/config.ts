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

export type ItemKind = 'fries' | 'nuggets' | 'pizza' | 'burger';

export interface RecipeSettings {
  plateSlots: number;
  sideSlots: number;
  fryVats: number;
  ovens: number;
  grillBurners: number;
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
}
/** Which `KitchenState.mods` field an upgrade sets. */
export type ModKey = 'fryerSpeed' | 'grillSpeed' | 'ovenSpeed' | 'patience' | 'tips';
export interface UpgradeTier {
  cost: number;
  /** The multiplier the mod has once this tier is bought (not an increment). */
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
export interface GameConfig {
  recipes: { settings: RecipeSettings; items: Record<ItemKind, ItemDef> };
  progression: { levels: LevelDef[]; afterLast: { patienceStepPerLevel: number; patienceFloor: number } };
  xp: {
    base: number;
    perLevel: number;
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
};

/** Progression entry for a level. Past the last entry, patience slowly tightens down to a floor. */
export function levelDef(cfg: GameConfig, level: number): LevelDef {
  const levels = cfg.progression.levels;
  const exact = levels.find((l) => l.level === level);
  if (exact) return exact;
  const last = levels[levels.length - 1];
  const extra = Math.max(0, level - last.level);
  const patience = Math.max(
    cfg.progression.afterLast.patienceFloor,
    last.patience + extra * cfg.progression.afterLast.patienceStepPerLevel,
  );
  return { ...last, level, patience, unlocks: [] };
}

export const xpForLevel = (cfg: GameConfig, level: number): number => cfg.xp.base + cfg.xp.perLevel * level;

/** Items that cook in a fryer vat. */
export type FriedKind = 'fries' | 'nuggets';
