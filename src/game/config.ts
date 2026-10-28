import recipesJson from '../../data/recipes.json';
import progressionJson from '../../data/progression.json';
import xpJson from '../../data/xp.json';
import customersJson from '../../data/customers.json';

export type ItemKind = 'fries' | 'nuggets' | 'burger';

export interface RecipeSettings {
  plateSlots: number;
  sideSlots: number;
  fryVats: number;
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
  unlocks: string[];
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
  customers: {
    types: Record<string, { patienceMult: number; tipMult: number; weight: number }>;
    looks: { id: string; skin: string; hair: string; shirt: string }[];
  };
}

export const defaultConfig: GameConfig = {
  recipes: recipesJson as unknown as GameConfig['recipes'],
  progression: progressionJson as unknown as GameConfig['progression'],
  xp: xpJson as unknown as GameConfig['xp'],
  customers: customersJson as unknown as GameConfig['customers'],
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
