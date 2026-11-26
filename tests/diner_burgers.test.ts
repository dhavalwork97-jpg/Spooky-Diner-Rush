import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KitchenState, type GameEvent } from '../src/game/KitchenState';
import { defaultConfig, dinerLevelDef, isBurgerKind, type ItemKind } from '../src/game/config';

const cfg = defaultConfig;
const run = (s: KitchenState, seconds: number, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) s.update(step);
};
const at = (level: number, seed = 5) => new KitchenState({ level, xp: 0, coins: 0 }, undefined, seed);
/** Cook one patty and put it on the burger that is waiting for it. */
const pattyOn = (s: KitchenState) => {
  s.startPatty();
  run(s, 4.2);
  s.tapGrill(0);
  run(s, 4.2);
  s.tapGrill(0);
};
const invalid = (s: KitchenState): string[] => s.drainEvents().flatMap((e: GameEvent) => (e.type === 'invalid' ? [e.message] : []));

/** A Lv 10 diner with one customer who wants exactly one cheeseburger. */
function withCheeseburgerCustomer(): { s: KitchenState; id: number } {
  for (let seed = 1; seed < 800; seed++) {
    const s = at(10, seed);
    s.burgersServed = 1; // the very first burger order is always a plain burger (it teaches the grill), so skip that
    s.spawnCustomer();
    const c = s.customers[0];
    if (c && c.items.length === 1 && c.items[0] === 'cheeseburger') {
      s.update(1);
      return { s, id: c.id };
    }
  }
  throw new Error('no seed found');
}

describe('diner burger variants: building', () => {
  it('a cheeseburger is bun, patty, cheese, lettuce, tomato and the top bun closes it', () => {
    const s = at(10);
    s.tapBuns();
    pattyOn(s);
    s.tapTopping('cheese');
    s.tapTopping('lettuce');
    s.tapTopping('tomato');
    expect(s.slots[0].item).toMatchObject({ kind: 'cheeseburger', building: false });
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom', 'patty', 'cheese', 'lettuce', 'tomato', 'bun_top']);
  });
  it('a garden burger takes onions then pickles before the lettuce, with no cheese', () => {
    const s = at(12);
    s.tapBuns();
    pattyOn(s);
    for (const l of ['onion', 'pickle', 'lettuce', 'tomato'] as const) s.tapTopping(l);
    expect(s.slots[0].item).toMatchObject({ kind: 'garden_burger', building: false });
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom', 'patty', 'onion', 'pickle', 'lettuce', 'tomato', 'bun_top']);
  });
  it('a deluxe burger takes cheese, onions and pickles in that order', () => {
    const s = at(15);
    s.tapBuns();
    pattyOn(s);
    for (const l of ['cheese', 'onion', 'pickle', 'lettuce', 'tomato'] as const) s.tapTopping(l);
    expect(s.slots[0].item).toMatchObject({ kind: 'deluxe_burger', building: false });
  });
  it('the plain burger is unchanged: it still closes right after the tomato, even with every variant unlocked', () => {
    const s = at(20);
    s.tapBuns();
    pattyOn(s);
    s.tapTopping('lettuce');
    s.tapTopping('tomato');
    expect(s.slots[0].item).toMatchObject({ kind: 'burger', building: false });
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom', 'patty', 'lettuce', 'tomato', 'bun_top']);
  });
  it('toppings that are not unlocked yet are refused and change nothing', () => {
    const s = at(9);
    s.tapBuns();
    pattyOn(s);
    s.drainEvents();
    s.tapTopping('cheese');
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom', 'patty']);
    expect(invalid(s).length).toBeGreaterThan(0);
    const s10 = at(10);
    s10.tapBuns();
    pattyOn(s10);
    s10.drainEvents();
    s10.tapTopping('onion'); // onions arrive with the garden burger at Lv 12
    expect(s10.slots[0].item?.placed).toEqual(['bun_bottom', 'patty']);
  });
  it('wrong order is refused with a helpful message (pickles before onions, tomato before lettuce)', () => {
    const s = at(15);
    s.tapBuns();
    pattyOn(s);
    s.drainEvents();
    s.tapTopping('pickle');
    expect(invalid(s)[0]).toMatch(/^Add .* first$/);
    s.tapTopping('onion');
    s.drainEvents();
    s.tapTopping('lettuce'); // after onions only pickles fit
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom', 'patty', 'onion']);
    expect(invalid(s)).toEqual(['Add pickles first']);
  });
  it('a finished variant can be served to the customer who ordered it and earns its own price', () => {
    const { s, id } = withCheeseburgerCustomer();
    s.tapBuns();
    pattyOn(s);
    for (const l of ['cheese', 'lettuce', 'tomato'] as const) s.tapTopping(l);
    const before = s.coins;
    expect(s.serve(0, id)).toBe(true);
    expect(s.coins).toBeGreaterThan(before);
  });
  it('a plain burger does not satisfy a cheeseburger order', () => {
    const { s, id } = withCheeseburgerCustomer();
    s.tapBuns();
    pattyOn(s);
    s.tapTopping('lettuce');
    s.tapTopping('tomato');
    expect(s.serve(0, id)).toBe(false);
    expect(s.slots[0].item?.kind).toBe('burger'); // it snaps back
  });
});

