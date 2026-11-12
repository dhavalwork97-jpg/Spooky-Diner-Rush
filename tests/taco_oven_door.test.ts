import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { doorFrame, OVEN_DOOR_BOX, ovenDoorTarget, type OvenDoorClips } from '../src/views/TacoOvenDoor';
import { defaultTacoConfig } from '../src/game/taco/tacoConfig';

const dir = 'public/assets/taco/animations/';
const meta = JSON.parse(readFileSync(`${dir}oven_door_sheet.anim.json`, 'utf8')) as {
  key: string; frameWidth: number; frameHeight: number; columns: number; rows: number; frameCount: number; clips: OvenDoorClips; clipFps: { close: number; open: number };
};

describe('Taco oven door sheet', () => {
  it('has the four named clips with valid frame numbers', () => {
    expect(Object.keys(meta.clips).sort()).toEqual(['close', 'closed-idle', 'open', 'open-hold']);
    for (const list of Object.values(meta.clips)) {
      expect(list.length).toBeGreaterThan(0);
      for (const f of list) expect(f >= 0 && f < meta.frameCount && f < meta.columns * meta.rows).toBe(true);
    }
    expect(meta.frameWidth).toBe(258);
    expect(meta.frameHeight).toBe(242);
  });
  it('clips do not share frames', () => {
    const all = Object.values(meta.clips).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('ovenDoorTarget', () => {
  it('is open with no food, closed while everything is cooking, open once anything is done', () => {
    expect(ovenDoorTarget([null, null])).toBe('open');
    expect(ovenDoorTarget([{ phase: 'cooking' }, null])).toBe('closed');
    expect(ovenDoorTarget([{ phase: 'cooking' }, { phase: 'cooking' }])).toBe('closed');
    expect(ovenDoorTarget([{ phase: 'cooking' }, { phase: 'ready' }])).toBe('open');
    for (const phase of ['ready', 'warning', 'danger', 'burnt'] as const) expect(ovenDoorTarget([{ phase }, null])).toBe('open');
  });
});

describe('doorFrame', () => {
  it('plays close then holds closed-idle; plays open then holds open-hold', () => {
    const c = meta.clips;
    expect(doorFrame(c, 'closing', 0, meta.clipFps.close, meta.clipFps.open).frame).toBe(c.close[0]);
    expect(doorFrame(c, 'closing', 99999, meta.clipFps.close, meta.clipFps.open)).toEqual({ frame: c.close[c.close.length - 1], progress: 1 });
    expect(doorFrame(c, 'closed', 5, 14, 14).frame).toBe(c['closed-idle'][0]);
    expect(doorFrame(c, 'opening', 0, 14, 14).frame).toBe(c.open[0]);
    expect(doorFrame(c, 'opening', 99999, 14, 14).progress).toBe(1);
    expect(doorFrame(c, 'open', 5, 14, 14).frame).toBe(c['open-hold'][0]);
  });
});

describe('oven placement on the kitchen art', () => {
  const art = defaultTacoConfig.art;
  const heightFrac = (OVEN_DOOR_BOX.w * art.width * 242) / 258 / art.height;
  const painted = { left: 1038 / art.width, right: 1483 / art.width, top: 1041 / art.height, bottom: 1454 / art.height }; // measured casing of the painted oven
  const ovenZones = defaultTacoConfig.zones.filter((z) => z.action === 'oven');

  it('the door sits inside the picture and covers the painted oven casing (it used to run past the bottom edge)', () => {
    expect(OVEN_DOOR_BOX.y + heightFrac).toBeLessThan(0.97);
    expect(OVEN_DOOR_BOX.x).toBeLessThanOrEqual(painted.left);
    expect(OVEN_DOOR_BOX.x + OVEN_DOOR_BOX.w).toBeGreaterThanOrEqual(painted.right);
    expect(OVEN_DOOR_BOX.y).toBeLessThanOrEqual(painted.top);
    expect(OVEN_DOOR_BOX.y + heightFrac).toBeGreaterThanOrEqual(painted.bottom);
  });
  it('both oven tap zones lie on the tray of the open door', () => {
    expect(ovenZones.map((z) => z.index).sort()).toEqual([0, 1]);
    const tray = { x0: OVEN_DOOR_BOX.x + (OVEN_DOOR_BOX.w * 45) / 258, x1: OVEN_DOOR_BOX.x + (OVEN_DOOR_BOX.w * 220) / 258, y0: OVEN_DOOR_BOX.y + (heightFrac * 71) / 242, y1: OVEN_DOOR_BOX.y + (heightFrac * 138) / 242 };
    for (const z of ovenZones) {
      expect(z.x).toBeGreaterThanOrEqual(tray.x0 - 0.005);
      expect(z.x + z.width).toBeLessThanOrEqual(tray.x1 + 0.005);
      expect(z.y).toBeGreaterThanOrEqual(tray.y0 - 0.01);
      expect(z.y + z.height).toBeLessThanOrEqual(tray.y1 + 0.01);
    }
  });
  it('no other tap zone overlaps an oven zone, and the zones do not overlap each other', () => {
    const hit = (a: (typeof ovenZones)[0], b: (typeof ovenZones)[0]) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    for (const z of ovenZones) for (const o of defaultTacoConfig.zones) if (o !== z) expect(hit(z, o), `${z.id} vs ${o.id}`).toBe(false);
  });
});
