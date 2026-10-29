import { KitchenState } from './KitchenState';
import { isEdible } from './cook';

/** Where the pointer hand should point next. Read-only: it never changes gameplay. */
export type Hint =
  | { kind: 'fries_bin' }
  | { kind: 'vat'; vat: number }
  | { kind: 'patty_tray' }
  | { kind: 'grill'; burner: number }
  | { kind: 'buns' }
  | { kind: 'topping'; layer: 'lettuce' | 'tomato' }
  | { kind: 'drag'; slot: number; customer: number }
  | null;

export function tutorialActive(s: KitchenState): boolean {
  return s.served < 3 || (s.level >= 2 && s.burgersServed < 1);
}

export function nextHint(s: KitchenState): Hint {
  if (s.closed || !tutorialActive(s)) return null;
  // 1. Anything finished on the counter that a customer wants: drag it.
  for (const slot of s.slots) {
    const it = slot.item;
    if (!it || it.building) continue;
    const c = s.customers.find((x) => x.mood === 'waiting' && x.items.some((k, i) => k === it.kind && !x.delivered[i]));
    if (c) return { kind: 'drag', slot: slot.index, customer: c.id };
  }
  // 2. Work out what the first waiting customer still needs.
  const c = s.customers.find((x) => x.mood === 'waiting');
  if (!c) return null;
  const need = c.items.find((k, i) => !c.delivered[i]);
  if (need === 'fries') {
    const ready = s.vats.findIndex((v) => v && isEdible(v.phase));
    if (ready >= 0) return { kind: 'vat', vat: ready };
    if (s.vats.some((v) => v)) return null; // wait for it to cook
    return { kind: 'fries_bin' };
  }
  if (need === 'burger') {
    const build = s.buildingSlots()[0]?.item;
    const nextLayer = build ? s.layers[build.placed.length] : undefined;
    const pattyReady = s.burners.findIndex((p) => p && p.side === 2 && isEdible(p.phase));
    const pattyFlip = s.burners.findIndex((p) => p && p.side === 1 && isEdible(p.phase));
    const cooking = s.burners.some((p) => p);
    if (pattyFlip >= 0) return { kind: 'grill', burner: pattyFlip };
    if (pattyReady >= 0) return build && nextLayer === 'patty' ? { kind: 'grill', burner: pattyReady } : { kind: 'buns' };
    if (build && (nextLayer === 'lettuce' || nextLayer === 'tomato')) return { kind: 'topping', layer: nextLayer };
    if (!build) return { kind: 'buns' };
    if (!cooking && nextLayer === 'patty') return { kind: 'patty_tray' };
    return null; // patty still cooking: wait
  }
  return null;
}
