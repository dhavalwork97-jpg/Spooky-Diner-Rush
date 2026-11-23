import { describe, expect, it } from 'vitest';
import { KitchenState } from '../src/game/KitchenState';
import { defaultConfig } from '../src/game/config';

const at = (level: number) => new KitchenState({ level, xp: 0, coins: 0 }, defaultConfig, 1);
const run = (s: KitchenState, seconds: number, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) s.update(step);
};
const lastInvalid = (s: KitchenState) => s.drainEvents().filter((e) => e.type === 'invalid').map((e) => (e as { message: string }).message);
const noCustomers = (s: KitchenState) => {
  s.nextArrival = 1e9;
};

describe('drinks', () => {
  it('are locked until their level', () => {
    const s = at(5);
    s.tapDrinks();
    expect(s.spouts.every((p) => p === null)).toBe(true);
    expect(lastInvalid(s)[0]).toMatch(/Lv 6/);
  });

  it('fill and wait in their lane without spoiling; a tap never moves them to a plate', () => {
    const s = at(6);
    noCustomers(s);
    s.tapDrinks();
    expect(s.spouts[0]?.phase).toBe('cooking');
    s.tapDrinks(); // the next lane starts: there are three
    s.tapDrinks();
    expect(s.spouts.filter(Boolean).length).toBe(3);
    s.tapDrinks(); // every lane is busy
    expect(lastInvalid(s).join()).toMatch(/filling/);
    run(s, 6);
    expect(s.spouts[0]?.phase).toBe('ready');
    run(s, 600); // a ready cup never spoils or costs anything
    const rep = s.reputation;
    expect(s.spouts[0]?.phase).toBe('ready');
    expect(s.pourReady('dispenser', 0)).toBe(true);
    s.drainEvents();
    s.tapDrinks(); // all lanes hold a full cup: the player is told to drag one out
    expect(lastInvalid(s).join()).toMatch(/Drag/);
    expect(s.spouts.filter((p) => p?.phase === 'ready').length).toBe(3);
    expect(s.slots.every((x) => !x.item)).toBe(true);
    expect(s.reputation).toBe(rep);
  });

  it('do not use up plate or side slots', () => {
    const s = at(6);
    noCustomers(s);
    s.slots.forEach((x) => (x.item = { id: 90 + x.index, kind: 'fries', placed: [], building: false }));
    s.tapDrinks();
    run(s, 6);
    expect(s.spouts[0]?.phase).toBe('ready');
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['drink'];
    c.delivered = [false];
    expect(s.serveFromPour('dispenser', 0, c.id)).toBe(true); // works with every plate full
  });

  it('are served straight from the dispenser to the customer who ordered one', () => {
    const s = at(6);
    noCustomers(s);
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['drink'];
    c.delivered = [false];
    s.tapDrinks();
    expect(s.serveFromPour('dispenser', 0, c.id)).toBe(false); // still filling
    run(s, 6);
    s.drainEvents();
    const coins = s.coins;
    expect(s.serveFromPour('dispenser', 0, c.id)).toBe(true);
    expect(s.spouts[0]).toBeNull();
    expect(c.mood).toBe('happy');
    expect(s.coins).toBeGreaterThan(coins);
    const ev = s.drainEvents().find((e) => e.type === 'deliver') as { from?: string; index?: number; slot: number };
    expect(ev.from).toBe('dispenser');
    expect(ev.slot).toBe(-1);
  });

  it('keep their cup when the customer did not order a drink, and cost patience', () => {
    const s = at(6);
    noCustomers(s);
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['fries'];
    c.delivered = [false];
    s.tapDrinks();
    run(s, 6);
    const patience = c.patience;
    expect(s.serveFromPour('dispenser', 0, c.id)).toBe(false);
    expect(s.spouts[0]?.phase).toBe('ready');
    expect(c.patience).toBeLessThan(patience);
  });
});

describe('ice cream', () => {
  it('is locked until Lv 8', () => {
    const s = at(7);
    s.tapIceCream();
    expect(s.cones[0]).toBeNull();
    expect(lastInvalid(s)[0]).toMatch(/Lv 8/);
  });

  it('swirls and a ready cone stays in its lane', () => {
    const s = at(12);
    noCustomers(s);
    s.tapIceCream();
    s.tapIceCream(); // the next lane starts: there are three
    s.tapIceCream();
    expect(s.cones.filter(Boolean).length).toBe(3);
    s.tapIceCream(); // every lane is busy
    expect(lastInvalid(s).join()).toMatch(/swirling/);
    run(s, 6);
    expect(s.cones[0]?.phase).not.toBe('cooking');
    s.drainEvents();
    s.tapIceCream(); // a tap no longer takes the cone
    expect(lastInvalid(s).join()).toMatch(/Drag/);
    expect(s.cones[0]).not.toBeNull();
    expect(s.slots.every((x) => !x.item)).toBe(true);
  });

  it('is served straight from the machine, even with every plate full', () => {
    const s = at(12);
    noCustomers(s);
    s.slots.forEach((x) => (x.item = { id: 90 + x.index, kind: 'fries', placed: [], building: false }));
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['icecream'];
    c.delivered = [false];
    s.tapIceCream();
    expect(s.serveFromPour('icecream', 0, c.id)).toBe(false); // still swirling
    run(s, 6);
    s.drainEvents();
    expect(s.serveFromPour('icecream', 0, c.id)).toBe(true);
    expect(s.cones[0]).toBeNull();
    expect(c.mood).toBe('happy');
    const ev = s.drainEvents().find((e) => e.type === 'deliver') as { from?: string; slot: number };
    expect(ev.from).toBe('icecream');
    expect(ev.slot).toBe(-1);
  });

  it('melts if left too long, at no cost', () => {
    const s = at(12);
    noCustomers(s);
    const rep = s.reputation;
    const coins = s.coins;
    s.tapIceCream();
    s.drainEvents();
    run(s, 25);
    expect(s.cones[0]).toBeNull();
    expect(s.drainEvents().some((e) => e.type === 'melted')).toBe(true);
    expect(s.reputation).toBe(rep);
    expect(s.coins).toBe(coins);
    s.tapIceCream(); // the machine is free again
    expect(s.cones[0]).not.toBeNull();
  });

  it('are cleared when the restaurant reopens', () => {
    const s = at(12);
    s.tapDrinks();
    s.tapIceCream();
    s.closed = true;
    s.reopen();
    expect(s.spouts.every((p) => p === null) && s.cones.every((p) => p === null)).toBe(true);
  });
});
