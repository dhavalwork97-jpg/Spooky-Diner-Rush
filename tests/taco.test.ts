import { describe, expect, it } from 'vitest';
import hotspots from '../tools/taco_source/taco_fiesta_hotspots.json';
import { defaultTacoConfig, buildView, candidateDishes, finishedDish, nextStepIds, stepKind } from '../src/game/taco/tacoConfig';
import { TacoKitchenState } from '../src/game/taco/TacoKitchenState';
import { defaultConfig } from '../src/game/config';
import { buildDish, invalids, quiet, run, tacoAt } from './helpers/tacoBuild';

const cfg = defaultTacoConfig;
const sheets = import.meta.glob('../public/assets/taco/animations/*.anim.json', { eager: true, import: 'default' }) as Record<string, { frameCount: number }>;
const sprites = Object.keys(import.meta.glob('../public/assets/taco/sprites/*.webp'));
const hotspotIds = new Set((hotspots as { hotspots: { id: string }[] }).hotspots.map((h) => h.id));

describe('taco data', () => {
  it('has the 16 dishes and 2 drinks, with unique ids', () => {
    expect(cfg.dishes).toHaveLength(16);
    expect(new Set(cfg.dishes.map((d) => d.id)).size).toBe(16);
    expect(cfg.drinks.map((d) => d.id)).toEqual(['horchata', 'agua_de_jamaica']);
    for (const kind of ['soft_taco', 'crispy_taco', 'burrito', 'nachos'] as const) expect(cfg.dishes.filter((d) => d.kind === kind)).toHaveLength(4);
  });
  it('unlocks in order, soft tacos first, and the first dish opens with the restaurant', () => {
    const first = Math.min(...cfg.dishes.map((d) => d.unlockStep));
    expect(first).toBe(1);
    const lvl = (kind: string) => cfg.dishes.filter((d) => d.kind === kind).map((d) => d.unlockStep);
    expect(Math.max(...lvl('soft_taco'))).toBeLessThan(Math.min(...lvl('crispy_taco')) + 1);
    expect(Math.max(...lvl('crispy_taco'))).toBeLessThan(Math.min(...lvl('burrito')));
    expect(Math.max(...lvl('burrito'))).toBeLessThan(Math.min(...lvl('nachos')));
  });
  it('the owner numbers: Lv 15 and 2,000 coins', () => {
    expect(cfg.restaurant.unlockLevel).toBe(15);
    expect(cfg.restaurant.cost).toBe(2000);
  });
  it('no dish is the start of another (a finished plate is never ambiguous)', () => {
    for (const a of cfg.dishes) for (const b of cfg.dishes) if (a !== b) expect(b.steps.slice(0, a.steps.length)).not.toEqual(a.steps);
  });
  it('every tap step is a real hotspot of the kitchen art and has a label', () => {
    for (const d of cfg.dishes)
      d.steps.forEach((s, i) => {
        const k = stepKind(s, i);
        if (k === 'base' || k === 'ingredient') expect(hotspotIds.has(s), `${d.id}: ${s}`).toBe(true);
        expect(cfg.stepLabels[s], `${d.id}: label for ${s}`).toBeTruthy();
      });
  });
  it('sprites, sheets and frame lists match the imported art', () => {
    for (const d of cfg.dishes) {
      expect(sprites.some((f) => f.endsWith(`/${d.sprite}.webp`)), `${d.id} sprite ${d.sprite}`).toBe(true);
      if (!d.sheet) {
        expect(d.frames).toBeNull();
        continue;
      }
      const meta = sheets[`../public/assets/taco/animations/${d.sheet}_sheet.anim.json`];
      expect(meta, `${d.id} sheet ${d.sheet}`).toBeTruthy();
      expect(d.frames).toHaveLength(d.steps.length);
      for (const f of d.frames!) expect(f).toBeLessThan(meta.frameCount);
      expect(d.frames![d.frames!.length - 1]).toBe(meta.frameCount - 1); // the last step shows the finished frame
    }
    for (const dr of cfg.drinks) expect(hotspotIds.has(dr.dispenser)).toBe(true);
  });
});

