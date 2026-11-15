import tacoJson from '../../../data/taco.json';
import type { EventDef } from '../config';
import { type ChestDef, dueChests, openedAfter, validateChests } from '../chests';
import { eligibleRegulars, regularTip, validateRegulars, type RegularDef, type RegularSettings } from '../regulars';
import { validateEvents } from '../spooky';
import type { DishDef, DishKind, Protein } from './tacoConfig';

/**
 * Taco Truck extras, pure logic (no Phaser): the mastery grid, named regulars, milestone chests, the truck's own events and the haunted
 * window (moon and mansion lights). Everything is gated by the truck's MENU STEP, never by Lv. The numbers live in data/taco.json.
 * The chest, regular and event rules are the same shared modules the diner uses (chests.ts, regulars.ts, spooky.ts); the only difference is
 * that the number they compare against is the menu step.
 */

const raw = tacoJson as unknown as {
  mastery: { fromStep: number; tiers: TacoMasteryTier[]; allBronzeCoins: number };
  regulars: { settings: TacoRegularSettings; regulars: TacoRegularDef[] };
  chests: { id: string; step: number; title: string; coins: number }[];
  events: TacoEventDef[];
  haunted: HauntedDef;
};

// ---------------------------------------------------------------- mastery grid (B1)

export interface TacoMasteryTier {
  id: string;
  name: string;
  /** Serves of the dish (any serve counts) to earn this badge. */
  serves: number;
  coins: number;
}
export const TACO_PROTEINS: readonly Protein[] = ['chicken', 'shrimp', 'fish', 'veggies'];
export const TACO_FORMATS: readonly DishKind[] = ['soft_taco', 'crispy_taco', 'burrito', 'nachos'];
export const tacoMasteryTiers: TacoMasteryTier[] = raw.mastery.tiers;
export const tacoMasteryFromStep: number = raw.mastery.fromStep;
export const tacoAllBronzeCoins: number = raw.mastery.allBronzeCoins;

/** How many badge tiers a serve count has earned (0 to 3). */
export const masteryTierFor = (count: number, tiers: readonly TacoMasteryTier[] = tacoMasteryTiers): number => tiers.filter((t) => count >= t.serves).length;

export interface MasteryCell {
  dish: string;
  name: string;
  protein: Protein;
  kind: DishKind;
  count: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold. */
  tier: number;
  /** The next badge and how many more serves it needs, or null once gold. */
  next: { name: string; remaining: number } | null;
  /** On the menu at this menu step. */
  onMenu: boolean;
}

/** The 4 x 4 grid, row = protein, column = format, in a fixed order. */
export function masteryGrid(dishes: readonly DishDef[], served: Readonly<Record<string, number>>, menuStep: number, tiers: readonly TacoMasteryTier[] = tacoMasteryTiers): MasteryCell[][] {
  return TACO_PROTEINS.map((protein) =>
    TACO_FORMATS.map((kind): MasteryCell => {
      const d = dishes.find((x) => x.protein === protein && x.kind === kind);
      if (!d) throw new Error(`no taco dish for ${protein} ${kind}`);
      const count = Math.max(0, Math.floor(served[d.id] ?? 0));
      const tier = masteryTierFor(count, tiers);
      return { dish: d.id, name: d.name, protein, kind, count, tier, next: tier < tiers.length ? { name: tiers[tier].name, remaining: tiers[tier].serves - count } : null, onMenu: d.unlockStep <= menuStep };
    }),
  );
}

export interface MasteryAward {
  dish: string;
  /** The tier reached (1 bronze, 2 silver, 3 gold). */
  tier: number;
  name: string;
  coins: number;
}

/** Badges earned by `served` that `paid` (dish -> tiers already paid) does not yet cover, lowest tier first. */
export function masteryDue(served: Readonly<Record<string, number>>, paid: Readonly<Record<string, number>>, tiers: readonly TacoMasteryTier[] = tacoMasteryTiers): MasteryAward[] {
  const out: MasteryAward[] = [];
  for (const [dish, n] of Object.entries(served)) {
    const have = masteryTierFor(n, tiers);
    for (let t = (paid[dish] ?? 0) + 1; t <= have; t++) out.push({ dish, tier: t, name: tiers[t - 1].name, coins: tiers[t - 1].coins });
  }
  return out.sort((a, b) => a.tier - b.tier || a.dish.localeCompare(b.dish));
}

/** The paid map after paying `awards` (never goes down). */
export function paidAfter(paid: Readonly<Record<string, number>>, awards: readonly MasteryAward[]): Record<string, number> {
  const next = { ...paid };
  for (const a of awards) next[a.dish] = Math.max(next[a.dish] ?? 0, a.tier);
  return next;
}

