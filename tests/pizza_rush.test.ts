import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/game/config';
import { CUSTOMER_LOOK_MIN } from '../src/game/KitchenState';
import { PizzaKitchenState, type PizzaCustomer } from '../src/game/pizza/PizzaKitchenState';
import { defaultPizzaConfig as P } from '../src/game/pizza/pizzaConfig';
import { RUSH_ID, rushAvailable, rushCompleteBonus, rushTicketCoins, rushTicketCount } from '../src/game/pizza/pizzaRush';
import { validatePizza } from '../src/data/validate';

const rush = P.events.delivery_rush;
const make = (step = 6) => {
  const k = new PizzaKitchenState({ level: 30, xp: 0, coins: 0 }, defaultConfig, undefined, 3);
  k.menuStep = step;
  for (const d of P.dishes) k.dishServes[d.id] = 9;
  k.nextArrival = 9999;
  k.nextEventIn = 9999;
  return k;
};
const start = (k: PizzaKitchenState) => k.startEvent({ id: RUSH_ID, name: rush.name, minLevel: 0, duration: rush.duration });
/** Make every ticket want one plain cheese pizza so the test can serve it. */
const cheeseTickets = (k: PizzaKitchenState) => k.tickets.forEach((t) => ((t.items = ['cheese_pizza']), (t.price = 24)));
const bakedCheese = (k: PizzaKitchenState) => {
  const b = k.startPizza()!;
  k.addIngredient('sauce:tomato', b);
  k.addIngredient('cheese:mozzarella', b);
  k.finishPizza(b);
  k.sendToOven(b);
  k.update(10);
  k.tapOven(0);
  k.boards[b].item!.perfect = false; // keep the money maths plain; perfect tips have their own tests
  if (k.event) k.event.remaining = rush.duration; // baking takes game time: keep the rush open
  return b;
};
const evId = (k: PizzaKitchenState): string | null => k.event?.def.id ?? null;
const customer = (k: PizzaKitchenState, items: string[]): PizzaCustomer => {
  const c: PizzaCustomer = { id: 900 + k.customers.length, seat: k.customers.length, look: CUSTOMER_LOOK_MIN, items, delivered: items.map(() => false), price: 30, patience: 60, patienceMax: 60, age: 5, type: 'regular', mood: 'waiting', leaveIn: 0 };
  k.customers.push(c);
  return c;
};

describe('delivery rush (pure)', () => {
  it('the data is valid and says what the spec says', () => {
    expect(validatePizza(P)).toEqual([]);
    expect(rush).toMatchObject({ minStep: 4, duration: 45, tickets: [3, 5], coinMult: 1.5 });
  });
  it('ticket count stays inside the range for any random number', () => {
    const seen = new Set<number>();
    for (const r of [0, 0.2, 0.34, 0.5, 0.67, 0.99, 0.999999]) seen.add(rushTicketCount(rush, () => r));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });
  it('rewards: price x 1.5 plus perfect tip; bonus is a fraction of the total', () => {
    expect(rushTicketCoins(24, 1.5)).toBe(36);
    expect(rushTicketCoins(24, 1.5, 3)).toBe(39);
    expect(rushCompleteBonus(100, 0.25)).toBe(25);
    expect(rushCompleteBonus(0, 0.25)).toBe(0);
  });
  it('only available from menu step 4', () => {
    expect([1, 3].map((s) => rushAvailable(rush, s))).toEqual([false, false]);
    expect([4, 10].map((s) => rushAvailable(rush, s))).toEqual([true, true]);
  });
});

