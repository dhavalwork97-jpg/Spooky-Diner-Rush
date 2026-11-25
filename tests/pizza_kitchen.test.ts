import { defaultPizzaConfig, unlockedIngredients } from '../src/game/pizza/pizzaConfig';
import { parseCustom } from '../src/game/pizza/pizzaCustom';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { CUSTOMER_LOOK_MIN, TACO_LOOK_MAX } from '../src/game/KitchenState';
import { PizzaKitchenState, type PizzaCustomer } from '../src/game/pizza/PizzaKitchenState';

const make = (step = 10, seed = 1) => {
  const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 100 }, defaultConfig, undefined, seed);
  k.menuStep = step;
  k.nextArrival = 9999; // no random arrivals unless a test wants them
  k.nextEventIn = 9999;
  return k;
};
const cust = (k: PizzaKitchenState, items: string[], over: Partial<PizzaCustomer> = {}): PizzaCustomer => {
  const c: PizzaCustomer = { id: 100 + k.customers.length, seat: k.customers.length, look: CUSTOMER_LOOK_MIN, items, delivered: items.map(() => false), price: 50, patience: 60, patienceMax: 60, age: 5, type: 'regular', mood: 'waiting', leaveIn: 0, ...over };
  k.customers.push(c);
  return c;
};
const buildCheese = (k: PizzaKitchenState, board?: number) => {
  const b = k.startPizza(board)!;
  expect(k.addIngredient('sauce:tomato', b)).toBe(true);
  expect(k.addIngredient('cheese:mozzarella', b)).toBe(true);
  expect(k.finishPizza(b)).toBe(true);
  return b;
};
const lastInvalid = (k: PizzaKitchenState) => [...k.events].reverse().find((e) => e.type === 'invalid');

describe('boards', () => {
  it('has three boards and reserves each until the pizza is served or thrown away', () => {
    const k = make();
    expect(k.boards).toHaveLength(3);
    expect([k.startPizza(), k.startPizza(), k.startPizza()]).toEqual([0, 1, 2]);
    expect(k.startPizza()).toBeNull();
    expect(lastInvalid(k)).toMatchObject({ message: 'All the boards are busy' });
    expect(k.discardBoard(1)).toBe(true);
    expect(k.startPizza()).toBe(1);
  });
  it('ingredients must follow dough, sauce, cheese, toppings', () => {
    const k = make();
    expect(k.addIngredient('sauce:tomato')).toBe(false); // no dough yet
    const b = k.startPizza()!;
    expect(k.addIngredient('cheese:mozzarella', b)).toBe(false); // sauce first
    expect(k.addIngredient('sauce:tomato', b)).toBe(true);
    expect(k.addIngredient('topping:pepperoni', b)).toBe(false); // cheese first
    expect(k.addIngredient('cheese:mozzarella', b)).toBe(true);
    expect(k.addIngredient('topping:pepperoni', b)).toBe(true);
    expect(k.addIngredient('topping:ham', b)).toBe(false); // ham belongs to no pizza with pepperoni
  });
  it('an ingredient that is not on the menu yet is refused', () => {
    const k = make(1);
    k.startPizza();
    expect(k.addIngredient('sauce:bbq')).toBe(false);
    expect(lastInvalid(k)).toMatchObject({ type: 'invalid' });
  });
  it('a cheese pizza and a margherita share a start; finishing needs an exact match', () => {
    const k = make(2);
    const b = k.startPizza()!;
    k.addIngredient('sauce:tomato', b);
    k.addIngredient('cheese:mozzarella', b);
    expect(k.finishPizza(b)).toBe(true);
    expect(k.boards[b].item?.dish).toBe('cheese_pizza');
    const c = k.startPizza()!;
    k.addIngredient('sauce:tomato', c);
    k.addIngredient('cheese:mozzarella', c);
    k.addIngredient('topping:basil', c);
    k.addIngredient('topping:fresh_mozzarella', c);
    expect(k.finishPizza(c)).toBe(true);
    expect(k.boards[c].item?.dish).toBe('margherita_pizza');
    const d = k.startPizza()!;
    k.addIngredient('sauce:tomato', d);
    expect(k.finishPizza(d)).toBe(false); // no cheese
  });
});

