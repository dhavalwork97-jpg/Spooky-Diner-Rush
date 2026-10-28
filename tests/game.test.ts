import { describe, expect, it } from 'vitest';
import { cookPhase, burnWindowFor } from '../src/game/cook';
import { KitchenState, type GameEvent } from '../src/game/KitchenState';
import { levelDef, defaultConfig, xpForLevel } from '../src/game/config';
import { nextHint } from '../src/game/tutorial';

const run = (s: KitchenState, seconds: number, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) s.update(step);
};
const types = (e: GameEvent[]) => e.map((x) => x.type);

describe('cook phases', () => {
  it('matches the spec example for fries with the beginner bonus removed', () => {
    // ready 5s, warning 7s, burnt 9s
    expect(cookPhase(4.9, 5, 4)).toBe('cooking');
    expect(cookPhase(5, 5, 4)).toBe('ready');
    expect(cookPhase(7, 5, 4)).toBe('warning');
    expect(cookPhase(8, 5, 4)).toBe('danger');
    expect(cookPhase(9, 5, 4)).toBe('burnt');
  });
  it('gives beginners a longer burn window up to level 5 only', () => {
    expect(burnWindowFor(4, 1, 5, 2)).toBe(6);
    expect(burnWindowFor(4, 5, 5, 2)).toBe(6);
    expect(burnWindowFor(4, 6, 5, 2)).toBe(4);
  });
});

describe('progression data', () => {
  it('never raises customer count in the same level that unlocks a recipe', () => {
    const lv = defaultConfig.progression.levels;
    for (let i = 1; i < lv.length; i++) {
      const newRecipe = lv[i].items.length > lv[i - 1].items.length;
      const moreCustomers = lv[i].maxCustomers > lv[i - 1].maxCustomers;
      expect(newRecipe && moreCustomers).toBe(false);
    }
  });
  it('tightens patience slowly past the last level, with a floor', () => {
    const a = levelDef(defaultConfig, 4).patience;
    const b = levelDef(defaultConfig, 200).patience;
    expect(a).toBeLessThan(levelDef(defaultConfig, 3).patience);
    expect(b).toBe(defaultConfig.progression.afterLast.patienceFloor);
  });
});

describe('fryer', () => {
  it('has two independent vats', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.startFry();
    run(s, 2);
    s.startFry();
    run(s, 3.2); // vat 0 at 5.2s: ready; vat 1 at 3.2s: cooking
    expect(s.vats[0]?.phase).toBe('ready');
    expect(s.vats[1]?.phase).toBe('cooking');
  });
  it('asks for the fries bin when an empty vat is tapped', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.tapFryer(0);
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'Tap the fries or nuggets bin first' }]);
  });
  it('says the fryer is full when both vats are busy', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.startFry();
    s.startFry();
    s.drainEvents();
    s.startFry();
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'The fryer is full' }]);
  });
  it('rejects collecting before ready and does not penalize', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.startFry();
    run(s, 2);
    s.drainEvents();
    s.tapFryer(0);
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'Not ready yet' }]);
    expect(s.vats[0]).not.toBeNull();
  });
  it('collects ready fries onto a side plate', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.startFry();
    run(s, 5.2);
    s.tapFryer(0);
    expect(s.slots[4].row).toBe('side');
    expect(s.slots[4].item?.kind).toBe('fries');
    expect(s.vats[0]).toBeNull();
  });
  it('burns fries after the window, drops reputation once, and needs a discard with a coin penalty', () => {
    const s = new KitchenState({ level: 1, xp: 0, coins: 10 }, undefined, 1);
    const rep = s.reputation;
    s.startFry();
    run(s, 5 + 6 + 0.5); // beginner window is 6s at level 1
    expect(s.vats[0]?.phase).toBe('burnt');
    expect(s.reputation).toBe(rep - defaultConfig.recipes.settings.burnReputationPenalty);
    run(s, 5);
    expect(s.reputation).toBe(rep - defaultConfig.recipes.settings.burnReputationPenalty);
    s.tapFryer(0);
    expect(s.vats[0]).toBeNull();
    expect(s.coins).toBe(10 - defaultConfig.recipes.settings.trashPenaltyCoins);
  });
  it('says the plate is full when no side plate is free', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.slots.filter((sl) => sl.row === 'side').forEach((sl, i) => (sl.item = { id: 100 + i, kind: 'fries', placed: [], building: false }));
    s.startFry();
    run(s, 5.2);
    s.drainEvents();
    s.tapFryer(0);
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'The plate is full' }]);
  });
});

