import { describe, expect, it } from 'vitest';
import { KitchenState, type Customer, type GameEvent } from '../src/game/KitchenState';
import { defaultConfig, type EventDef } from '../src/game/config';
import { validateEvents } from '../src/game/spooky';

const def = (): EventDef => defaultConfig.events.events.find((e) => e.id === 'ghost_party')!;
const make = (level = 10, seed = 3) => new KitchenState({ level, xp: 0, coins: 0 }, undefined, seed);
const evs = (k: KitchenState) => k.drainEvents();
/** Serve one customer straight away (same path the game uses). */
function serve(k: KitchenState, c: Customer, fast = true) {
  c.patience = fast ? c.patienceMax : c.patienceMax * 0.05;
  c.delivered = c.items.map(() => true);
  (k as unknown as { completeOrder(c: Customer): void }).completeOrder(c);
}
const tick = (k: KitchenState, secs: number) => {
  for (let t = 0; t < secs; t += 0.25) k.update(0.25);
};
const quiet = (k: KitchenState) => {
  k.nextEventIn = 1e9;
  k.nextArrival = 1e9;
};

describe('Ghost Party (data)', () => {
  it('starts at Lv 10 with a party of 3 and a 50 percent bonus', () => {
    expect(def().minLevel).toBe(10);
    expect(def().party).toEqual({ size: 3, bonus: 0.5 });
  });
  it('passes validation and bad party data is caught', () => {
    expect(validateEvents(defaultConfig.events.events)).toEqual([]);
    const bad = { ...def(), party: { size: 5, bonus: 0.9 } };
    const errs = validateEvents([bad]);
    expect(errs.some((e) => e.includes('party.size'))).toBe(true);
    expect(errs.some((e) => e.includes('party.bonus'))).toBe(true);
  });
  it('is not in the pool below Lv 10', () => {
    expect(defaultConfig.events.events.filter((e) => e.minLevel <= 9).some((e) => e.id === 'ghost_party')).toBe(false);
  });
});

describe('Ghost Party (model)', () => {
  it('3 customers arrive together when 3 seats are free', () => {
    const k = make();
    quiet(k);
    k.startEvent(def());
    tick(k, 0.5);
    expect(k.customers).toHaveLength(3);
    expect(new Set(k.customers.map((c) => c.party)).size).toBe(1);
    expect(k.customers.map((c) => c.seat).sort()).toEqual([0, 1, 2]);
    const arrive = evs(k).filter((e): e is Extract<GameEvent, { type: 'partyArrive' }> => e.type === 'partyArrive');
    expect(arrive).toHaveLength(1);
    expect(arrive[0].ids).toHaveLength(3);
  });
  it('waits, with no other arrivals, until 3 seats are free', () => {
    const k = make();
    quiet(k);
    k.spawnCustomer();
    k.startEvent(def());
    k.nextArrival = 0; // a normal arrival is due, but the party is pending
    tick(k, 3);
    expect(k.customers).toHaveLength(1);
    expect(k.partyPending).toBe(true);
    serve(k, k.customers[0]);
    tick(k, 4); // the served customer leaves, seats free up
    expect(k.customers.filter((c) => c.party !== undefined)).toHaveLength(3);
    expect(k.partyPending).toBe(false);
  });
  it('never comes when the event ends before the seats free up', () => {
    const k = make();
    quiet(k);
    k.spawnCustomer();
    k.customers[0].patience = 1e9;
    k.customers[0].patienceMax = 1e9;
    k.startEvent(def());
    tick(k, def().duration + 1);
    expect(k.customers.some((c) => c.party !== undefined)).toBe(false);
    expect(k.partyPending).toBe(false);
  });
  it('is not used below the seat count it needs (2 seats can never host 3)', () => {
    const k = make(4);
    quiet(k);
    k.startEvent(def());
    tick(k, 2);
    expect(k.customers).toHaveLength(0);
  });
  it('pays +50 percent of what the party paid, once, when all 3 are served and nobody left angry', () => {
    const k = make();
    quiet(k);
    k.startEvent(def());
    tick(k, 0.5);
    evs(k);
    let paid = 0;
    const party = [...k.customers];
    for (const c of party) {
      const before = k.coins;
      serve(k, c);
      paid += k.coins - before;
    }
    const done = evs(k).filter((e): e is Extract<GameEvent, { type: 'partyDone' }> => e.type === 'partyDone');
    expect(done).toHaveLength(1);
    // coins credited by completeOrder include the bonus only on the last serve; derive the base from the events
    const orders = party.length;
    expect(done[0].size).toBe(orders);
    expect(done[0].bonus).toBeGreaterThan(0);
    expect(paid).toBeGreaterThan(done[0].bonus);
    expect(k.party).toBeNull();
  });
  it('the bonus is half of what the three serves paid', () => {
    const k = make();
    quiet(k);
    k.startEvent(def());
    tick(k, 0.5);
    const events: GameEvent[] = [];
    for (const c of [...k.customers]) {
      serve(k, c);
      events.push(...evs(k));
    }
    const earned = events.filter((e): e is Extract<GameEvent, { type: 'orderDone' }> => e.type === 'orderDone').reduce((n, e) => n + e.coins, 0);
    const bonus = events.find((e) => e.type === 'partyDone') as Extract<GameEvent, { type: 'partyDone' }>;
    expect(bonus.bonus).toBe(Math.round(earned * 0.5));
  });
  it('no bonus when one of the three leaves angry', () => {
    const k = make();
    quiet(k);
    k.startEvent(def());
    tick(k, 0.5);
    evs(k);
    const [a, b, c] = [...k.customers];
    a.patience = 0.01;
    (k as unknown as { updateCustomers(dt: number): void }).updateCustomers(1);
    serve(k, b);
    serve(k, c);
    const e = evs(k);
    expect(e.filter((x) => x.type === 'partyFailed')).toHaveLength(1);
    expect(e.some((x) => x.type === 'partyDone')).toBe(false);
  });
  it('an ordinary customer served during the party does not count toward it', () => {
    const k = make(13); // 4 seats
    quiet(k);
    k.startEvent(def());
    tick(k, 0.5);
    evs(k);
    k.spawnCustomer();
    const extra = k.customers.find((c) => c.party === undefined)!;
    serve(k, extra);
    expect(evs(k).some((x) => x.type === 'partyDone')).toBe(false);
    expect(k.party?.served).toBe(0);
  });
});