describe('dish matching', () => {
  it('a flour tortilla can still become any soft taco or burrito; the next step narrows it', () => {
    const t = ['tortilla_flour_tortillas'];
    expect(candidateDishes(cfg, 10, t)).toHaveLength(8);
    expect(candidateDishes(cfg, 10, [...t, 'steam_white_rice']).every((d) => d.kind === 'burrito')).toBe(true);
    expect(candidateDishes(cfg, 10, [...t, 'protein:fish'])).toHaveLength(1);
    expect(nextStepIds(cfg, 10, t).sort()).toEqual(['protein:chicken', 'protein:fish', 'protein:shrimp', 'protein:veggies', 'steam_white_rice'].sort());
  });
  it('locked dishes are not candidates', () => {
    expect(candidateDishes(cfg, 2, ['tortilla_flour_tortillas']).map((d) => d.id)).toEqual(['chicken_soft_taco', 'veggies_soft_taco']);
    expect(finishedDish(cfg, 2, cfg.dishes.find((d) => d.id === 'fish_soft_taco')!.steps)).toBeUndefined();
  });
  it('buildView gives the sheet frame for the steps placed (frame k-1 after step k)', () => {
    const steps = cfg.dishes.find((d) => d.id === 'shrimp_soft_taco')!.steps;
    expect(buildView(cfg, 3, steps.slice(0, 1))).toMatchObject({ frame: 0, dish: null });
    expect(buildView(cfg, 3, steps.slice(0, 2))).toMatchObject({ frame: 1, dish: 'shrimp_soft_taco', sheet: 'taco_soft_shrimp_build' });
    expect(buildView(cfg, 3, steps)).toMatchObject({ frame: 3 });
    expect(buildView(cfg, 10, ['crispy_shell'])).toMatchObject({ sheet: null, frame: null });
  });
});

describe('building every dish with the real taps', () => {
  it.each(cfg.dishes.map((d) => [d.id, d.unlockStep] as const))('%s is buildable and ends on a plate as itself', (id, level) => {
    const s = quiet(tacoAt(10));
    const plate = buildDish(s, id);
    expect(plate).toBeGreaterThanOrEqual(0);
    expect(s.plates[plate].item).toMatchObject({ dish: id, building: false });
    expect(s.pans.every((p) => p === null)).toBe(true);
    expect(s.ovens.every((o) => o === null)).toBe(true);
  });
});

describe('assembly rules', () => {
  it('a wrong ingredient is refused with a hint and changes nothing', () => {
    const s = quiet(tacoAt(10));
    s.tapIngredient('tortilla_flour_tortillas');
    s.drainEvents();
    s.tapIngredient('topping_crema');
    expect(invalids(s)[0]).toMatch(/^Add .* first$/);
    expect(s.plates[0].item?.placed).toEqual(['tortilla_flour_tortillas']);
  });
  it('an ingredient before any plate says to start a dish', () => {
    const s = quiet(tacoAt(2));
    s.tapIngredient('topping_lettuce');
    expect(invalids(s)[0]).toMatch(/Start a dish/);
  });
  it('an ingredient goes on the oldest plate that wants it', () => {
    const s = quiet(tacoAt(10));
    s.tapIngredient('tortilla_flour_tortillas'); // plate 0: could be taco or burrito
    s.tapIngredient('tortilla_corn_tortillas'); // plate 1: chips
    s.tapIngredient('cooler_cheese'); // only the chips want cheese next
    expect(s.plates[0].item!.placed).toEqual(['tortilla_flour_tortillas']);
    expect(s.plates[1].item!.placed).toEqual(['tortilla_corn_tortillas', 'cooler_cheese']);
  });
  it('only four plates: a fifth tortilla is refused', () => {
    const s = quiet(tacoAt(10));
    for (let i = 0; i < s.plates.length; i++) s.tapIngredient('tortilla_flour_tortillas');
    s.drainEvents();
    s.tapIngredient('tortilla_flour_tortillas');
    expect(invalids(s)[0]).toBe('No free plate');
  });
  it('a ready protein with no dish waiting stays in the pan and says why', () => {
    const s = quiet(tacoAt(2));
    s.startProtein('chicken');
    run(s, 8.2);
    s.drainEvents();
    s.tapPan(0);
    expect(invalids(s)[0]).toMatch(/Start a dish/);
    expect(s.pans[0]).not.toBeNull();
  });
  it('trash: an unfinished plate is free, a finished dish costs the coin penalty', () => {
    const s = quiet(tacoAt(2));
    s.coins = 50;
    s.tapIngredient('tortilla_flour_tortillas');
    s.tapTrash();
    expect(s.coins).toBe(50);
    expect(s.plates[0].item).toBeNull();
    const plate = buildDish(s, 'chicken_soft_taco');
    s.tapTrash(plate);
    expect(s.coins).toBe(50 - defaultConfig.recipes.settings.trashPenaltyCoins);
  });
  it('wrap, press and melt need the right moment: tapping a plate with an ingredient step due gives a hint', () => {
    const s = quiet(tacoAt(10));
    s.tapIngredient('tortilla_flour_tortillas');
    s.drainEvents();
    s.tapPlate(0);
    expect(invalids(s)[0]).toMatch(/^Add /);
  });
  it('pressing and melting need a free pan or oven slot', () => {
    const s = quiet(tacoAt(10));
    for (const st of ['tortilla_flour_tortillas', 'steam_white_rice', 'steam_beans', 'cooler_cheese']) s.tapIngredient(st);
    s.startProtein('chicken');
    run(s, 8.2);
    s.tapPan(0);
    s.tapPlate(0); // wrap
    s.pans.fill({ t: 0, phase: 'cooking', what: { kind: 'protein', protein: 'chicken' } });
    s.drainEvents();
    s.tapPlate(0); // press needs a pan
    expect(invalids(s)[0]).toBe('All the pans are busy');
    expect(s.plates[0].item).not.toBeNull();
  });
  it('a pressed burrito comes back to a plate, and needs a free one', () => {
    const s = quiet(tacoAt(10));
    for (const st of ['tortilla_flour_tortillas', 'steam_white_rice', 'steam_beans', 'cooler_cheese']) s.tapIngredient(st);
    s.startProtein('chicken');
    run(s, 8.2);
    s.tapPan(0);
    s.tapPlate(0); // wrap
    s.tapPlate(0); // press: the plate empties
    expect(s.plates[0].item).toBeNull();
    for (let i = 0; i < s.plates.length; i++) s.tapIngredient('tortilla_flour_tortillas'); // fill every plate
    run(s, 4.2);
    s.drainEvents();
    const pressPan = s.pans.findIndex((p) => p?.what.kind === 'press');
    s.tapPan(pressPan);
    expect(invalids(s)[0]).toMatch(/plates are full/);
  });
});

