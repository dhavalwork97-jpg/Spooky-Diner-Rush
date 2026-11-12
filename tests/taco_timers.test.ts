import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const views = readFileSync('src/views/TacoViews.ts', 'utf8');
const ring = readFileSync('src/views/Ring.ts', 'utf8');

describe('Taco cook timers', () => {
  it('Ring keeps hiding a burnt item for other restaurants and only shows burnt when asked', () => {
    expect(ring).toContain("private showBurnt = false");
    expect(ring).toContain("(phase === 'burnt' && !this.showBurnt)");
  });
  it('rings are made only for pan and oven zones, never the griddle', () => {
    expect(views).toContain("this.zones('pan')");
    expect(views).toContain("this.zones('oven')");
    const build = views.slice(views.indexOf('private buildRings'), views.indexOf('private syncRings'));
    expect(build).not.toMatch(/griddle/i);
  });
  it('progress uses the configured readyAfter of the item, with no literal durations', () => {
    const sync = views.slice(views.indexOf('private syncRings'), views.indexOf('sync(): void'));
    expect(sync).toContain('s.taco.proteins[p.what.protein].readyAfter');
    expect(sync).toContain('s.taco.timed.press.readyAfter');
    expect(sync).toContain('s.taco.timed.crispy_shell.readyAfter');
    expect(sync).toContain('s.taco.timed.melt.readyAfter');
    expect(sync).not.toMatch(/readyAfter\s*=\s*\d/);
  });
});
