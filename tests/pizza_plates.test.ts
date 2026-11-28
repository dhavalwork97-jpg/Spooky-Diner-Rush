import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { defaultPizzaConfig } from '../src/game/pizza/pizzaConfig';
import { PizzaKitchenState, PLATE_COUNT } from '../src/game/pizza/PizzaKitchenState';
import { tapPizzaZone } from '../src/game/pizza/pizzaZones';

const zone = (id: string) => defaultPizzaConfig.zones.find((z) => z.id === id)!;
const kitchen = () => new PizzaKitchenState({ level: 30, xp: 0, coins: 0, menuStep: 10, menuXp: 0 }, defaultConfig, defaultPizzaConfig);

/** Bake a garlic bread until it is ready (but not burnt). */
function readyBread(k: PizzaKitchenState): number {
  expect(k.startSide('garlic_bread')).toBe(true);
  const i = k.smallOven.findIndex((t) => t);
  for (let n = 0; n < 4000 && k.smallOven[i]?.phase === 'cooking'; n++) k.update(0.05);
  expect(k.smallOven[i]?.phase).toBe('ready');
  return i;
}
const noOrders = (k: PizzaKitchenState) => {
  k.customers = [];
  k.nextArrival = 1e9;
};

describe('Pizza Place plates beside the ice cream machine', () => {
  it('has three plate zones', () => {
    expect(PLATE_COUNT).toBe(3);
    for (let i = 0; i < PLATE_COUNT; i++) expect(zone(`plate_${i}`).action).toBe('plate');
  });

  it('a ready side nobody ordered goes onto a plate and does not burn', () => {
    const k = kitchen();
    const i = readyBread(k);
    noOrders(k);
    tapPizzaZone(k, zone('small_oven'));
    expect(k.smallOven[i]).toBeNull();
    expect(k.plates.filter(Boolean).length).toBe(1);
    expect(k.plates[0]?.dish).toBe('garlic_bread');
    for (let n = 0; n < 4000; n++) k.update(0.05); // a long time: still there, never burnt
    expect(k.plates[0]?.dish).toBe('garlic_bread');
  });

  it('a plated side serves a customer who orders it later', () => {
    const k = kitchen();
    readyBread(k);
    noOrders(k);
    tapPizzaZone(k, zone('small_oven'));
    k.customers = [];
    k.spawnCustomer();
    const c = k.customers[0];
    c.items = ['garlic_bread'];
    c.delivered = [false];
    expect(k.servePlate(0)).toBe(true);
    expect(k.plates[0]).toBeNull();
    expect(c.delivered[0]).toBe(true);
  });

  it('tapping a plate nobody wants keeps the food on it', () => {
    const k = kitchen();
    readyBread(k);
    noOrders(k);
    tapPizzaZone(k, zone('small_oven'));
    expect(k.tapPlate(0)).toBe(false);
    expect(k.plates[0]?.dish).toBe('garlic_bread');
  });

  it('when all plates are full the food stays in the oven', () => {
    const k = kitchen();
    noOrders(k);
    k.plates = k.plates.map(() => ({ dish: 'garlic_bread', perfect: false }));
    const i = readyBread(k);
    noOrders(k);
    expect(k.serveTray('small', i)).toBe(false);
    expect(k.smallOven[i]?.dish).toBe('garlic_bread');
  });

  it('reopening clears the plates', () => {
    const k = kitchen();
    k.plates[0] = { dish: 'garlic_bread', perfect: false };
    k.closed = true;
    k.reopen();
    expect(k.plates.every((p) => p === null)).toBe(true);
  });
});