describe('cooking and burning', () => {
  it('a protein is ready after its time, warns, and burns after its window (veggies: 4 s, then 5 s)', () => {
    const s = quiet(tacoAt(2));
    s.startProtein('veggies');
    run(s, 3.9);
    expect(s.pans[0]?.phase).toBe('cooking');
    run(s, 0.3);
    expect(s.pans[0]?.phase).toBe('ready');
    run(s, 2.6);
    expect(s.pans[0]?.phase).toBe('warning');
    run(s, 1.4);
    expect(s.pans[0]?.phase).toBe('danger');
    run(s, 1.0);
    expect(s.pans[0]?.phase).toBe('burnt');
  });
  it('burning costs reputation once; tapping the burnt pan throws it away for the coin penalty', () => {
    const s = quiet(tacoAt(2));
    s.coins = 10;
    s.startProtein('veggies');
    run(s, 10);
    expect(s.reputation).toBe(100 - defaultConfig.recipes.settings.burnReputationPenalty);
    run(s, 20);
    expect(s.reputation).toBe(100 - defaultConfig.recipes.settings.burnReputationPenalty);
    s.tapPan(0);
    expect(s.pans[0]).toBeNull();
    expect(s.coins).toBe(10 - defaultConfig.recipes.settings.trashPenaltyCoins);
  });
  it('a burnt shell and burnt nachos in the oven are thrown away; a melting dish that burns is lost', () => {
    const s = quiet(tacoAt(10));
    s.tapOven(0);
    run(s, 20);
    expect(s.ovens[0]?.phase).toBe('burnt');
    s.tapOven(0);
    expect(s.ovens[0]).toBeNull();
    s.tapIngredient('tortilla_corn_tortillas');
    s.tapIngredient('cooler_cheese');
    s.tapPlate(0);
    expect(s.ovens[0]?.what.kind).toBe('melt');
    run(s, 20);
    s.tapOven(0);
    expect(s.ovens[0]).toBeNull();
    expect(s.plates[0].item).toBeNull();
  });
  it('a speed upgrade shortens cooking but not the real time between ready and burnt', () => {
    const slow = quiet(tacoAt(2));
    const fast = quiet(tacoAt(2));
    fast.mods.grillSpeed = 1.5;
    for (const s of [slow, fast]) s.startProtein('chicken');
    const readyAt = (s: TacoKitchenState) => {
      let t = 0;
      while (s.pans[0]!.phase === 'cooking') (s.update(0.05), (t += 0.05));
      return t;
    };
    const burntAt = (s: TacoKitchenState) => {
      let t = 0;
      while (s.pans[0]!.phase !== 'burnt') (s.update(0.05), (t += 0.05));
      return t;
    };
    expect(readyAt(fast)).toBeLessThan(readyAt(slow) - 2);
    expect(Math.abs(burntAt(fast) - burntAt(slow))).toBeLessThan(0.2);
  });
  it('Burn Guard lengthens the window and Calm Kitchen softens the penalty, as in the diner', () => {
    const a = quiet(tacoAt(2));
    const b = quiet(tacoAt(2));
    b.mods.burnWindow = 1.45;
    b.mods.calm = 2;
    for (const s of [a, b]) {
      s.startProtein('veggies');
      run(s, 9.5);
    }
    expect(a.pans[0]?.phase).toBe('burnt');
    expect(b.pans[0]?.phase).not.toBe('burnt');
    run(b, 5);
    expect(b.reputation).toBe(100 - Math.round(defaultConfig.recipes.settings.burnReputationPenalty / 2));
  });
  it('the Slow oven event slows the whole bake', () => {
    const s = quiet(tacoAt(10));
    s.startEvent({ id: 'x', name: 'Slow', minLevel: 1, duration: 100, ovenSpeed: 0.5 });
    s.tapOven(0);
    run(s, 8.2);
    expect(s.ovens[0]?.phase).toBe('cooking'); // 7 s shell at half speed needs 14 s
    run(s, 7);
    expect(s.ovens[0]?.phase).not.toBe('cooking');
  });
});

