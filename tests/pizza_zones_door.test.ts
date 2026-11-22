import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { PizzaKitchenState } from '../src/game/pizza/PizzaKitchenState';
import { defaultPizzaConfig } from '../src/game/pizza/pizzaConfig';
import { OvenDoorMachine, ovenDoorTarget } from '../src/game/pizza/pizzaOvenDoor';
import { hitTestPizza, tapPizzaZone, trashTarget } from '../src/game/pizza/pizzaZones';

const zone = (id: string) => defaultPizzaConfig.zones.find((z) => z.id === id)!;
const mk = (step = 10) => {
  const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 100 }, defaultConfig, undefined, 3);
  k.menuStep = step;
  k.nextArrival = 9999;
  k.nextEventIn = 9999;
  return k;
};
const centre = (id: string) => {
  const z = zone(id);
  return { x: z.x + z.width / 2, y: z.y + z.height / 2 };
};

describe('pizza tap zones', () => {
  it('every zone centre hits its own zone', () => {
    for (const z of defaultPizzaConfig.zones) {
      const c = centre(z.id);
      expect(hitTestPizza(defaultPizzaConfig.zones, c.x, c.y)?.id).toBe(z.id);
    }
  });
  it('a tap on empty background hits nothing; slop reaches a nearby zone', () => {
    expect(hitTestPizza(defaultPizzaConfig.zones, 0.5, 0.2)).toBeNull();
    // Find a point just outside the dough tray that no zone contains: with slop the tray (or a neighbour) is hit, without it nothing is.
    const z = zone('dough_tray');
    const probes = [[z.x - 0.012, z.y + z.height / 2], [z.x + z.width + 0.012, z.y + z.height / 2], [z.x + z.width / 2, z.y - 0.012], [z.x + z.width / 2, z.y + z.height + 0.012]];
    const miss = probes.find(([x, y]) => hitTestPizza(defaultPizzaConfig.zones, x, y) === null);
    expect(miss).toBeDefined();
    expect(hitTestPizza(defaultPizzaConfig.zones, miss![0], miss![1], 0.025)).not.toBeNull();
  });
  it('dough tray -> sauce -> cheese -> board finishes a pizza; board tap sends it to the oven', () => {
    const k = mk();
    tapPizzaZone(k, zone('dough_tray'));
    tapPizzaZone(k, zone('sauce_tomato'));
    tapPizzaZone(k, zone('cheese_mozzarella'));
    expect(k.boards[0].item?.placed).toEqual(['dough', 'sauce:tomato', 'cheese:mozzarella']);
    tapPizzaZone(k, zone('board_1'));
    expect(k.boards[0].item?.status).toBe('built');
    tapPizzaZone(k, zone('board_1'));
    expect(k.boards[0].item?.status).toBe('baking');
    k.update(10);
    tapPizzaZone(k, zone('oven_slot_1'));
    expect(k.boards[0].item?.status).toBe('baked');
  });
  it('fryer tray starts its basket; basket collects; small oven tray starts a side; ice machine fills then serves', () => {
    const k = mk();
    tapPizzaZone(k, zone('tray_wings'));
    expect(k.fryer[1]?.dish).toBe('chicken_wings');
    tapPizzaZone(k, zone('tray_fries'));
    expect(k.fryer[0]?.dish).toBe('fries');
    tapPizzaZone(k, zone('tray_garlic_bread'));
    expect(k.smallOven[0]?.dish).toBe('garlic_bread');
    tapPizzaZone(k, zone('ice_cream_machine'));
    expect(k.ice[0]).not.toBeNull();
  });
  it('trash prefers an unfinished pizza (free) and never targets one in the oven', () => {
    const k = mk();
    k.startPizza();
    k.startPizza();
    expect(trashTarget(k)).toBe(1);
    k.boards[0].item!.status = 'baking';
    k.boards[1].item = null;
    expect(trashTarget(k)).toBeNull();
  });
});

describe('oven door state machine', () => {
  it('target follows the oven slots', () => {
    expect(ovenDoorTarget([null, null])).toBe('open');
    expect(ovenDoorTarget([{ phase: 'cooking' }, null])).toBe('closed');
    expect(ovenDoorTarget([{ phase: 'cooking' }, { phase: 'ready' }])).toBe('open');
    expect(ovenDoorTarget([{ phase: 'burnt' }, null])).toBe('open');
  });
  it('closes and opens with a 0.5 s gap and never turns around mid-clip', () => {
    const d = new OvenDoorMachine(0.5, 0.55, 0.55);
    expect(d.update(0.1, 'closed')).toBe('closing');
    expect(d.update(0.2, 'open')).toBe('closing'); // wish changed mid-clip: finish first
    expect(d.update(0.4, 'open')).toBe('closed'); // clip ended (0.6 s >= 0.55)
    expect(d.update(0.3, 'open')).toBe('closed'); // gap not over (0.3 s)
    expect(d.update(0.25, 'open')).toBe('opening'); // 0.55 s since the move ended
    expect(d.update(0.6, 'open')).toBe('open');
  });
  it('a quick open-close-open wish is collapsed: only the latest target counts when free', () => {
    const d = new OvenDoorMachine();
    d.update(0.1, 'closed');
    d.update(1, 'closed'); // closed
    d.update(0.1, 'open');
    d.update(0.1, 'closed'); // wish flips back before the gap is over
    expect(d.state).toBe('closed');
    d.update(1, 'closed');
    expect(d.state).toBe('closed');
  });
  it('never flickers: over many random targets, two moves are always at least the gap apart', () => {
    const d = new OvenDoorMachine();
    let t = 0;
    let lastEnd = -Infinity;
    let prev = d.state;
    for (let i = 0; i < 4000; i++) {
      const dt = 0.05;
      t += dt;
      const target = Math.sin(i * 0.37) > 0 ? 'closed' : 'open';
      const was = d.moving;
      const s = d.update(dt, target);
      if (!was && d.moving) expect(t - lastEnd).toBeGreaterThanOrEqual(0.5 - 1e-9);
      if (was && !d.moving) lastEnd = t;
      prev = s;
    }
    void prev;
  });
});