/** A save from before the grid: whatever the counts already earned counts as paid, so nobody is handed a pile of coins (the grid still shows it earned). */
export const seedMasteryPaid = (served: Readonly<Record<string, number>>, tiers: readonly TacoMasteryTier[] = tacoMasteryTiers): Record<string, number> =>
  Object.fromEntries(Object.entries(served).flatMap(([d, n]) => (masteryTierFor(n, tiers) > 0 ? [[d, masteryTierFor(n, tiers)]] : [])));

/** True when all 16 dishes have bronze. */
export const allBronze = (dishes: readonly DishDef[], served: Readonly<Record<string, number>>, tiers: readonly TacoMasteryTier[] = tacoMasteryTiers): boolean =>
  dishes.length > 0 && dishes.every((d) => masteryTierFor(served[d.id] ?? 0, tiers) >= 1);

export function validateMastery(tiers: readonly TacoMasteryTier[], allBronzeCoins: number, dishes: readonly DishDef[]): string[] {
  const errors: string[] = [];
  let prev = 0;
  let prevCoins = 0;
  for (const t of tiers) {
    if (!t.id || !t.name) errors.push('mastery tier needs an id and a name');
    if (!(Number.isInteger(t.serves) && t.serves > prev)) errors.push(`mastery ${t.id}: serves must be a whole number above the tier before`);
    if (!(Number.isInteger(t.coins) && t.coins >= prevCoins && t.coins <= 1000)) errors.push(`mastery ${t.id}: coins must be a whole number, not below the tier before, at most 1000`);
    prev = t.serves;
    prevCoins = t.coins;
  }
  if (tiers.length !== 3) errors.push('mastery needs exactly three tiers');
  if (!(Number.isInteger(allBronzeCoins) && allBronzeCoins >= 0 && allBronzeCoins <= 1000)) errors.push('mastery allBronzeCoins must be 0 to 1000');
  for (const p of TACO_PROTEINS) for (const k of TACO_FORMATS) if (!dishes.some((d) => d.protein === p && d.kind === k)) errors.push(`mastery grid: no dish for ${p} ${k}`);
  return errors;
}

// ---------------------------------------------------------------- named regulars (B2)

/** Data shape: the truck gates regulars with `fromStep` in the settings, so the rows carry no Lv. */
export type TacoRegularDef = Omit<RegularDef, 'fromLevel'>;
export interface TacoRegularSettings extends RegularSettings {
  /** Menu step from which regulars arrive. */
  fromStep: number;
}
export const tacoRegulars: RegularDef[] = raw.regulars.regulars.map((r) => ({ ...r, fromLevel: raw.regulars.settings.fromStep }));
export const tacoRegularSettings: TacoRegularSettings = raw.regulars.settings;
export { regularTip };

/** Regulars that may arrive at this menu step: their favourite is on the menu and they are not already in the truck. */
export const eligibleTacoRegulars = (menuStep: number, menu: readonly string[], seated: readonly string[], regulars: readonly RegularDef[] = tacoRegulars, from = tacoRegularSettings.fromStep): RegularDef[] =>
  menuStep < from ? [] : eligibleRegulars(regulars, menuStep, menu as never, seated);

/** Name tags are a little wider than the diner's. */
export function validateTacoRegulars(regulars: readonly (RegularDef | TacoRegularDef)[], settings: TacoRegularSettings, lookCount: number, lookMin: number, dishIds: readonly string[]): string[] {
  const unlock = Object.fromEntries(dishIds.map((d) => [d, 2]));
  const errors = validateRegulars(
    regulars.map((r) => ({ ...r, fromLevel: 2 })),
    settings,
    lookCount,
    lookMin,
    unlock,
  ).filter((e) => !e.includes('1 to 14 characters'));
  for (const r of regulars) if (!r.name || r.name.length > 16) errors.push(`regular ${r.id}: name must be 1 to 16 characters (it has to fit the tag)`);
  if (!Number.isInteger(settings.fromStep) || settings.fromStep < 1) errors.push('regulars: fromStep must be a whole number >= 1');
  return errors;
}

// ---------------------------------------------------------------- milestone chests (B3)

export interface TacoChestDef extends ChestDef {
  /** The menu step the chest belongs to (also stored in the save). */
  step: number;
}
export const tacoChests: TacoChestDef[] = raw.chests.map((c) => ({ id: c.id, level: c.step, step: c.step, title: c.title, coins: c.coins }));