describe('menu gates', () => {
  it('shrimp, fish and crispy shells wait until they are on the menu, and the message never shows a number', () => {
    const s = quiet(tacoAt(2));
    s.startProtein('shrimp');
    expect(invalids(s)[0]).toMatch(/not on the menu yet/);
    s.tapOven(0);
    expect(invalids(s)[0]).toMatch(/not on the menu yet/);
    expect(invalids(s).join(' ')).not.toMatch(/Lv|step|rank/i);
    expect(s.pans.every((p) => p === null) && s.ovens.every((o) => o === null)).toBe(true);
  });
  it('the menu step follows the truck, not the global Lv: a Lv 40 player starts at the first dishes', () => {
    const s = new TacoKitchenState({ level: 40, xp: 0, coins: 0, menuStep: 1 });
    expect(s.dishes.map((d) => d.id)).toEqual(['veggies_soft_taco']);
    expect(s.drinks.map((d) => d.id)).toEqual(['horchata']);
    expect(s.levelInfo.maxCustomers).toBe(3);
    expect(s.levelInfo.orderSize).toEqual([1, 2]);
  });
});

describe('customers and serving', () => {
  it('orders only contain unlocked dishes and drinks, at most 3 items, and at most 5 seats are used', () => {
    for (const level of [15, 17, 22, 30]) {
      const s = tacoAt(level, level);
      for (let i = 0; i < 40; i++) {
        s.spawnCustomer();
        const c = s.customers[s.customers.length - 1];
        expect(c.items.length).toBeLessThanOrEqual(3);
        const ok = new Set([...s.dishes.map((d) => d.id), ...s.drinks.map((d) => d.id)]);
        for (const it of c.items) expect(ok.has(it)).toBe(true);
        if (s.customers.length >= 5) s.customers = [];
      }
      const run1 = tacoAt(level, 99);
      const run2 = tacoAt(level, 99);
      for (let i = 0; i < 6; i++) (run1.update(2), run2.update(2));
      expect(run1.customers.map((c) => c.items)).toEqual(run2.customers.map((c) => c.items));
    }
  });
  it('serving the dish a customer ordered pays coins and XP, frees the plate and counts towards the shared Lv', () => {
    const s = quiet(tacoAt(2));
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['chicken_soft_taco'];
    c.delivered = [false];
    c.price = 34;
    const plate = buildDish(s, 'chicken_soft_taco');
    s.drainEvents();
    expect(s.serve(plate, c.id)).toBe(true);
    expect(s.plates[plate].item).toBeNull();
    expect(c.mood).toBe('happy');
    expect(s.coins).toBeGreaterThanOrEqual(34);
    expect(s.xp).toBeGreaterThanOrEqual(40);
    expect(s.served).toBe(1);
  });
  it('a wrong dish snaps back and costs only a little patience', () => {
    const s = quiet(tacoAt(3));
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['shrimp_soft_taco'];
    c.delivered = [false];
    const plate = buildDish(s, 'chicken_soft_taco');
    const before = c.patience;
    expect(s.serve(plate, c.id)).toBe(false);
    expect(s.plates[plate].item).not.toBeNull();
    expect(c.patience).toBeLessThan(before);
    expect(s.coins).toBe(0);
    expect(s.reputation).toBe(100);
  });
  it('a plate still being built cannot be served', () => {
    const s = quiet(tacoAt(2));
    s.spawnCustomer();
    s.customers[0].items = ['chicken_soft_taco'];
    s.customers[0].delivered = [false];
    s.tapIngredient('tortilla_flour_tortillas');
    expect(s.serve(0, s.customers[0].id)).toBe(false);
  });
  it('an angry departure costs the diner reputation (15) and closing works like the diner', () => {
    const s = quiet(tacoAt(2));
    s.spawnCustomer();
    run(s, s.customers[0].patienceMax + 2);
    expect(s.reputation).toBeLessThan(100);
    s.reputation = 1;
    s.spawnCustomer();
    run(s, 200);
    expect(s.closed).toBe(true);
    s.reopen();
    expect(s.reputation).toBe(defaultConfig.xp.reputation.reopenTo);
    expect(s.customers).toHaveLength(0);
    s.closed = true;
    s.reopen(true);
    expect(s.reputation).toBe(100);
  });
  it('XP from serving can level the player up and pays level-up coins (shared rules)', () => {
    const s = quiet(tacoAt(2));
    s.xp = s.xpNeeded - 5;
    s.spawnCustomer();
    s.customers[0].items = ['chicken_soft_taco'];
    s.customers[0].delivered = [false];
    const plate = buildDish(s, 'chicken_soft_taco');
    s.drainEvents();
    s.serve(plate, s.customers[0].id);
    expect(s.level).toBe(16);
    expect(s.drainEvents().some((e) => e.type === 'levelUp')).toBe(true);
  });
});

