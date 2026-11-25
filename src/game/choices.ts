import choicesJson from '../../data/choices.json';

// Chef's Choice: at a few Lv milestones each restaurant offers two perks and the player picks ONE (free to switch any time in the Shop).
// Every perk is only a multiplier on the mods the upgrades already use, so no new gameplay logic exists: the picks are folded into the mods once.
// The economy numbers, upgrade prices, ads and the reopen rewards are not touched.

export type ChoiceRestaurant = 'diner' | 'taco' | 'pizza';
export const CHOICE_RESTAURANTS: readonly ChoiceRestaurant[] = ['diner', 'taco', 'pizza'];

/** Mod name -> multiplier. Same names as the upgrades' mods (pourSpeed is the Taco Truck's own). */
export type ChoiceEffects = Partial<Record<'fryerSpeed' | 'grillSpeed' | 'ovenSpeed' | 'patience' | 'tips' | 'burnWindow' | 'calm' | 'pourSpeed', number>>;

export interface ChoiceOption {
  id: string;
  name: string;
  description: string;
  effects: ChoiceEffects;
}
export interface ChoiceSlot {
  id: string;
  unlockLevel: number;
  title: string;
  options: ChoiceOption[];
}
export interface ChoiceData {
  restaurants: Record<ChoiceRestaurant, { name: string; slots: ChoiceSlot[] }>;
}

export const choices = choicesJson as unknown as ChoiceData;
/** Saved picks: "restaurant:slot" -> option id. */
export type Picks = Record<string, string>;

const MAX_EFFECT = 1.3;
const key = (r: ChoiceRestaurant, slot: string): string => `${r}:${slot}`;

export const slotsFor = (r: ChoiceRestaurant, data: ChoiceData = choices): ChoiceSlot[] => data.restaurants[r]?.slots ?? [];
export const slotUnlocked = (slot: ChoiceSlot, level: number): boolean => level >= slot.unlockLevel;

/** The option picked in a slot, or null when nothing (valid) is picked or the slot is still locked. */
export function pickedOption(r: ChoiceRestaurant, slot: ChoiceSlot, picks: Picks, level: number): ChoiceOption | null {
  if (!slotUnlocked(slot, level)) return null;
  return slot.options.find((o) => o.id === picks[key(r, slot.id)]) ?? null;
}

/** New picks with `optionId` chosen in the slot, or null if the slot/option is unknown or the slot is still locked. Never mutates. */
export function pick(r: ChoiceRestaurant, slotId: string, optionId: string, picks: Picks, level: number, data: ChoiceData = choices): Picks | null {
  const slot = slotsFor(r, data).find((s) => s.id === slotId);
  if (!slot || !slotUnlocked(slot, level) || !slot.options.some((o) => o.id === optionId)) return null;
  return { ...picks, [key(r, slotId)]: optionId };
}

/** The mods with this restaurant's picked perks multiplied in. No picks (or locked slots) leave the mods exactly as they were. */
export function withChoices<T extends object>(mods: T, r: ChoiceRestaurant, picks: Picks | undefined, level: number, data: ChoiceData = choices): T {
  if (!picks) return mods;
  const out = { ...mods } as Record<string, number>;
  for (const slot of slotsFor(r, data)) {
    const o = pickedOption(r, slot, picks, level);
    if (!o) continue;
    for (const [k, v] of Object.entries(o.effects)) if (typeof v === 'number' && k in out) out[k] = out[k] * Math.min(MAX_EFFECT, Math.max(1, v));
  }
  return out as unknown as T;
}

/** Save cleaning: only string pairs for known slots and options survive. */
export function cleanPicks(v: unknown, data: ChoiceData = choices): Picks {
  const out: Picks = {};
  if (!v || typeof v !== 'object') return out;
  for (const r of CHOICE_RESTAURANTS) {
    for (const slot of slotsFor(r, data)) {
      const id = (v as Record<string, unknown>)[key(r, slot.id)];
      if (typeof id === 'string' && slot.options.some((o) => o.id === id)) out[key(r, slot.id)] = id;
    }
  }
  return out;
}

export function validateChoices(data: ChoiceData = choices): string[] {
  const errs: string[] = [];
  for (const r of CHOICE_RESTAURANTS) {
    const slots = slotsFor(r, data);
    if (slots.length === 0) errs.push(`${r}: no slots`);
    const seen = new Set<string>();
    for (const s of slots) {
      if (seen.has(s.id)) errs.push(`${r}: duplicate slot ${s.id}`);
      seen.add(s.id);
      if (s.options.length !== 2) errs.push(`${r}.${s.id}: needs exactly two options`);
      for (const o of s.options) {
        const vals = Object.entries(o.effects);
        if (vals.length === 0) errs.push(`${r}.${s.id}.${o.id}: no effect`);
        for (const [k, v] of vals) if (!(v >= 1 && v <= MAX_EFFECT)) errs.push(`${r}.${s.id}.${o.id}: ${k} must be 1 to ${MAX_EFFECT}`);
      }
    }
  }
  return errs;
}