describe('diner burger variants: orders and unlocks', () => {
  const itemsOver = (level: number, customers: number): ItemKind[] => {
    const s = at(level, 11);
    const out: ItemKind[] = [];
    for (let i = 0; i < customers; i++) {
      s.spawnCustomer();
      const c = s.customers[s.customers.length - 1];
      out.push(...c.items);
      s.customers.length = 0;
    }
    return out;
  };
  it('no variant is ever ordered before its level', () => {
    expect(itemsOver(9, 400).some((k) => k !== 'burger' && isBurgerKind(k))).toBe(false);
    expect(itemsOver(10, 400).some((k) => k === 'garden_burger' || k === 'deluxe_burger')).toBe(false);
    expect(itemsOver(12, 400).some((k) => k === 'deluxe_burger')).toBe(false);
  });
  it('from Lv 15 all four burgers are ordered, and together they are no more common than the plain burger was', () => {
    const items = itemsOver(15, 900);
    for (const k of ['burger', 'cheeseburger', 'garden_burger', 'deluxe_burger'] as const) expect(items).toContain(k);
    const before = itemsOver(9, 900);
    const share = (xs: ItemKind[]) => xs.filter(isBurgerKind).length / xs.length;
    expect(Math.abs(share(items) - share(before))).toBeLessThan(0.05);
  });
  it('the diner unlock text announces each new burger and the diner-only seat change; the shared table is untouched', () => {
    const say = (n: number) => dinerLevelDef(cfg, n).unlocks.join(' ').toLowerCase();
    expect(say(10)).toContain('cheeseburger');
    expect(say(11)).toContain('four');
    expect(say(12)).toContain('garden');
    expect(say(15)).toContain('deluxe');
  });
  it('the three topping zones unlock with their dishes (the zone rules themselves are checked in restaurants.test.ts)', () => {
    const diner = JSON.parse(readFileSync('data/restaurants.json', 'utf8')).restaurants[0];
    const lv = (id: string) => diner.zones.find((z: { id: string }) => z.id === id).unlockLevel;
    expect(lv('cheese_tray')).toBe(cfg.recipes.items.cheeseburger.unlockLevel);
    expect(lv('onion_tray')).toBe(cfg.recipes.items.garden_burger.unlockLevel);
    expect(lv('pickle_tray')).toBe(cfg.recipes.items.garden_burger.unlockLevel);
    expect(cfg.recipes.items.deluxe_burger.unlockLevel).toBeGreaterThanOrEqual(cfg.recipes.items.garden_burger.unlockLevel);
  });
  it('every new picture is registered, on disk and loaded eagerly', async () => {
    const onDisk = Object.keys(import.meta.glob('../public/assets/art/*.webp')).map(f => f.replace('../public/', ''));
    const assets = JSON.parse(readFileSync('data/assets.json', 'utf8'));
    const list = Array.isArray(assets) ? assets : assets.assets;
    for (const key of ['cheeseburger_cooked', 'garden_burger_cooked', 'deluxe_burger_cooked', 'prep_toppings_tray', 'cheese', 'onion', 'pickle']) {
      const a = list.find((x: { key: string }) => x.key === key);
      expect(a, key).toBeTruthy();
      expect(a.lazy, key).toBe(false);
      expect(onDisk, key).toContain(String(a.file).replace(/^\//, ''));
    }
  });
});
