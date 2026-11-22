import type { Mods } from '../KitchenState';
import { NO_MODS } from '../shop';
import type { PizzaConfig, PizzaUpgradeDef } from './pizzaConfig';
import type { TacoUpgradeTier } from '../taco/tacoConfig';

// The Pizza Place's own upgrades. Pure rules, no Phaser, no save access (the shop scene passes the numbers in and writes the answer back). Own list and own
// save map `pizzaOwned`, so the diner's and the truck's upgrades never affect it. Tiers are gated by the shop's menu step.

export type PizzaMods = Mods & { pourSpeed: number };
export const NO_PIZZA_MODS: PizzaMods = { ...NO_MODS, pourSpeed: 1 };

export type PizzaOwned = Record<string, number>;
export type PizzaBuyBlock = 'unknown' | 'maxed' | 'locked' | 'coins';
export type PizzaBuyCheck = { ok: true; cost: number; tier: number } | { ok: false; reason: PizzaBuyBlock; cost?: number; step?: number };
export type PizzaBuyResult = { ok: true; owned: PizzaOwned; coins: number; cost: number; tier: number } | { ok: false; reason: PizzaBuyBlock };

const find = (u: readonly PizzaUpgradeDef[], id: string): PizzaUpgradeDef | undefined => u.find((x) => x.id === id);

export function pizzaTierOf(u: readonly PizzaUpgradeDef[], owned: PizzaOwned, id: string): number {
  const def = find(u, id);
  if (!def) return 0;
  const t = Math.floor(owned[id] ?? 0);
  return Math.max(0, Math.min(def.tiers.length, Number.isFinite(t) ? t : 0));
}
export function pizzaNextTier(u: readonly PizzaUpgradeDef[], owned: PizzaOwned, id: string): TacoUpgradeTier | null {
  return find(u, id)?.tiers[pizzaTierOf(u, owned, id)] ?? null;
}
export function canBuyPizza(u: readonly PizzaUpgradeDef[], owned: PizzaOwned, id: string, menuStep: number, coins: number): PizzaBuyCheck {
  const def = find(u, id);
  if (!def) return { ok: false, reason: 'unknown' };
  const have = pizzaTierOf(u, owned, id);
  const next = def.tiers[have];
  if (!next) return { ok: false, reason: 'maxed' };
  if (menuStep < next.step) return { ok: false, reason: 'locked', step: next.step };
  if (coins < next.cost) return { ok: false, reason: 'coins', cost: next.cost };
  return { ok: true, cost: next.cost, tier: have + 1 };
}
/** Pure purchase: returns the new owned map and coin total, never mutates its inputs. */
export function buyPizza(u: readonly PizzaUpgradeDef[], owned: PizzaOwned, id: string, menuStep: number, coins: number): PizzaBuyResult {
  const c = canBuyPizza(u, owned, id, menuStep, coins);
  if (!c.ok) return { ok: false, reason: c.reason };
  return { ok: true, owned: { ...owned, [id]: c.tier }, coins: coins - c.cost, cost: c.cost, tier: c.tier };
}
/** The kitchen settings for what is owned. Tier 0 leaves a setting at 1. Only the Pizza Place's own upgrades count. */
export function pizzaModsFor(u: readonly PizzaUpgradeDef[], owned: PizzaOwned): PizzaMods {
  const mods: PizzaMods = { ...NO_PIZZA_MODS };
  for (const d of u) {
    const t = pizzaTierOf(u, owned, d.id);
    if (t > 0) mods[d.mod] = d.tiers[t - 1].value;
  }
  return mods;
}

/** The dishes that join the menu at a step, as words ("Veggie pizza and Ice cream"). The step number itself is never shown. */
export function pizzaMenuNeedText(p: PizzaConfig, step: number): string {
  const names = p.dishes.filter((d) => d.unlockStep === step).map((d) => d.name);
  if (names.length === 0) return 'more recipes';
  return names.length <= 2 ? names.join(' and ') : `${names[0]} and ${names.length - 1} more`;
}
export interface PizzaBuyLabel {
  text: string;
  enabled: boolean;
  needs?: string;
}
export function pizzaBuyLabel(p: PizzaConfig, owned: PizzaOwned, id: string, menuStep: number, coins: number): PizzaBuyLabel {
  const c = canBuyPizza(p.upgrades, owned, id, menuStep, coins);
  if (c.ok) return { text: `Buy ${c.cost}`, enabled: true };
  switch (c.reason) {
    case 'maxed':
      return { text: 'Max', enabled: false };
    case 'locked':
      return { text: 'Locked', enabled: false, needs: `Unlocks with ${pizzaMenuNeedText(p, c.step!)}` };
    case 'coins':
      return { text: `${c.cost} coins`, enabled: false };
    default:
      return { text: '-', enabled: false };
  }
}
const pct = (v: number): string => `+${Math.round((v - 1) * 100)}%`;
export function pizzaEffectText(def: PizzaUpgradeDef, tier: number): string {
  const now = tier > 0 ? def.tiers[tier - 1].value : 1;
  const next = def.tiers[tier];
  return next ? `${pct(now)}  →  ${pct(next.value)}` : pct(now);
}
