import { KitchenState } from './KitchenState';
import { isEdible } from './cook';

/** Where the pointer hand should point next. Read-only: it never changes gameplay. */
export type Hint =
  | { kind: 'fryer'; vat: number }
  | { kind: 'grill'; burner: number }
  | { kind: 'buns' }
  | { kind: 'drag'; slot: number; customer: number }
  | null;

export function tutorialActive(s: KitchenState): boolean {
  return s.served < 3 || (s.level >= 2 && s.burgersServed < 1);
}

export function nextHint(s: KitchenState): Hint {
  if (s.closed || !tutorialActive(s)) return null;
  // 1. Anything ready on the counter that a customer wants: drag it.
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
    if (ready >= 0) return { kind: 'fryer', vat: ready };
    if (s.vats.some((v) => v)) return null; // wait for it to cook
    return { kind: 'fryer', vat: 0 };
  }
  if (need === 'burger') {
    const building = s.slots.some((sl) => sl.item?.building);
    const patty = s.burners.findIndex((p) => p && isEdible(p.phase));
    if (patty >= 0) return building ? { kind: 'grill', burner: patty } : { kind: 'buns' };
    if (s.burners.some((p) => p)) return building ? null : { kind: 'buns' };
    return { kind: 'grill', burner: 0 };
  }
  return null;
}