/** Chests whose menu step is reached and not claimed yet, lowest first (one claim card per missed chest). */
export const dueTacoChests = (menuStep: number, opened: readonly number[], chests: readonly TacoChestDef[] = tacoChests): TacoChestDef[] => dueChests(chests, menuStep, opened) as TacoChestDef[];
export const tacoChestsAfter = (opened: readonly number[], c: TacoChestDef): number[] => openedAfter(opened, c);
export const validateTacoChests = (chests: readonly TacoChestDef[], maxStep: number): string[] => [
  ...validateChests(chests),
  ...chests.filter((c) => c.step < 2 || c.step > maxStep).map((c) => `chest ${c.id}: step must be 2 to ${maxStep}`),
];

// ---------------------------------------------------------------- the truck's events (B4, B5)

export interface TacoEventDef extends EventDef {
  /** Menu step from which the truck can have this event. */
  minStep: number;
}
export const tacoEvents: TacoEventDef[] = raw.events;
/** Shared events that only make sense with the diner's own room (its moon, lamps, party tables): the truck draws its own versions. */
const isRoomEvent = (e: EventDef): boolean => e.look !== undefined || e.bat !== undefined || e.party !== undefined;

/** Events the truck may start now: the plain shared ones (Lv gate, as before) plus the truck's own (menu step gate). */
export function tacoEventPool(shared: readonly EventDef[], level: number, menuStep: number, own: readonly TacoEventDef[] = tacoEvents): EventDef[] {
  return [...shared.filter((e) => !isRoomEvent(e) && e.minLevel <= level), ...own.filter((e) => e.minStep <= menuStep)];
}
export const validateTacoEvents = (own: readonly TacoEventDef[], maxStep: number): string[] => [
  ...validateEvents(own),
  ...own.filter((e) => !Number.isInteger(e.minStep) || e.minStep < 1 || e.minStep > maxStep).map((e) => `event ${e.id}: minStep must be 1 to ${maxStep}`),
];

// ---------------------------------------------------------------- haunted window (B4, B6)

export interface HauntedWindow {
  id: string;
  /** Centre, as 0-1 fractions of the 2754 x 1536 art. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Combo level at which it lights: 1 (combo 3), 2 (combo 5), 3 (max combo). */
  tier: number;
  tower?: boolean;
}
export interface HauntedDef {
  moon: { x: number; y: number; radius: number };
  windows: HauntedWindow[];
}
export const tacoHaunted: HauntedDef = raw.haunted;
/** Combos that light each level (the last is the game's max combo). */
/** Where the Bat Delivery bat flies, as 0-1 fractions of the art: the sky of the haunted window, above the customers' heads. No tap zone lies inside the glass (tests/taco_extras.test.ts checks it). */
export const TACO_BAT_LANE = { top: 0.09, bottom: 0.2, bob: 0.008 };
export const COMBO_LIGHT_AT = [3, 5] as const;

/** 0 = dark, 1 = few windows (combo 3), 2 = more (combo 5), 3 = all lit and the tower flashes (max combo). */
export function comboLightTier(combo: number, maxCombo: number): number {
  if (combo >= maxCombo && maxCombo >= COMBO_LIGHT_AT[1]) return 3;
  if (combo >= COMBO_LIGHT_AT[1]) return 2;
  if (combo >= COMBO_LIGHT_AT[0]) return 1;
  return 0;
}
export const litWindows = (tier: number, windows: readonly HauntedWindow[] = tacoHaunted.windows): HauntedWindow[] => windows.filter((w) => w.tier <= tier);

export function validateHaunted(h: HauntedDef, windowBox = { x0: 0.244, x1: 0.829, y0: 0.075, y1: 0.373 }): string[] {
  const errors: string[] = [];
  const inside = (x: number, y: number) => x >= windowBox.x0 && x <= windowBox.x1 && y >= windowBox.y0 && y <= windowBox.y1;
  if (!inside(h.moon.x, h.moon.y)) errors.push('haunted moon is outside the window glass');
  if (!(h.moon.radius > 0.01 && h.moon.radius < 0.08)) errors.push('haunted moon radius looks wrong');
  const ids = new Set<string>();
  for (const w of h.windows) {
    if (!w.id || ids.has(w.id)) errors.push(`haunted window ${w.id || '?'}: missing or duplicate id`);
    ids.add(w.id);
    if (!inside(w.x, w.y)) errors.push(`haunted window ${w.id}: outside the window glass`);
    if (![1, 2, 3].includes(w.tier)) errors.push(`haunted window ${w.id}: tier must be 1, 2 or 3`);
    if (!(w.w > 0 && w.h > 0)) errors.push(`haunted window ${w.id}: needs a size`);
  }
  for (const t of [1, 2, 3]) if (!h.windows.some((w) => w.tier === t)) errors.push(`haunted: no window lights at tier ${t}`);
  if (!h.windows.some((w) => w.tower)) errors.push('haunted: no tower window');
  return errors;
}
