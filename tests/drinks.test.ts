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

  it('fill, wait without spoiling, and land on a side slot', () => {
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
    s.tapDrinks();
    expect(s.spouts[0]).toBeNull();
    const side = s.slots.filter((x) => x.row === 'side');
    expect(side.some((x) => x.item?.kind === 'drink')).toBe(true);
    expect(s.reputation).toBe(rep);
  });

  it('use a free plate when both side slots are taken, and refuse when everything is full', () => {
    const s = at(6);
    noCustomers(s);
    s.slots.filter((x) => x.row === 'side').forEach((x) => (x.item = { id: 90 + x.index, kind: 'fries', placed: [], building: false }));
    s.tapDrinks();
    run(s, 6);
    s.tapDrinks();
    expect(s.slots.filter((x) => x.row === 'plate').some((x) => x.item?.kind === 'drink')).toBe(true);
    s.slots.forEach((x) => {
      if (!x.item) x.item = { id: 200 + x.index, kind: 'fries', placed: [], building: false };
    });
    s.tapDrinks();
    run(s, 6);
    s.drainEvents();
    s.tapDrinks();
    expect(lastInvalid(s).join()).toMatch(/plate is full/);
    expect(s.spouts.some((p) => p?.phase === 'ready')).toBe(true);
  });

  it('can be served to the customer who ordered one', () => {
    const s = at(6);
    noCustomers(s);
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['drink'];
    c.delivered = [false];
    s.tapDrinks();
    run(s, 6);
    s.tapDrinks();
    const slot = s.slots.find((x) => x.item?.kind === 'drink')!;
    const coins = s.coins;
    expect(s.serve(slot.index, c.id)).toBe(true);
    expect(c.mood).toBe('happy');
    expect(s.coins).toBeGreaterThan(coins);
  });
});

describe('ice cream', () => {
  it('is locked until Lv 12', () => {
    const s = at(11);
    s.tapIceCream();
    expect(s.cones[0]).toBeNull();
    expect(lastInvalid(s)[0]).toMatch(/Lv 12/);
  });

  it('swirls, can be collected, and goes to a slot', () => {
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
    s.tapIceCream();
    expect(s.cones[0]).toBeNull(); // the first ready lane is collected
    expect(s.slots.some((x) => x.item?.kind === 'icecream')).toBe(true);
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
