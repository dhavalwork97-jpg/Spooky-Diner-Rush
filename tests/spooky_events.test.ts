import { describe, expect, it } from 'vitest';
import { defaultConfig, type EventDef } from '../src/game/config';
import { KitchenState, type Customer, type GameEvent } from '../src/game/KitchenState';
import { makeRng } from '../src/game/rng';
import { BAT_BAND, BAT_FLIGHT_SECONDS, EVENT_NAME_MAX, batBagCoins, batPosition, batSchedule, nextFlightDue, validateEvents } from '../src/game/spooky';
import { HAUNTED_LAMP_MIN, approach, hauntedLampIntensity, lampIntensity } from '../src/anim/atmosphereMath';

const def = (id: string): EventDef => defaultConfig.events.events.find((e) => e.id === id)!;
const make = (level: number, seed = 1) => new KitchenState({ level, xp: 0, coins: 0 }, undefined, seed);
const finish = (k: KitchenState, c: Customer, fast: boolean) => {
  c.patience = fast ? c.patienceMax : c.patienceMax * 0.05;
  c.delivered = c.items.map(() => true);
  (k as unknown as { completeOrder(c: Customer): void }).completeOrder(c);
};

describe('spooky events: data', () => {
  it('the events file is valid', () => expect(validateEvents(defaultConfig.events.events)).toEqual([]));
  it('Full Moon is Lv 4, Bat Delivery Lv 8, Haunted Lights Lv 9; the four old events are unchanged', () => {
    expect(def('full_moon').minLevel).toBe(4);
    expect(def('bat_delivery').minLevel).toBe(8);
    expect(def('haunted_lights').minLevel).toBe(9);
    expect(def('lunch_rush')).toMatchObject({ minLevel: 3, duration: 25, arrivalMult: 0.6 });
    expect(def('double_coins')).toMatchObject({ minLevel: 3, duration: 30, coinMult: 2 });
    expect(def('slow_oven')).toMatchObject({ minLevel: 5, duration: 30, ovenSpeed: 0.7 });
    expect(def('vip_visit')).toMatchObject({ minLevel: 6, duration: 40, spawnType: 'vip' });
  });
  it('Full Moon: customers arrive about 20 percent faster and pay about 20 percent more', () => {
    const m = def('full_moon');
    expect(1 / m.arrivalMult!).toBeGreaterThan(1.15);
    expect(1 / m.arrivalMult!).toBeLessThan(1.25);
    expect(m.coinMult).toBe(1.2);
    expect(m.look).toBe('moon');
  });
  it('Haunted Lights: about +20 percent coins and the lamp look', () => {
    expect(def('haunted_lights')).toMatchObject({ coinMult: 1.2, look: 'lights' });
  });
  it('Bat Delivery: 3 flights, bags worth 20-40, at most 3 per event', () => {
    expect(def('bat_delivery').bat).toEqual({ flights: 3, coins: [20, 40], maxDrops: 3 });
  });
  it('every event name fits the banner', () => {
    for (const e of defaultConfig.events.events) expect(e.name.length).toBeLessThanOrEqual(EVENT_NAME_MAX);
  });
  it('the validator catches bad data', () => {
    const base = { id: 'x', name: 'X', minLevel: 4, duration: 30 };
    expect(validateEvents([{ ...base, name: 'A name that is much too long' }]).length).toBe(1);
    expect(validateEvents([{ ...base, coinMult: 0.5 }]).length).toBe(1);
    expect(validateEvents([{ ...base, look: 'sun' as 'moon' }]).length).toBe(1);
    expect(validateEvents([{ ...base, bat: { flights: 3, coins: [40, 20], maxDrops: 3 } }]).length).toBe(1);
    expect(validateEvents([{ ...base, bat: { flights: 2, coins: [20, 40], maxDrops: 3 } }]).length).toBe(1);
    expect(validateEvents([{ ...base, duration: 14, bat: { flights: 3, coins: [20, 40], maxDrops: 3 } }]).length).toBe(1);
    expect(validateEvents([base, base]).some((e) => e.includes('duplicate'))).toBe(true);
  });
});