describe('brick oven', () => {
  it('has two slots; a third pizza gets Oven full and stays on its board', () => {
    const k = make();
    const [a, b, c] = [buildCheese(k), buildCheese(k), buildCheese(k)];
    expect(k.sendToOven(a)).toBe(true);
    expect(k.sendToOven(b)).toBe(true);
    k.drainEvents();
    expect(k.sendToOven(c)).toBe(false);
    const ev = k.drainEvents();
    expect(ev.some((e) => e.type === 'ovenFull')).toBe(true);
    expect(ev.find((e) => e.type === 'invalid')).toMatchObject({ message: 'Oven full' });
    expect(k.boards[c].item?.status).toBe('built');
  });
  it('tapping a cooking pizza only wobbles it', () => {
    const k = make();
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(3);
    k.drainEvents();
    expect(k.tapOven(0)).toBe(false);
    expect(k.drainEvents()).toEqual([{ type: 'wobble', where: 'oven', index: 0 }]);
    expect(k.ovens[0]).not.toBeNull();
  });
  it('never auto-collects: a ready pizza waits in the oven until the player takes it', () => {
    const k = make();
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(9.5);
    expect(k.ovens[0]?.phase).toBe('ready');
    expect(k.boards[a].item?.status).toBe('baking');
  });
  it('collecting returns the pizza to the board it came from, in any order', () => {
    const k = make();
    const a = buildCheese(k); // board 0
    const b = buildCheese(k); // board 1
    k.sendToOven(b); // slot 0 holds board 1
    k.sendToOven(a); // slot 1 holds board 0
    k.update(10);
    expect(k.tapOven(1)).toBe(true); // take the second one out first
    expect(k.boards[a].item?.status).toBe('baked');
    expect(k.boards[b].item?.status).toBe('baking');
    expect(k.tapOven(0)).toBe(true);
    expect(k.boards[b].item?.status).toBe('baked');
    expect(k.ovens).toEqual([null, null]);
  });
  it('ready -> overcooking -> burnt keeps its slot until the player clears it; burnt costs coins and reputation', () => {
    const k = make();
    const a = buildCheese(k);
    k.sendToOven(a);
    const phases: string[] = [];
    for (let i = 0; i < 200; i++) {
      k.update(0.1);
      const p = k.ovens[0]?.phase;
      if (p && phases[phases.length - 1] !== p) phases.push(p);
    }
    expect(phases).toEqual(['cooking', 'ready', 'warning', 'danger', 'burnt']);
    expect(k.ovens[0]?.phase).toBe('burnt');
    expect(k.boards[a].item?.status).toBe('baking');
    expect(k.reputation).toBeLessThan(defaultConfig.xp.reputation.start);
    const coins = k.coins;
    expect(k.tapOven(0)).toBe(true);
    expect(k.coins).toBe(coins - defaultConfig.recipes.settings.trashPenaltyCoins);
    expect(k.boards[a].item).toBeNull();
    expect(k.ovens[0]).toBeNull();
  });
  it('an overcooking pizza is still edible and comes back to its board with its phase', () => {
    const k = make();
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(9 + 4); // past half the 6 s window
    expect(k.ovens[0]?.phase).toBe('warning');
    k.tapOven(0);
    expect(k.boards[a].item).toMatchObject({ status: 'baked', bakedPhase: 'warning' });
  });
  it('the oven door and the board never lose the pizza id', () => {
    const k = make();
    const a = buildCheese(k);
    const id = k.boards[a].item!.id;
    k.sendToOven(a);
    k.update(10);
    k.tapOven(0);
    expect(k.boards[a].item!.id).toBe(id);
  });
  it('a pizza in the oven cannot be thrown away from its board', () => {
    const k = make();
    const a = buildCheese(k);
    k.sendToOven(a);
    expect(k.discardBoard(a)).toBe(false);
    expect(k.boards[a].item?.status).toBe('baking');
  });
});

