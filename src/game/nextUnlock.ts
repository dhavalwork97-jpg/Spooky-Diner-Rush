import { dinerLevelDef, xpForLevel, type GameConfig, type ItemKind } from './config';
import { recipeEntries } from './recipebook';

// Recovery M3: what the player is working towards. Pure helpers (no Phaser) used by the level-up card and the Recipe Book.
// They only read data (progression.json unlock texts, recipes.json unlock levels, xp.json): nothing here unlocks or changes anything.

export interface NextUnlock {
  /** The diner Lv that brings it. */
  level: number;
  /** The unlock text from data/progression.json, e.g. "Cheeseburger and the toppings tray". */
  text: string;
  /** How many more Lv to get there (1 = the very next Lv). */
  levelsAway: number;
}

/** How far ahead to look for the next unlock text. The diner's list ends at Lv 20, so this is generous. */
const HORIZON = 40;

/** The nearest diner Lv above `level` that has an unlock text, or undefined when there is none left (the diner is "complete"). */
export function nextUnlock(cfg: GameConfig, level: number): NextUnlock | undefined {
  for (let lv = level + 1; lv <= level + HORIZON; lv++) {
    const unlocks = dinerLevelDef(cfg, lv).unlocks;
    if (unlocks.length > 0) return { level: lv, text: unlocks.join(' and '), levelsAway: lv - level };
  }
  return undefined;
}

export interface RecipeProgress {
  unlocked: number;
  total: number;
  /** The nearest dish that is still locked. */
  next?: { id: ItemKind; name: string; unlockLevel: number; levelsAway: number };
}

/** How many of the diner's dishes are open at `level`, and which one comes next. */
export function recipeProgress(cfg: GameConfig, level: number): RecipeProgress {
  const entries = recipeEntries(cfg, level);
  const locked = entries.filter((e) => e.locked);
  const first = locked[0]; // recipeEntries sorts by unlock level
  return {
    unlocked: entries.length - locked.length,
    total: entries.length,
    next: first ? { id: first.id, name: first.name, unlockLevel: first.unlockLevel, levelsAway: first.unlockLevel - level } : undefined,
  };
}

/** The "Lv to go" wording: "1 more Lv" or "3 more Lv". */
export const levelsToGo = (n: number): string => `${n} more Lv`;

/**
 * Extra lines for the level-up card, for a player who has just reached `level`: what comes next and how much XP the next Lv needs.
 * Kept short (the card is up for under 3 seconds). Empty when there is nothing to add.
 */
export function levelUpHints(cfg: GameConfig, level: number): string[] {
  const out: string[] = [];
  const n = nextUnlock(cfg, level);
  if (n) out.push(`Next at Lv ${n.level}: ${n.text}`);
  out.push(`${xpForLevel(cfg, level)} XP to Lv ${level + 1}`);
  return out;
}
