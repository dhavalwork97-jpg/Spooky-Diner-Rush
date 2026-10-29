import type { GameConfig, ItemKind } from './config';

export interface RecipeEntry {
  id: ItemKind;
  name: string;
  price: number;
  xp: number;
  unlockLevel: number;
  locked: boolean;
  steps: string[];
}

/** One entry per menu item, easiest first (by unlock level). Locked entries stay listed with "Lv N". */
export function recipeEntries(cfg: GameConfig, level: number): RecipeEntry[] {
  const out: RecipeEntry[] = [];
  for (const [id, def] of Object.entries(cfg.recipes.items) as [ItemKind, GameConfig['recipes']['items'][ItemKind]][]) {
    const steps = cfg.recipebook.entries.find((e) => e.id === id)?.steps ?? [];
    out.push({ id, name: def.name, price: def.price, xp: def.xp, unlockLevel: def.unlockLevel, locked: level < def.unlockLevel, steps });
  }
  return out.sort((a, b) => a.unlockLevel - b.unlockLevel || a.name.localeCompare(b.name));
}