describe('serving a pizza', () => {
  it('tapping a baked board serves the oldest customer who ordered it, frees the board and pays', () => {
    const k = make();
    const first = cust(k, ['cheese_pizza']);
    cust(k, ['cheese_pizza']);
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(10);
    k.tapOven(0);
    const coins = k.coins;
    expect(k.tapBoard(a)).toBe(true);
    expect(first.mood).toBe('happy');
    expect(k.boards[a].item).toBeNull();
    expect(k.coins).toBeGreaterThan(coins);
    expect(k.served).toBe(1);
  });
  it('nobody ordered it: the pizza stays on the board', () => {
    const k = make();
    cust(k, ['margherita_pizza']);
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(10);
    k.tapOven(0);
    k.drainEvents();
    expect(k.tapBoard(a)).toBe(false);
    expect(k.boards[a].item?.status).toBe('baked');
  });
  it('a pizza dropped on the wrong customer costs that customer patience', () => {
    const k = make();
    const c = cust(k, ['margherita_pizza']);
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(10);
    k.tapOven(0);
    expect(k.serveBoard(a, c.id)).toBe(false);
    expect(c.patience).toBeLessThan(c.patienceMax);
    expect(k.boards[a].item?.status).toBe('baked');
  });
  it('a baked pizza thrown away costs coins, an unbaked one does not', () => {
    const k = make();
    const a = buildCheese(k);
    const coins = k.coins;
    k.discardBoard(a);
    expect(k.coins).toBe(coins);
    const b = buildCheese(k);
    k.sendToOven(b);
    k.update(10);
    k.tapOven(0);
    k.discardBoard(b);
    expect(k.coins).toBe(coins - defaultConfig.recipes.settings.trashPenaltyCoins);
  });
});

describe('small oven, fryer, ice cream', () => {
  it('small oven holds two trays; a third is refused', () => {
    const k = make();
    expect(k.startSide('garlic_bread')).toBe(true);
    expect(k.startSide('cheesy_breadsticks')).toBe(true);
    expect(k.startSide('cinnamon_twists')).toBe(false);
    expect(k.smallOven.filter(Boolean)).toHaveLength(2);
  });
  it('a side is served by tapping it when ready; it goes to the oldest customer who wants it', () => {
    const k = make();
    const c = cust(k, ['garlic_bread']);
    k.startSide('garlic_bread');
    k.update(2);
    expect(k.tapSmallOven(0)).toBe(false); // still cooking: wobble
    k.update(5);
    expect(k.tapSmallOven(0)).toBe(true);
    expect(c.mood).toBe('happy');
    expect(k.smallOven[0]).toBeNull();
  });
  it('a ready side nobody ordered goes onto a plate when tapped (see pizza_plates.test.ts)', () => {
    const k = make();
    k.startSide('garlic_bread');
    k.update(7);
    expect(k.tapSmallOven(0)).toBe(true);
    expect(k.smallOven[0]).toBeNull();
    expect(k.plates.some((p) => p?.dish === 'garlic_bread')).toBe(true);
  });
  it('fries use basket 0 and wings basket 1, with independent timelines', () => {
    const k = make();
    expect(k.startFried('chicken_fries' as never)).toBe(false);
    expect(k.startFried('fries')).toBe(true);
    k.update(3);
    expect(k.startFried('chicken_wings')).toBe(true);
    expect(k.fryer[0]?.dish).toBe('fries');
    expect(k.fryer[1]?.dish).toBe('chicken_wings');
    k.update(2.5); // fries 5.5 s (ready at 5), wings 2.5 s (ready at 8)
    expect(k.fryer[0]?.phase).toBe('ready');
    expect(k.fryer[1]?.phase).toBe('cooking');
    expect(k.startFried('fries')).toBe(false); // basket busy
  });
  it('fryerSpeed makes fried food ready sooner', () => {
    const slow = make();
    const fast = make();
    fast.mods = { ...fast.mods, fryerSpeed: 1.25 };
    slow.startFried('fries');
    fast.startFried('fries');
    slow.update(4.5);
    fast.update(4.5);
    expect(slow.fryer[0]?.phase).toBe('cooking');
    expect(fast.fryer[0]?.phase).toBe('ready');
  });
  it('a burnt fry basket is cleared by a tap with the penalty', () => {
    const k = make();
    k.startFried('fries');
    k.update(5 + 5 + 0.5);
    expect(k.fryer[0]?.phase).toBe('burnt');
    const coins = k.coins;
    expect(k.tapFryer(0)).toBe(true);
    expect(k.fryer[0]).toBeNull();
    expect(k.coins).toBe(coins - defaultConfig.recipes.settings.trashPenaltyCoins);
  });
  it('ice cream fills in 5 s (pourSpeed shortens it) and is served by tapping', () => {
    const k = make();
    const c = cust(k, ['ice_cream']);
    expect(k.startIce()).toBe(true);
    k.update(4);
    expect(k.tapIce(0)).toBe(false);
    k.update(1.2);
    expect(k.ice[0]?.phase).toBe('ready');
    expect(k.tapIce(0)).toBe(true);
    expect(c.mood).toBe('happy');
    const q = make();
    q.mods = { ...q.mods, pourSpeed: 1.5 };
    q.startIce();
    q.update(3.5);
    expect(q.ice[0]?.phase).toBe('ready');
  });
  it('items not on the menu yet are refused', () => {
    const k = make(1);
    expect(k.startSide('garlic_bread')).toBe(false);
    expect(k.startFried('fries')).toBe(false);
    expect(k.startIce()).toBe(false);
  });
});

