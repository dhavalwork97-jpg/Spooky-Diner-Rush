import { describe, expect, it } from 'vitest';

const game = import.meta.glob('../src/scenes/GameScene.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const scares = import.meta.glob('../public/assets/customers/ghosts/scare/*.anim.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('no stray outlines', () => {
  it('tapping a station draws no box around the zone (only the sound and the label)', () => {
    const src = game['../src/scenes/GameScene.ts'];
    const start = src.indexOf('private selectZone(');
    const body = src.slice(start, src.indexOf('// ---', start));
    expect(body).not.toMatch(/strokeRoundedRect|strokeRect|lineStyle|fillRoundedRect/);
    expect(src).not.toContain('this.highlight');
  });

  it('every ghost scare sheet has its frame edges feathered (tools/feather_scare_edges.py), so no rectangle shows around the ghost', () => {
    const files = Object.entries(scares);
    expect(files.length).toBe(6);
    for (const [name, text] of files) {
      const meta = JSON.parse(text) as { edgeFeather?: { narrow: number[]; wide: number[] } };
      expect(meta.edgeFeather, name).toBeDefined();
      expect(meta.edgeFeather?.wide[0]).toBeGreaterThan(meta.edgeFeather?.narrow[0] ?? 0);
    }
  });
});
