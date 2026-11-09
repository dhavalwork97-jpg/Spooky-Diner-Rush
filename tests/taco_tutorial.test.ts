import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { TacoKitchenState } from '../src/game/taco/TacoKitchenState';
import { defaultTacoConfig as taco } from '../src/game/taco/tacoConfig';
import { tapZone } from '../src/game/taco/tacoZones';
import { TACO_TUTORIAL_ID, nextTacoHint, tutorialDue, type TacoHint } from '../src/game/taco/tacoTutorial';

const make = (step: number) => {
  const s = new TacoKitchenState({ level: 15, xp: 0, coins: 0, menuStep: step }, defaultConfig, taco, 7);
  s.mods.patience = 50; // the tutorial walk-through must never lose the customer to a timer
  return s;
};
const zone = (id: string) => taco.zones.find((z) => z.id === id)!;

/** Follow the hints exactly like a new player would, one tap at a time. Returns the hints seen and whether the order was finished. */
function followHints(s: TacoKitchenState, order: string): { seen: TacoHint[]; done: boolean } {
  s.spawnCustomer();
  const c = s.customers[0];
  c.items = [order];
  c.delivered = [false];
  const seen: TacoHint[] = [];
  for (let i = 0; i < 1500; i++) {
    s.update(0.1);
    if (s.customers.every((x) => x.id !== c.id) || c.mood === 'happy') return { seen, done: true };
    const h = nextTacoHint(s);
    expect(h, `a hint exists at tap ${i}`).not.toBeNull();
    seen.push(h!);
    if (h!.kind === 'tap') {
      const before = JSON.stringify([s.plates, s.pans, s.ovens, s.pours]);
      tapZone(s, zone(h!.zone));
      const invalid = s.drainEvents().filter((e) => e.type === 'invalid');
      expect(invalid, `tapping the hinted zone ${h!.zone} must be a valid action (${h!.text})`).toEqual([]);
      expect(JSON.stringify([s.plates, s.pans, s.ovens, s.pours]), `tapping ${h!.zone} must change the kitchen`).not.toBe(before);
    } else if (h!.kind === 'drag') {
      const z = zone(h!.from);
      if (z.action === 'plate') expect(s.serve(z.index!, h!.customer)).toBe(true);
      else expect(s.serveFromPour(z.arg!, z.index!, h!.customer)).toBe(true);
    }
  }
  return { seen, done: false };
}

describe('Taco Truck tutorial hints', () => {
  it('guides the first dish from the first tap to the serve (every tap valid and visible)', () => {
    const s = make(1);
    const { seen, done } = followHints(s, 'veggies_soft_taco');
    expect(done).toBe(true);
    // The first real tap is the tortilla, then the raw protein, and the last hint is the drag to the customer.
    const taps = seen.filter((h) => h.kind === 'tap').map((h) => (h as { zone: string }).zone);
    expect(taps[0]).toBe('tortilla_flour_tortillas');
    expect(taps).toContain('griddle_raw_veggies');
    expect(taps).toContain('topping_guacamole');
    expect(taps).toContain('topping_salsa_red_bowl');
    expect(seen.filter((h) => h.kind === 'drag').length).toBeGreaterThan(0);
  });

  it('every one of the 16 dishes can be made by following the hints alone', () => {
    for (const d of taco.dishes) {
      const s = make(10);
      const r = followHints(s, d.id);
      expect(r.done, `${d.id} finished by hints`).toBe(true);
    }
  });

  it('both drinks can be served by following the hints alone', () => {
    for (const dr of taco.drinks) {
      const s = make(10);
      expect(followHints(s, dr.id).done, dr.id).toBe(true);
    }
  });

  it('waits (no pointer) while food cooks, and says what it waits for', () => {
    const s = make(1);
    s.spawnCustomer();
    s.customers[0].items = ['veggies_soft_taco'];
    s.customers[0].delivered = [false];
    tapZone(s, zone('tortilla_flour_tortillas'));
    tapZone(s, zone('griddle_raw_veggies'));
    const h = nextTacoHint(s)!;
    expect(h.kind).toBe('wait');
    expect(h.text.toLowerCase()).toContain('cook');
  });

  it('does not advance until the required action is done: the same hint is returned after an unrelated tap', () => {
    const s = make(1);
    s.spawnCustomer();
    s.customers[0].items = ['veggies_soft_taco'];
    s.customers[0].delivered = [false];
    const a = nextTacoHint(s)!;
    tapZone(s, zone('trash_bin')); // unrelated, nothing to throw away
    s.drainEvents();
    expect(nextTacoHint(s)).toEqual(a);
  });

  it('is silent when the truck is closed, and waits for a customer when there is none', () => {
    const s = make(1);
    expect(nextTacoHint(s)!.kind).toBe('wait');
    s.closed = true;
    expect(nextTacoHint(s)).toBeNull();
  });

  it('never changes the kitchen model', () => {
    const s = make(1);
    s.spawnCustomer();
    const snap = JSON.stringify([s.plates, s.pans, s.ovens, s.pours, s.customers, s.coins, s.xp]);
    for (let i = 0; i < 5; i++) nextTacoHint(s);
    expect(JSON.stringify([s.plates, s.pans, s.ovens, s.pours, s.customers, s.coins, s.xp])).toBe(snap);
  });

  it('every hint zone exists on the kitchen art', () => {
    const ids = new Set(taco.zones.map((z) => z.id));
    for (const d of taco.dishes) {
      const s = make(10);
      for (const h of followHints(s, d.id).seen) {
        if (h.kind === 'tap') expect(ids.has(h.zone)).toBe(true);
        if (h.kind === 'drag') expect(ids.has(h.from)).toBe(true);
      }
    }
  });
});

describe('tutorial persistence', () => {
  it('is due for a new player, not after completion, and not for a returning player past the first menu step', () => {
    expect(tutorialDue([], 1)).toBe(true);
    expect(tutorialDue(['taco_hint'], 1)).toBe(true);
    expect(tutorialDue([TACO_TUTORIAL_ID], 1)).toBe(false);
    expect(tutorialDue([], 4)).toBe(false);
  });
});