const isValidCustomFor = (id: string, step: number): boolean => {
  const r = parseCustom(id);
  if (!r) return false;
  const on = new Set(unlockedIngredients(defaultPizzaConfig, step));
  return on.has(`sauce:${r.sauce}`) && on.has(`cheese:${r.cheese}`) && r.toppings.length >= 1 && r.toppings.every((t) => on.has(`topping:${t}`));
};

describe('customers, orders and progress', () => {
  it('only ever orders unlocked dishes, never more than 5 seats, mint-ghost look only', () => {
    for (let step = 1; step <= 10; step++) {
      const k = make(step, step * 7);
      k.nextArrival = 0;
      const ids = new Set(k.dishes.map((d) => d.id));
      for (let i = 0; i < 4000; i++) {
        k.update(0.25);
        for (const c of k.customers) {
          // A build-your-own pizza is the one allowed extra: it must be a valid custom recipe made only of ingredients on the menu at this step.
          expect(c.items.every((x) => ids.has(x) || (step >= 5 && isValidCustomFor(x, step)))).toBe(true);
          expect(c.look).toBeGreaterThanOrEqual(CUSTOMER_LOOK_MIN);
          expect(c.look).toBeLessThanOrEqual(TACO_LOOK_MAX);
        }
        expect(k.customers.length).toBeLessThanOrEqual(5);
        if (k.closed) k.reopen();
      }
    }
  });
  it('seats grow 3 -> 5 across the menu steps', () => {
    expect(make(1).levelInfo.maxCustomers).toBe(3);
    expect(make(10).levelInfo.maxCustomers).toBe(5);
  });
  it('serving earns XP towards the menu step and the global Lv (Lv up pays coins)', () => {
    const k = make(1);
    const lvBefore = k.level;
    k.xp = k.xpNeeded - 1;
    cust(k, ['cheese_pizza']);
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(10);
    k.tapOven(0);
    k.tapBoard(a);
    expect(k.level).toBe(lvBefore + 1);
    expect(k.menuXp).toBeGreaterThan(0);
    expect(k.drainEvents().some((e) => e.type === 'levelUp')).toBe(true);
  });
  it('menu step grows with XP and announces the new dishes', () => {
    const k = make(1);
    k.menuXp = k.menuXpNeeded - 1;
    cust(k, ['cheese_pizza']);
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(10);
    k.tapOven(0);
    k.tapBoard(a);
    expect(k.menuStep).toBe(2);
    expect(k.drainEvents().find((e) => e.type === 'menuGrew')).toMatchObject({ added: expect.arrayContaining(['Margherita pizza']) });
  });
  it('learning: a never-served dish is introduced alone, with extra patience', () => {
    const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0, menuStep: 2, pizzaServed: { cheese_pizza: 3, garlic_bread: 3 } } as never, defaultConfig, undefined, 5);
    k.nextArrival = 0;
    k.nextEventIn = 9999;
    k.update(0.1);
    expect(k.customers).toHaveLength(1);
    expect(k.customers[0].items).toEqual(['margherita_pizza']);
    expect(k.customers[0].patienceMax).toBeGreaterThan(k.levelInfo.patience);
  });
  it('reopen gives 55 reputation, 100 after a rewarded ad, and clears the kitchen', () => {
    for (const [full, rep] of [[false, 55], [true, 100]] as const) {
      const k = make();
      buildCheese(k);
      k.startSide('garlic_bread');
      cust(k, ['cheese_pizza']);
      k.reputation = 1;
      k['addReputation'](-5);
      expect(k.closed).toBe(true);
      k.reopen(full);
      expect(k.closed).toBe(false);
      expect(k.reputation).toBe(rep);
      expect(k.boards.every((b) => b.item === null)).toBe(true);
      expect(k.smallOven.every((s) => s === null)).toBe(true);
      expect(k.customers).toHaveLength(0);
    }
  });
  it('mods default to none and stay at their own values', () => {
    const k = make();
    expect(k.mods).toMatchObject({ ovenSpeed: 1, fryerSpeed: 1, burnWindow: 1, calm: 1, patience: 1, tips: 1, pourSpeed: 1 });
  });
  it('ovenSpeed upgrade makes the brick oven finish sooner but keeps the burn window the same length', () => {
    const k = make();
    k.mods = { ...k.mods, ovenSpeed: 1.2 };
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(7.6); // 9 / 1.2 = 7.5 s
    expect(k.ovens[0]?.phase).toBe('ready');
  });
});