describe('grill and burger', () => {
  const lv2 = () => new KitchenState({ level: 2, xp: 0, coins: 0 }, undefined, 3);
  /** Cook a patty on burner 0 through both sides. */
  const cookPatty = (s: KitchenState) => {
    s.startPatty();
    run(s, 4.2);
    s.tapGrill(0); // flip
    run(s, 4.2);
  };
  it('builds a burger in the video order: bun, patty, lettuce, tomato, then the top bun closes it', () => {
    const s = lv2();
    s.tapBuns();
    expect(s.slots[0].item).toMatchObject({ building: true, placed: ['bun_bottom'] });
    cookPatty(s);
    expect(s.burners[0]?.side).toBe(2);
    s.tapGrill(0);
    expect(s.burners[0]).toBeNull();
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom', 'patty']);
    s.tapTopping('lettuce');
    s.tapTopping('tomato');
    expect(s.slots[0].item).toMatchObject({ kind: 'burger', building: false });
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom', 'patty', 'lettuce', 'tomato', 'bun_top']);
  });
  it('asks for the buns first when no burger is waiting for the patty', () => {
    const s = lv2();
    cookPatty(s);
    s.drainEvents();
    s.tapGrill(0);
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'Tap the buns first' }]);
    expect(s.burners[0]).not.toBeNull();
  });
  it('rejects toppings placed out of order and says what is next', () => {
    const s = lv2();
    s.tapBuns();
    s.drainEvents();
    s.tapTopping('tomato');
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'Add a patty first' }]);
    expect(s.slots[0].item?.placed).toEqual(['bun_bottom']);
  });
  it('an empty burner asks for a patty from the tray', () => {
    const s = lv2();
    s.tapGrill(0);
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'Tap the patties first' }]);
  });
  it('locks burgers until level 2', () => {
    const s = new KitchenState(undefined, undefined, 1);
    s.tapBuns();
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'Burgers unlock at Lv 2' }]);
  });
  it('clears a half-built burger with the trash and no penalty', () => {
    const s = lv2();
    s.coins = 10;
    s.tapBuns();
    s.tapTrash();
    expect(s.slots[0].item).toBeNull();
    expect(s.coins).toBe(10);
  });
});

describe('serving', () => {
  function withCustomerWanting(kind: 'fries' | 'burger') {
    for (let seed = 1; seed < 400; seed++) {
      const s = new KitchenState({ level: 2, xp: 0, coins: 0 }, undefined, seed);
      s.update(1.2);
      const c = s.customers[0];
      if (c && c.items.length === 1 && c.items[0] === kind) return s;
    }
    throw new Error('no seed found');
  }
  it('serves the right item, awards coins, XP and reputation', () => {
    const s = withCustomerWanting('burger');
    s.slots[0].item = { id: 900, kind: 'burger', placed: [], building: false };
    s.reputation = 50;
    const ok = s.serve(0, s.customers[0].id);
    expect(ok).toBe(true);
    expect(s.coins).toBeGreaterThanOrEqual(26);
    expect(s.xp).toBeGreaterThan(0);
    expect(s.reputation).toBe(53);
    expect(s.customers[0].mood).toBe('happy');
  });
  it('snaps back a wrong item with no penalty', () => {
    const s = withCustomerWanting('burger');
    s.slots[0].item = { id: 901, kind: 'fries', placed: [], building: false };
    const rep = s.reputation;
    const ok = s.serve(0, s.customers[0].id);
    expect(ok).toBe(false);
    expect(s.slots[0].item).not.toBeNull();
    expect(s.reputation).toBe(rep);
    expect(s.coins).toBe(0);
  });
  it('does not accept an unfinished burger', () => {
    const s = withCustomerWanting('burger');
    s.slots[0].item = { id: 902, kind: 'burger', placed: ['bun_bottom'], building: true };
    expect(s.serve(0, s.customers[0].id)).toBe(false);
  });
  it('needs every item before the customer leaves happy', () => {
    for (let seed = 1; seed < 800; seed++) {
      const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, seed);
      s.update(1.2);
      const c = s.customers[0];
      if (!c || c.items.length !== 2) continue;
      s.slots[0].item = { id: 1, kind: c.items[0], placed: [], building: false };
      s.slots[1].item = { id: 2, kind: c.items[1], placed: [], building: false };
      s.serve(0, c.id);
      expect(c.mood).toBe('waiting');
      s.serve(1, c.id);
      expect(c.mood).toBe('happy');
      return;
    }
    throw new Error('no two-item order found');
  });
});