describe('drinks', () => {
  it('each dispenser has 3 lanes; a full cup waits and is served from its lane', () => {
    const s = quiet(tacoAt(2));
    for (let i = 0; i < 3; i++) s.tapDrinks('horchata');
    expect(s.pours.horchata.filter(Boolean)).toHaveLength(3);
    s.tapDrinks('horchata');
    expect(invalids(s)[0]).toMatch(/still filling/);
    s.tapDrinks('agua_de_jamaica'); // the other dispenser is independent
    expect(s.pours.agua_de_jamaica[0]).not.toBeNull();
    run(s, 5.1);
    run(s, 300); // a full cup never spoils
    expect(s.pourReady('horchata', 0)).toBe(true);
    s.tapDrinks('horchata');
    expect(invalids(s)[0]).toMatch(/Drag the full Horchata/);
    s.spawnCustomer();
    const c = s.customers[0];
    c.items = ['horchata'];
    c.delivered = [false];
    expect(s.serveFromPour('agua_de_jamaica', 0, c.id)).toBe(false); // the wrong drink
    expect(s.serveFromPour('horchata', 1, c.id)).toBe(true);
    expect(s.pours.horchata[1]).toBeNull();
    expect(s.plates.every((p) => !p.item)).toBe(true); // drinks never use a plate
  });
});

describe('reopen', () => {
  it('clears pans, ovens, plates, cups and customers but keeps Lv, XP and coins', () => {
    const s = quiet(tacoAt(4, 1, 17));
    s.coins = 123;
    s.xp = 40;
    s.startProtein('chicken');
    s.tapOven(0);
    s.tapIngredient('tortilla_flour_tortillas');
    s.tapDrinks('horchata');
    s.closed = true;
    s.reopen();
    expect(s.pans.concat(s.ovens as never).every((x) => x === null)).toBe(true);
    expect(s.plates.every((p) => !p.item)).toBe(true);
    expect(s.pours.horchata.every((p) => p === null)).toBe(true);
    expect([s.level, s.xp, s.coins]).toEqual([17, 40, 123]);
  });
});