describe('spooky events: which ones can start', () => {
  const started = (level: number): Set<string> => {
    const ids = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(level, seed);
      s.nextArrival = 1e9;
      for (let t = 0; t < 1500; t += 0.5) {
        s.update(0.5);
        for (const e of s.drainEvents()) if (e.type === 'eventStart') ids.add(e.id);
      }
    }
    return ids;
  };
  it('only events whose Lv is reached are picked', () => {
    expect([...started(3)].sort()).toEqual(['double_coins', 'lunch_rush']);
    expect(started(4).has('full_moon')).toBe(true);
    expect(started(7).has('bat_delivery')).toBe(false);
    expect(started(8).has('bat_delivery')).toBe(true);
    expect(started(8).has('haunted_lights')).toBe(false);
    expect(started(9).has('haunted_lights')).toBe(true);
  });
  it('events still run one at a time', () => {
    const s = make(10, 5);
    s.nextArrival = 1e9;
    let open = 0;
    for (let t = 0; t < 3000; t += 0.5) {
      s.update(0.5);
      for (const e of s.drainEvents()) {
        if (e.type === 'eventStart') open++;
        if (e.type === 'eventEnd') open--;
        expect(open).toBeLessThanOrEqual(1);
        expect(open).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('Full Moon and Haunted Lights pay 20 percent more', () => {
  const coinsFor = (id: string | null): number => {
    const k = make(9, 3);
    k.spawnCustomer();
    if (id) k.event = { def: def(id), remaining: 99 };
    const c = k.customers[0];
    c.items = ['fries'];
    const before = k.coins;
    finish(k, c, false);
    return k.coins - before;
  };
  it('a plain order pays 20 percent more during each', () => {
    const plain = coinsFor(null);
    expect(coinsFor('full_moon')).toBe(Math.round(plain * 1.2));
    expect(coinsFor('haunted_lights')).toBe(Math.round(plain * 1.2));
    expect(coinsFor('double_coins')).toBe(plain * 2); // unchanged
  });
  it('Full Moon brings customers about 20 percent more often', () => {
    const arrivals = (id: string | null): number => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const k = make(7, seed);
        k.nextEventIn = 1e9; // no random events: only the one forced here
        if (id) k.event = { def: { ...def(id), duration: 1e9 }, remaining: 1e9 };
        for (let t = 0; t < 300; t += 0.25) {
          k.update(0.25);
          for (const e of k.drainEvents()) if (e.type === 'arrive') (n++, (k.customers = []));
        }
      }
      return n;
    };
    const ratio = arrivals('full_moon') / arrivals(null);
    expect(ratio).toBeGreaterThan(1.12);
    expect(ratio).toBeLessThan(1.3);
  });
});

describe('Bat Delivery: flight plan', () => {
  it('has the right number of flights, in order, never two bats at once, alternating sides, inside the event', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const plan = batSchedule(3, 30, makeRng(seed));
      expect(plan).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(plan[i].at).toBeGreaterThanOrEqual(1);
        expect(plan[i].at + BAT_FLIGHT_SECONDS).toBeLessThanOrEqual(30 - 1 + 1e-9);
        expect(plan[i].y).toBeGreaterThanOrEqual(0.1);
        expect(plan[i].y).toBeLessThanOrEqual(0.9);
        if (i > 0) {
          expect(plan[i].at).toBeGreaterThanOrEqual(plan[i - 1].at + BAT_FLIGHT_SECONDS);
          expect(plan[i].fromLeft).toBe(!plan[i - 1].fromLeft);
        }
      }
    }
  });
  it('the same seed gives the same plan', () => expect(batSchedule(3, 30, makeRng(9))).toEqual(batSchedule(3, 30, makeRng(9))));
  it('the next flight is due only when its time has come, one at a time', () => {
    const plan = batSchedule(3, 30, makeRng(2));
    expect(nextFlightDue(plan, 0, plan[0].at - 0.01)).toBe(-1);
    expect(nextFlightDue(plan, 0, plan[0].at)).toBe(0);
    expect(nextFlightDue(plan, 1, plan[0].at + 1)).toBe(-1);
    expect(nextFlightDue(plan, 1, plan[1].at)).toBe(1);
    expect(nextFlightDue(plan, 3, 999)).toBe(-1);
  });
  it('the bat enters off-screen, crosses to the other side and stays in the band; right-to-left bats are flipped', () => {
    const ltr = { at: 5, fromLeft: true, y: 0.5 };
    const rtl = { at: 5, fromLeft: false, y: 0.5 };
    expect(batPosition(ltr, 5, 1280)).toMatchObject({ progress: 0, flip: false });
    expect(batPosition(ltr, 5, 1280).x).toBeLessThan(0);
    expect(batPosition(ltr, 5 + BAT_FLIGHT_SECONDS, 1280).x).toBeGreaterThan(1280);
    expect(batPosition(rtl, 5, 1280).x).toBeGreaterThan(1280);
    expect(batPosition(rtl, 5 + BAT_FLIGHT_SECONDS, 1280).x).toBeLessThan(0);
    expect(batPosition(rtl, 5, 1280).flip).toBe(true);
    const mid = batPosition(ltr, 5 + BAT_FLIGHT_SECONDS / 2, 1280);
    expect(mid.x).toBeCloseTo(640, 0);
    for (let p = 0; p <= 1; p += 0.05) {
      const y = batPosition({ at: 0, fromLeft: true, y: 0 }, p * BAT_FLIGHT_SECONDS, 1280).y;
      expect(y).toBeGreaterThanOrEqual(BAT_BAND.top - BAT_BAND.bob - 0.01);
      const y2 = batPosition({ at: 0, fromLeft: true, y: 1 }, p * BAT_FLIGHT_SECONDS, 1280).y;
      expect(y2).toBeLessThanOrEqual(BAT_BAND.bottom + BAT_BAND.bob + 0.01);
    }
  });
  it('a bag holds 20, 25, 30, 35 or 40 coins and all of them come up', () => {
    const seen = new Set<number>();
    const rng = makeRng(4);
    for (let i = 0; i < 400; i++) seen.add(batBagCoins([20, 40], rng));
    expect([...seen].sort((a, b) => a - b)).toEqual([20, 25, 30, 35, 40]);
  });
});