describe('customers and patience', () => {
  it('first customer arrives within about a second', () => {
    const s = new KitchenState(undefined, undefined, 5);
    s.update(1.05);
    expect(s.customers.length).toBe(1);
  });
  it('respects the max customer count for the level', () => {
    const s = new KitchenState(undefined, undefined, 5);
    s.reputation = 100;
    for (let i = 0; i < 100; i++) {
      s.update(0.1);
      expect(s.customers.filter((c) => c.mood === 'waiting').length).toBeLessThanOrEqual(1);
    }
  });
  it('an unserved customer leaves angry, costs reputation, and the shop eventually closes', () => {
    const s = new KitchenState(undefined, undefined, 5);
    const events: GameEvent[] = [];
    for (let i = 0; i < 9000 && !s.closed; i++) {
      s.update(0.1);
      events.push(...s.drainEvents());
    }
    expect(types(events)).toContain('angryLeave');
    expect(s.closed).toBe(true);
    expect(types(events)).toContain('closed');
  });
});

describe('closing and reopening', () => {
  it('keeps level, XP and coins, and quietly adds patience after repeated closes', () => {
    const s = new KitchenState({ level: 2, xp: 30, coins: 77 }, undefined, 5);
    s.reputation = 1;
    s.update(1.2);
    s.update(1.0); // past the arrival grace so patience drains
    const patience0 = s.customers[0].patienceMax;
    s.customers[0].patience = 0.05;
    s.update(0.2);
    expect(s.closed).toBe(true);
    s.reopen();
    expect([s.level, s.xp, s.coins]).toEqual([2, 30, 77]);
    expect(s.closed).toBe(false);
    s.update(1.2);
    expect(s.customers[0].patienceMax).toBeCloseTo(patience0 * 1.1, 5);
  });
});

describe('xp and levels', () => {
  it('levels up, grants coins and reports unlocks', () => {
    const s = new KitchenState({ level: 1, xp: 0, coins: 0 }, undefined, 9);
    s.update(1.2);
    s.slots[0].item = { id: 1, kind: 'fries', placed: [], building: false };
    s.customers[0].items = ['fries'];
    s.customers[0].delivered = [false];
    s.customers[0].price = 12;
    s.serve(0, s.customers[0].id);
    s.serve(0, s.customers[0].id);
    expect(s.xp).toBeGreaterThan(0);
    s.xp = xpForLevel(defaultConfig, 1) - 1;
    s.customers[0].mood = 'waiting';
    s.customers[0].delivered = [false];
    s.slots[0].item = { id: 2, kind: 'fries', placed: [], building: false };
    s.drainEvents();
    s.serve(0, s.customers[0].id);
    const up = s.drainEvents().find((e) => e.type === 'levelUp');
    expect(up).toMatchObject({ type: 'levelUp', level: 2, unlocks: ['Burger'] });
    expect(s.level).toBe(2);
  });
  it('makes the first level reachable with a handful of serves, not dozens', () => {
    const perServe = defaultConfig.recipes.items.fries.xp + defaultConfig.xp.speedBonusXp;
    const serves = Math.ceil(xpForLevel(defaultConfig, 1) / perServe);
    expect(serves).toBeGreaterThanOrEqual(3);
    expect(serves).toBeLessThanOrEqual(6);
  });
});

describe('tutorial hint', () => {
  it('points at the fries bin first, waits while cooking, then at the vat, then drag', () => {
    const s = new KitchenState(undefined, undefined, 2);
    s.update(1.2);
    expect(nextHint(s)).toEqual({ kind: 'fries_bin' });
    s.startFry();
    run(s, 2);
    expect(nextHint(s)).toBeNull();
    run(s, 3.3);
    expect(nextHint(s)).toEqual({ kind: 'vat', vat: 0 });
    s.tapFryer(0);
    expect(nextHint(s)).toMatchObject({ kind: 'drag', slot: 4 });
  });
});

describe('nuggets', () => {
  const lv4 = () => new KitchenState({ level: 4, xp: 0, coins: 0 }, undefined, 4);
  it('is locked below Lv 4', () => {
    const s = new KitchenState({ level: 3, xp: 0, coins: 0 }, undefined, 4);
    s.startFry('nuggets');
    expect(s.drainEvents()).toEqual([{ type: 'invalid', message: 'Nuggets unlock at Lv 4' }]);
  });
  it('fries in the same vats and lands on a side plate as nuggets', () => {
    const s = lv4();
    s.startFry('fries');
    s.startFry('nuggets');
    expect(s.vats.map((v) => v?.kind)).toEqual(['fries', 'nuggets']);
    run(s, 6.2); // nuggets take 6s, fries 5s
    expect(s.vats[1]?.phase).toBe('ready');
    s.tapFryer(1);
    expect(s.slots[4].item?.kind).toBe('nuggets');
  });
  it('burns after their own window', () => {
    const s = lv4();
    s.startFry('nuggets');
    run(s, 6 + 6 + 0.5);
    expect(s.vats[0]?.phase).toBe('burnt');
  });
});
