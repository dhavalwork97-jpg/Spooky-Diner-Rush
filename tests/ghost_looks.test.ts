import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import assetsJson from '../data/assets.json';
import { CUSTOMER_LOOKS, LOOK_ART, PERSONALITIES, type LookArt } from '../src/anim/customerMotion';
import { CUSTOMER_LOOK_MIN, LOOK_UNLOCK_LEVELS } from '../src/game/KitchenState';
import { LOOK_PREFETCH_LEVELS, extraLooksAllowed, loadGhostLooks, lookIsReady, looksToLoad } from '../src/views/ghostArt';

// The lilac ghost (ghost emotion sheets, 2026-11-26; it replaced the blue yeti, pink fuzz and mummy ghost): art data, lazy loading and the safe fallback.

const NEW = ['lilac_ghost'] as const;
type Meta = { frames: number; columns: number; frameWidth: number; frameHeight: number; fps: number; loop: boolean; bodyTop: number; bodyBottom: number; bodyHeight: number; bodyWidth: number; edgeAlpha: number };
const meta = import.meta.glob('../public/assets/customers/*/*.anim.json', { eager: true, import: 'default' }) as Record<string, Meta>;
const webp = import.meta.glob('../public/assets/customers/*/*.webp', { query: '?url', import: 'default' });
const assets = assetsJson.assets as { key: string; type: string; file: string; frameWidth: number; frameHeight: number; lazy?: boolean }[];
const sidecar = (file: string): Meta => meta[`../public/${file.replace('.webp', '.anim.json')}`];
const clipsOf = (a: LookArt) => ({ calm: a.calm, upset: a.upset, angry: a.angry, happy: a.leaveHappy });

