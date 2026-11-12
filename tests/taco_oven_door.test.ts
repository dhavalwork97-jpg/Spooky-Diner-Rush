import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { doorFrame, ovenDoorTarget, type OvenDoorClips } from '../src/views/TacoOvenDoor';

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