describe('Bat Delivery: the model pays', () => {
  const startBat = (k: KitchenState) => k.startEvent(def('bat_delivery'));
  it('a tap pays one bag (20-40) and emits batCaught', () => {
    const k = make(8);
    startBat(k);
    k.drainEvents();
    const coins = k.catchBat();
    expect(coins).toBeGreaterThanOrEqual(20);
    expect(coins).toBeLessThanOrEqual(40);
    expect(k.coins).toBe(coins);
    expect(k.drainEvents().filter((e): e is Extract<GameEvent, { type: 'batCaught' }> => e.type === 'batCaught')).toEqual([{ type: 'batCaught', coins, drop: 1 }]);
  });
  it('at most 3 bags per event, then nothing; the next bat event pays again', () => {
    const k = make(8);
    startBat(k);
    const paid = [k.catchBat(), k.catchBat(), k.catchBat(), k.catchBat(), k.catchBat()];
    expect(paid.slice(0, 3).every((c) => c >= 20)).toBe(true);
    expect(paid.slice(3)).toEqual([0, 0]);
    expect(k.coins).toBe(paid[0] + paid[1] + paid[2]);
    startBat(k);
    expect(k.catchBat()).toBeGreaterThanOrEqual(20);
  });
  it('pays nothing without a bat event, during another event, or when closed', () => {
    const k = make(8);
    expect(k.catchBat()).toBe(0);
    k.startEvent(def('full_moon'));
    expect(k.catchBat()).toBe(0);
    startBat(k);
    k.reputation = 0;
    (k as unknown as { addReputation(n: number): void }).addReputation(-1);
    expect(k.closed).toBe(true);
    expect(k.catchBat()).toBe(0);
    expect(k.coins).toBe(0);
  });
  it('the bag never changes the random sequence of customers (its own random stream)', () => {
    const order = (catches: boolean): string => {
      const k = make(8, 11);
      startBat(k);
      if (catches) (k.catchBat(), k.catchBat());
      const out: string[] = [];
      for (let i = 0; i < 6; i++) {
        k.customers = [];
        k.spawnCustomer();
        out.push(k.customers[0].items.join('+') + ':' + k.customers[0].look);
      }
      return out.join(',');
    };
    expect(order(true)).toBe(order(false));
  });
});

describe('Haunted Lights: lamp flicker math', () => {
  it('flickers hard but stays readable: never below the floor, never above 1, never NaN', () => {
    let min = 9;
    let max = 0;
    for (let phase = 0; phase < 6; phase += 0.7) {
      for (let t = 0; t < 120; t += 0.013) {
        const v = hauntedLampIntensity(t, phase);
        expect(Number.isFinite(v)).toBe(true);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    expect(min).toBeGreaterThanOrEqual(HAUNTED_LAMP_MIN);
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeLessThan(0.6); // a real dip
  });
  it('moves much more than the calm lamp, and is repeatable', () => {
    const spread = (fn: (t: number, p: number) => number) => {
      const xs = Array.from({ length: 2000 }, (_, i) => fn(i * 0.02, 1.3));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread(hauntedLampIntensity)).toBeGreaterThan(spread(lampIntensity) * 5);
    expect(hauntedLampIntensity(12.5, 2)).toBe(hauntedLampIntensity(12.5, 2));
  });
  it('the look fades in and out smoothly (approach never overshoots)', () => {
    expect(approach(0, 1, 1 / 1.2, 0.5)).toBeCloseTo(0.4167, 3);
    expect(approach(0.9, 1, 1, 5)).toBe(1);
    expect(approach(1, 0, 1, 0.25)).toBe(0.75);
    expect(approach(0.1, 0, 1, 5)).toBe(0);
  });
});
