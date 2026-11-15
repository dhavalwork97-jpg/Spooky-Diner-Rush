import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import assetsJson from '../data/assets.json';

/** Width and height of a WebP file from its header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.toString('latin1', 0, 4)).toBe('RIFF');
  expect(buf.toString('latin1', 8, 12)).toBe('WEBP');
  const kind = buf.toString('latin1', 12, 16);
  if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const b = buf.readUIntLE(21, 4);
    return { width: (b & 0x3fff) + 1, height: ((b >>> 14) & 0x3fff) + 1 };
  }
  return { width: buf.readUIntLE(26, 2) & 0x3fff, height: buf.readUIntLE(28, 2) & 0x3fff };
}

type Row = { key: string; type: string; file: string; width?: number; height?: number; frameWidth?: number; frameHeight?: number; lazy?: boolean };
const rows = (assetsJson as { assets: Row[] }).assets.filter((a) => a.file.startsWith('assets/diner_extras/'));

describe('diner extras art', () => {
  it('has the 23 sprites, all lazy, keys dx_<name>', () => {
    expect(rows).toHaveLength(23);
    for (const r of rows) {
      expect(r.lazy).toBe(true);
      expect(r.key).toMatch(/^dx_[a-z_]+$/);
    }
  });
  it('every file exists and its size matches data/assets.json', () => {
    for (const r of rows) {
      const size = webpSize(`public/${r.file}`);
      if (r.type === 'spritesheet') {
        // Phaser makes only whole frames, so the frame size must divide the sheet into the frames the animation uses.
        const cols = Math.floor(size.width / r.frameWidth!);
        const rowsN = Math.floor(size.height / r.frameHeight!);
        expect(cols * rowsN, `${r.key} frames`).toBe(4);
      } else {
        expect(size, r.key).toEqual({ width: r.width, height: r.height });
      }
    }
  });
  it('the bat sheet really yields its 4 frames (the sheet is 1303 px wide, so the frame is 325)', () => {
    const bat = rows.find((r) => r.key === 'dx_bat_fly')!;
    const size = webpSize(`public/${bat.file}`);
    expect(size.width).toBe(1303);
    expect(Math.floor(size.width / bat.frameWidth!)).toBe(4);
    expect(bat.frameWidth! * 4).toBeLessThanOrEqual(size.width);
  });
  it('the full-resolution masters are NOT shipped in public/', () => {
    for (const r of rows) expect(r.file).not.toContain('masters');
    expect(() => readFileSync('public/assets/diner_extras/masters/cobweb.png')).toThrow();
  });
});