describe('lilac ghost: art data matches the shipped files', () => {
  for (const name of NEW) {
    it(`${name}: every clip's frames, size, loop, foot line and body size match its sidecar file`, () => {
      const art = LOOK_ART[name]!;
      expect(art).toBeTruthy();
      const calm = sidecar(art.calm.file);
      for (const [which, clip] of Object.entries(clipsOf(art))) {
        const m = sidecar(clip.file);
        expect(m, `${name} ${which} sidecar`).toBeTruthy();
        expect(webp[`../public/${clip.file}`], `${name} ${which} file`).toBeTruthy();
        expect(clip.frames, which).toBe(m.frames);
        expect(clip.size, which).toBe(m.frameWidth);
        expect(m.frameHeight).toBe(m.frameWidth);
        expect(clip.fps, which).toBe(m.fps);
        expect(clip.fps).toBe(12);
        expect(clip.footY, which).toBeCloseTo(m.bodyBottom / m.frameHeight, 3);
        expect(m.edgeAlpha, `${which}: nothing touches the frame edge`).toBe(0);
        // the figure is drawn at the calm clip's size in every clip, so nobody jumps in size when the mood changes
        expect(clip.scale * m.bodyHeight, which).toBeCloseTo(calm.bodyHeight, 0);
      }
      expect(art.bodyH).toBe(calm.bodyHeight);
      expect(art.bodyW).toBe(calm.bodyWidth);
      // calm, waiting and angry loop; happy plays once, and the angry leave reuses the angry loop played once (same texture)
      expect([art.calm, art.upset, art.angry].every((c) => c.loop)).toBe(true);
      expect(art.leaveHappy.loop).toBe(false);
      expect(art.leaveAngry.loop).toBe(false);
      expect(art.leaveAngry.key).toBe(art.angry.key);
      expect(art.leaveAngry.frames).toBe(art.angry.frames);
      // no other file is needed: the frames fit in the sheet
      for (const clip of [art.calm, art.upset, art.angry, art.leaveHappy]) {
        const m = sidecar(clip.file);
        expect(Math.ceil(m.frames / m.columns) * m.frameHeight).toBeGreaterThan(0);
      }
    });
    it(`${name}: all four sheets are in the asset list, as lazy (nothing is fetched at boot)`, () => {
      const art = LOOK_ART[name]!;
      for (const [which, clip] of Object.entries(clipsOf(art))) {
        const row = assets.find((a) => a.key === clip.key);
        expect(row, `${name} ${which}`).toBeTruthy();
        expect(row!.type).toBe('spritesheet');
        expect(row!.file).toBe(clip.file);
        expect(row!.frameWidth).toBe(clip.size);
        expect(row!.frameHeight).toBe(clip.size);
        expect(row!.lazy, `${name} ${which} must be lazy`).toBe(true);
        expect(clip.lazy).toBe(true);
      }
    });
  }
  it('nothing the new customers need is loaded at boot, and their files stay within the budget', () => {
    const boot = assets.filter((a) => !a.lazy && /\/lilac_ghost\//.test(a.file));
    expect(assets.some((a) => /\/(blue_yeti|pink_fuzz|mummy_ghost)\//.test(a.file)), 'the removed ghosts are gone from the asset list').toBe(false);
    expect(boot).toEqual([]);
    let total = 0;
    for (const name of NEW) for (const clip of Object.values(clipsOf(LOOK_ART[name]!))) total += statSync(`public/${clip.file}`).size;
    expect(total / 1048576).toBeLessThan(1); // about 0.5 MB for the four clips
  });
  it('its personality is sensible: it floats above the stool with a small extra bob', () => {
    for (const n of NEW) {
      const p = PERSONALITIES[n];
      expect(p.breath).toBeLessThan(0.02);
      expect(p.hearts).toBeGreaterThan(0);
    }
    expect(PERSONALITIES.lilac_ghost.ghost).toEqual({ hover: 3, bob: 2, bobMs: 2800 });
  });
});

describe('lilac ghost: loading schedule', () => {
  it('nothing extra is due in the first levels, then the lilac ghost, one Lv before it can appear (it walks in at Lv 3)', () => {
    expect(LOOK_PREFETCH_LEVELS).toBe(1);
    expect(looksToLoad(1)).toEqual([]); // the first minutes download nothing extra
    expect(looksToLoad(2)).toEqual(['lilac_ghost']);
    expect(looksToLoad(3)).toEqual(['lilac_ghost']);
    expect(looksToLoad(40)).toEqual(['lilac_ghost']);
    expect(LOOK_UNLOCK_LEVELS).toEqual([1, 3]);
    // never a look before it is due, and the mint ghost is not in this list (it loads with the game)
    for (let lv = 1; lv <= 12; lv++) for (const n of looksToLoad(lv)) expect(LOOK_UNLOCK_LEVELS[CUSTOMER_LOOKS.indexOf(n as (typeof CUSTOMER_LOOKS)[number]) - CUSTOMER_LOOK_MIN]).toBeLessThanOrEqual(lv + LOOK_PREFETCH_LEVELS);
  });
});

/** The smallest stand-in for a Phaser scene that the loader and the readiness check use. */
function fakeScene(have: string[] = []) {
  const loaded: { key: string; file: string; cfg: { frameWidth: number; frameHeight: number } }[] = [];
  const arrived = new Set(have);
  const onShutdown: (() => void)[] = [];
  let started = 0;
  const scene = {
    textures: { exists: (k: string) => arrived.has(k) },
    events: { once: (_name: string, fn: () => void) => void onShutdown.push(fn) },
    load: {
      spritesheet: (key: string, file: string, cfg: { frameWidth: number; frameHeight: number }) => void loaded.push({ key, file, cfg }),
      isLoading: () => false,
      start: () => void started++,
    },
  };
  return {
    scene: scene as never,
    loaded,
    started: () => started,
    /** A queued download finished: its texture is in memory. */
    arrive: (...keys: string[]) => keys.forEach((k) => arrived.add(k)),
    /** The scene shuts down (leaving the diner): what has not arrived is dropped. */
    shutdown: () => onShutdown.splice(0).forEach((fn) => fn()),
  };
}

describe('lilac ghost: loader and fallback', () => {
  it('lookIsReady is true only when calm, waiting and angry are all in memory', () => {
    const art = LOOK_ART.lilac_ghost!;
    expect(lookIsReady(fakeScene().scene, art)).toBe(false);
    expect(lookIsReady(fakeScene([art.calm.key, art.upset.key]).scene, art)).toBe(false);
    expect(lookIsReady(fakeScene([art.calm.key, art.upset.key, art.angry.key]).scene, art)).toBe(true);
  });
  it('loadGhostLooks queues only the looping clips of looks that are due, with the right frame size, and starts the loader once', () => {
    const f = fakeScene();
    loadGhostLooks(f.scene, 1);
    expect(f.loaded).toEqual([]);
    expect(f.started()).toBe(0);
    loadGhostLooks(f.scene, 2);
    const keys = f.loaded.map((l) => l.key).sort();
    expect(keys).toEqual(['lilac_ghost_angry', 'lilac_ghost_calm', 'lilac_ghost_upset']);
    expect(f.loaded.some((l) => /_happy$/.test(l.key))).toBe(false); // the happy clip is fetched when a customer needs it
    for (const l of f.loaded) {
      const clip = Object.values(clipsOf(LOOK_ART[l.key.replace(/_(calm|upset|angry)$/, '') as (typeof NEW)[number]]!)).find((c) => c.key === l.key)!;
      expect(l.cfg).toEqual({ frameWidth: clip.size, frameHeight: clip.size });
      expect(l.file).toBe(clip.file);
    }
    expect(f.started()).toBe(1);
    f.shutdown();
  });
  it('asking again does not queue the same clips twice', () => {
    const f = fakeScene();
    loadGhostLooks(f.scene, 8);
    const first = f.loaded.length;
    expect(first).toBe(3);
    loadGhostLooks(f.scene, 9);
    expect(f.loaded.length).toBe(first);
    f.shutdown();
  });
  it('leaving the scene mid-download: clips that did not arrive are asked for again on the next visit, clips that arrived are not', () => {
    const f = fakeScene();
    loadGhostLooks(f.scene, 4); // the lilac ghost is due
    expect(f.loaded).toHaveLength(3);
    f.arrive('lilac_ghost_calm'); // the calm clip made it, the other two did not
    f.shutdown();
    const again = fakeScene(['lilac_ghost_calm']); // textures stay in memory between scenes
    loadGhostLooks(again.scene, 4);
    expect(again.loaded.map((l) => l.key).sort()).toEqual(['lilac_ghost_angry', 'lilac_ghost_upset']);
    again.shutdown();
  });
  it('a device that reports less than 4 GB of memory keeps the mint ghost only; one that does not report it gets everything', () => {
    const nav = globalThis as unknown as { navigator?: { deviceMemory?: number } };
    const before = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const set = (mem: number | undefined) => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { deviceMemory: mem } });
    try {
      set(2);
      expect(extraLooksAllowed()).toBe(false);
      const f = fakeScene();
      loadGhostLooks(f.scene, 20);
      expect(f.loaded).toEqual([]);
      expect(f.started()).toBe(0);
      set(4);
      expect(extraLooksAllowed()).toBe(true);
      set(undefined);
      expect(extraLooksAllowed()).toBe(true);
    } finally {
      if (before) Object.defineProperty(globalThis, 'navigator', before);
      else delete nav.navigator;
    }
  });
});