describe('delivery rush in the kitchen', () => {
  it('brings 3 to 5 single-pizza tickets and uses no seats', () => {
    const k = make();
    start(k);
    expect(k.tickets.length).toBeGreaterThanOrEqual(3);
    expect(k.tickets.length).toBeLessThanOrEqual(5);
    expect(k.customers).toHaveLength(0);
    for (const t of k.tickets) {
      expect(t.items).toHaveLength(1);
      expect(k.dishDef(t.items[0])!.kind).toBe('pizza');
      expect(t.seat).toBe(-1);
    }
    expect(k.events.some((e) => e.type === 'ticketsStart')).toBe(true);
    expect(k.events.some((e) => e.type === 'eventStart' && e.id === RUSH_ID)).toBe(true);
  });
  it('normal customers keep arriving and are not paid the rush multiplier', () => {
    const k = make();
    start(k);
    expect(k.event?.def.coinMult).toBeUndefined();
    k.nextArrival = 0;
    k.update(0.1);
    expect(k.customers.length).toBe(1);
  });
  it('serving a ticket pays price x 1.5, gives XP, and does not touch streak, combo or reputation', () => {
    const k = make();
    start(k);
    cheeseTickets(k);
    const rep = k.reputation;
    const b = bakedCheese(k);
    k.events.length = 0;
    expect(k.serveBoard(b)).toBe(true);
    expect(k.coins).toBe(36);
    expect(k.streak).toBe(0);
    expect(k.combo).toBe(0);
    expect(k.served).toBe(0);
    expect(k.reputation).toBe(rep);
    expect(k.events.some((e) => e.type === 'ticketDone' && e.coins === 36)).toBe(true);
  });
  it('a waiting customer is served first when both want the same pizza', () => {
    const k = make();
    start(k);
    cheeseTickets(k);
    const c = customer(k, ['cheese_pizza']);
    const b = bakedCheese(k);
    expect(k.serveBoard(b)).toBe(true);
    expect(c.delivered[0]).toBe(true);
    expect(k.tickets.every((t) => !t.delivered[0])).toBe(true);
  });
  it('serving every ticket adds the completion bonus once', () => {
    const k = make();
    start(k);
    cheeseTickets(k);
    const n = k.tickets.length;
    for (let i = 0; i < n; i++) k.serveBoard(bakedCheese(k));
    const total = n * 36;
    expect(k.events.filter((e) => e.type === 'rushComplete')).toHaveLength(1);
    expect(k.coins).toBe(total + Math.round(total * rush.completeBonus));
  });
  it('a wrong pizza costs nothing and the ticket stays', () => {
    const k = make();
    start(k);
    k.tickets.forEach((t) => (t.items = ['margherita']));
    const b = bakedCheese(k);
    expect(k.serveTicket(b, k.tickets[0].id)).toBe(false);
    expect(k.coins).toBe(0);
    expect(k.boards[b].item).not.toBeNull();
    expect(k.tickets[0].mood).toBe('waiting');
  });
  it('unserved tickets expire when the rush ends, with no reputation penalty, and are then removed', () => {
    const k = make();
    start(k);
    const rep = k.reputation;
    const n = k.tickets.length;
    k.nextEventIn = 9999;
    for (let i = 0; i < 200; i++) k.update(0.25);
    expect(k.event).toBeNull();
    expect(k.events.filter((e) => e.type === 'ticketExpired')).toHaveLength(n);
    expect(k.events.some((e) => e.type === 'rushComplete')).toBe(false);
    expect(k.tickets).toHaveLength(0);
    expect(k.reputation).toBe(rep);
    expect(k.coins).toBe(0);
  });
  it('a ticket can be a build-your-own pizza and the board can build it', () => {
    const k = make(10);
    const custom = k.dishDef('cheese_pizza')!;
    expect(custom).toBeDefined();
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      start(k);
      found = k.tickets.some((t) => t.items[0].startsWith('custom'));
      if (!found) {
        k.event = null;
        k.tickets = [];
      }
    }
    expect(found).toBe(true);
  });
  it('the rush can only start from menu step 4 in the random event pick', () => {
    const k = make(3);
    k.nextEventIn = 0;
    for (let i = 0; i < 100; i++) {
      k.update(0.25);
      expect(evId(k)).not.toBe(RUSH_ID);
      k.event = null;
      k.nextEventIn = 0;
    }
  });
  it('can start by itself from step 4 and reopening clears the tickets', () => {
    const k = make(8);
    let started = false;
    for (let i = 0; i < 400 && !started; i++) {
      k.event = null;
      k.nextEventIn = 0;
      k.update(0.25);
      started = evId(k) === RUSH_ID;
    }
    expect(started).toBe(true);
    k.closed = true;
    k.reopen();
    expect(k.tickets).toHaveLength(0);
    expect(k.event).toBeNull();
  });
  it('isNeeded notices a pizza that only a ticket wants', () => {
    const k = make();
    start(k);
    cheeseTickets(k);
    expect(k.isNeeded('cheese_pizza')).toBe(true);
    expect(k.isNeeded('white_pizza')).toBe(false);
  });
});
