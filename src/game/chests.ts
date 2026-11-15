import chestsJson from '../../data/chests.json';

/**
 * Milestone chests: a chest card at Lv 5, 10 and 14. The player taps it open and gets coins (and, once decor exists, an optional decor piece
 * that only chests give). Each chest is claimed once (`SaveData.chestsOpened` holds the Lv of every claimed chest). A player who is already
 * past a milestone when this ships gets one claim card per missed chest. Pure logic (no Phaser), so it is unit tested.
 */
export interface ChestDef {
  id: string;
  /** The Lv at which the chest becomes claimable. Also the key stored in `chestsOpened`. */
  level: number;
  title: string;
  coins: number;
  /** Optional decor piece (data/decor.json) this chest gives, always a chest-only one. */
  decorId?: string;
}

export const defaultChests: ChestDef[] = (chestsJson as { chests: ChestDef[] }).chests;

/** Chests the player has reached and not claimed yet, lowest Lv first. */
export function dueChests(chests: readonly ChestDef[], level: number, opened: readonly number[]): ChestDef[] {
  return chests.filter((c) => c.level <= level && !opened.includes(c.level)).sort((a, b) => a.level - b.level);
}

/** The claimed list after claiming `c` (never repeats a Lv). */
export const openedAfter = (opened: readonly number[], c: ChestDef): number[] => (opened.includes(c.level) ? [...opened] : [...opened, c.level].sort((a, b) => a - b));

/** Problems with the chest data. `decorIds` are the chest-only decor pieces that exist (empty until decor is added). */
export function validateChests(chests: readonly ChestDef[], decorIds: readonly string[] = []): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const levels = new Set<number>();
  for (const c of chests) {
    if (!c.id || ids.has(c.id)) errors.push(`chest ${c.id || '?'}: missing or duplicate id`);
    ids.add(c.id);
    if (!Number.isInteger(c.level) || c.level < 2) errors.push(`chest ${c.id}: level must be a whole number >= 2`);
    if (levels.has(c.level)) errors.push(`chest ${c.id}: Lv ${c.level} already has a chest`);
    levels.add(c.level);
    if (!c.title || c.title.length > 24) errors.push(`chest ${c.id}: title must be 1 to 24 characters`);
    if (!Number.isInteger(c.coins) || c.coins < 1 || c.coins > 1000) errors.push(`chest ${c.id}: coins must be a whole number from 1 to 1000`);
    if (c.decorId !== undefined && !decorIds.includes(c.decorId)) errors.push(`chest ${c.id}: decorId ${c.decorId} is not a chest-only decor piece`);
  }
  return errors;
}
