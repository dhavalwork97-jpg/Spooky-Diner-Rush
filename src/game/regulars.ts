import regularsJson from '../../data/regulars.json';
import type { ItemKind } from './config';

/**
 * Named regulars: six ghosts who come back. From Lv 8 about one arrival in ten is a regular. A regular always orders their favourite dish
 * (it is in their order) and tips 30 percent more when served fast. Each is drawn with their existing ghost look plus a name tag and a heart.
 * Pure logic (no Phaser), so it is unit tested.
 */
export interface RegularDef {
  id: string;
  name: string;
  /** Index of an existing customer look (see CUSTOMER_LOOKS). */
  look: number;
  favorite: ItemKind;
  fromLevel: number;
}
export interface RegularSettings {
  /** Chance that an arrival is a regular, once one is eligible. */
  chance: number;
  /** Extra fraction on the tip of a regular served fast (0.3 = +30 percent). */
  tipBonus: number;
}

const data = regularsJson as { settings: RegularSettings; regulars: RegularDef[] };
export const defaultRegulars: RegularDef[] = data.regulars;
export const defaultRegularSettings: RegularSettings = data.settings;

/** Regulars that may arrive now: their Lv is reached, their favourite dish is on the menu, and they are not already seated. */
export function eligibleRegulars(regulars: readonly RegularDef[], level: number, menu: readonly ItemKind[], seated: readonly string[]): RegularDef[] {
  return regulars.filter((r) => r.fromLevel <= level && menu.includes(r.favorite) && !seated.includes(r.id));
}

/** The tip after the regular bonus (0 stays 0: no fast serve, no tip, no bonus). */
export const regularTip = (tip: number, bonus: number): number => Math.round(tip * (1 + bonus));

/** Problems with the data. `lookCount` and `lookMin` are CUSTOMER_LOOK_COUNT and CUSTOMER_LOOK_MIN; `unlock` maps each dish to its Lv. */
export function validateRegulars(
  regulars: readonly RegularDef[],
  settings: RegularSettings,
  lookCount: number,
  lookMin: number,
  unlock: Readonly<Record<string, number>>,
): string[] {
  const errors: string[] = [];
  if (!(settings.chance > 0 && settings.chance <= 0.25)) errors.push('regulars: chance must be above 0 and at most 0.25');
  if (!(settings.tipBonus >= 0 && settings.tipBonus <= 0.5)) errors.push('regulars: tipBonus must be 0 to 0.5');
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const r of regulars) {
    const w = `regular ${r.id || '?'}`;
    if (!r.id || ids.has(r.id)) errors.push(`${w}: missing or duplicate id`);
    ids.add(r.id);
    if (!r.name || r.name.length > 14) errors.push(`${w}: name must be 1 to 14 characters (it has to fit the tag)`);
    if (names.has(r.name)) errors.push(`${w}: duplicate name`);
    names.add(r.name);
    if (!Number.isInteger(r.look) || r.look < lookMin || r.look >= lookCount) errors.push(`${w}: look ${r.look} is not an existing ghost look (${lookMin} to ${lookCount - 1})`);
    if (unlock[r.favorite] === undefined) errors.push(`${w}: unknown favourite ${r.favorite}`);
    if (!Number.isInteger(r.fromLevel) || r.fromLevel < 2) errors.push(`${w}: fromLevel must be a whole number >= 2`);
  }
  return errors;
}