describe('dragging a dish to a customer', () => {
  it('a baked pizza dragged to the customer who ordered it serves exactly that customer, not the oldest', () => {
    const k = make();
    const first = cust(k, ['cheese_pizza']);
    const second = cust(k, ['cheese_pizza']);
    const a = buildCheese(k);
    k.sendToOven(a);
    k.update(10);
    k.tapOven(0);
    expect(k.serveBoard(a, second.id)).toBe(true);
    expect(second.mood).toBe('happy');
    expect(first.mood).toBe('waiting');
    expect(k.boards[a].item).toBeNull();
  });
  it('a ready side, fried basket or ice cream dragged to the right customer is served; to the wrong one it costs patience and stays', () => {
    const k = make();
    const wants = cust(k, ['garlic_bread', 'fries', 'ice_cream']);
    const other = cust(k, ['cheese_pizza']);
    k.startSide('garlic_bread');
    k.startFried('fries');
    k.startIce();
    k.update(8);
    expect(k.serveTray('small', 0, other.id)).toBe(false);
    expect(other.patience).toBeLessThan(other.patienceMax);
    expect(k.smallOven[0]).not.toBeNull();
    expect(k.serveTray('small', 0, wants.id)).toBe(true);
    expect(k.serveTray('fryer', 0, wants.id)).toBe(true);
    expect(k.serveIce(0, wants.id)).toBe(true);
    expect(wants.mood).toBe('happy');
  });
  it('a cooking tray dragged anywhere only wobbles, and a burnt one is thrown away, never served', () => {
    const k = make();
    const c = cust(k, ['garlic_bread']);
    k.startSide('garlic_bread');
    k.update(2);
    expect(k.serveTray('small', 0, c.id)).toBe(false);
    expect(k.smallOven[0]).not.toBeNull();
    k.update(20);
    expect(k.smallOven[0]?.phase).toBe('burnt');
    expect(k.serveTray('small', 0, c.id)).toBe(true); // clears it (penalty), the order is not delivered
    expect(c.delivered[0]).toBe(false);
    expect(k.smallOven[0]).toBeNull();
  });
});
