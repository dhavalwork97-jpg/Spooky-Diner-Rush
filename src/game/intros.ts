import introsJson from '../../data/intros.json';
import type { ZoneDef } from '../kitchen/zones';

/**
 * Station intro cards: when a station unlocks, a short card says "New: <name>!" and the station glows for a few seconds. Each card shows
 * once per player (`SaveData.seenIntros`). Names and zones come from data/intros.json. Pure logic (no Phaser), so it is unit tested.
 */
export interface IntroDef {
  id: string;
  level: number;
  name: string;
  /** Zone ids (data/restaurants.json) that unlock at `level` and glow with this card. */
  zones: string[];
}

export const defaultIntros: IntroDef[] = (introsJson as { cards: IntroDef[] }).cards;

/** How long the glow ring stays, at most (it ends sooner when the player taps the station). */
export const INTRO_GLOW_MS = 4000;

export const introText = (d: IntroDef): string => `New: ${d.name}!`;

/** Cards the player has reached and not seen yet, lowest level first. */
export function dueIntros(intros: readonly IntroDef[], level: number, seen: readonly string[]): IntroDef[] {
  return intros.filter((d) => d.level <= level && !seen.includes(d.id)).sort((a, b) => a.level - b.level);
}

/** The seen list after showing `id` (never repeats an id). */
export const seenAfterIntro = (seen: readonly string[], id: string): string[] => (seen.includes(id) ? [...seen] : [...seen, id]);

/** For a save from before intro cards existed: every unlock at or below the player's Lv counts as already seen. */
export const introsSeededFor = (intros: readonly IntroDef[], level: number): string[] => intros.filter((d) => d.level <= level).map((d) => d.id);

/** Problems with the cards, checked against the diner's zones: every station that unlocks after Lv 1 needs a card, at the right Lv. */
export function validateIntros(cards: readonly IntroDef[], zones: readonly ZoneDef[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const covered = new Set<string>();
  for (const c of cards) {
    if (!c.id || ids.has(c.id)) errors.push(`intro ${c.id || '?'}: missing or duplicate id`);
    ids.add(c.id);
    if (!c.name || c.name.length > 28) errors.push(`intro ${c.id}: name must be 1 to 28 characters`);
    if (!Number.isInteger(c.level) || c.level < 2) errors.push(`intro ${c.id}: level must be a whole number >= 2`);
    if (c.zones.length === 0) errors.push(`intro ${c.id}: needs at least one zone`);
    for (const zid of c.zones) {
      const z = zones.find((x) => x.id === zid);
      if (!z) errors.push(`intro ${c.id}: unknown zone ${zid}`);
      else if (z.unlockLevel !== c.level) errors.push(`intro ${c.id}: zone ${zid} unlocks at Lv ${z.unlockLevel}, not Lv ${c.level}`);
      if (covered.has(zid)) errors.push(`intro ${c.id}: zone ${zid} is in two cards`);
      covered.add(zid);
    }
  }
  for (const z of zones) if (z.unlockLevel > 1 && !covered.has(z.id)) errors.push(`zone ${z.id} (Lv ${z.unlockLevel}) has no intro card`);
  return errors;
}
