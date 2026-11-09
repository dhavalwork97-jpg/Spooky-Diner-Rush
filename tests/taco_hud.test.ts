import { describe, expect, it } from 'vitest';
import { fitBackground, normToLogical } from '../src/kitchen/zones';
import { defaultTacoConfig as taco } from '../src/game/taco/tacoConfig';
import { MENU_BUTTON_RECTS } from '../src/views/MenuButtons';
import { MuteButton } from '../src/views/MuteButton';

type R = { x: number; y: number; width: number; height: number };
const overlap = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('Taco Truck uses the shared HUD without covering its tap zones', () => {
  const bg = fitBackground(1280, 698, taco.art.width, taco.art.height);
  const buttons = [...MENU_BUTTON_RECTS, MuteButton.rect()];
  it('menu and music buttons overlap no tap zone', () => {
    for (const z of taco.zones) {
      const rect = normToLogical(z as never, bg);
      buttons.forEach((b, i) => expect(overlap(b, rect), `button ${i} overlaps zone ${z.id}`).toBe(false));
    }
  });
  it('menu and music buttons overlap no customer seat or the serve drop area', () => {
    const w = taco.customerWindow;
    const drop = normToLogical(w.dropZone as never, bg);
    buttons.forEach((b, i) => expect(overlap(b, drop), `button ${i} overlaps the drop area`).toBe(false));
  });
});
