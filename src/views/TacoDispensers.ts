import type Phaser from 'phaser';
import type { BackgroundPlacement } from '../kitchen/zones';
import type { TacoKitchenState } from '../game/taco/TacoKitchenState';

/**
 * The two cold-drink dispensers, drawn from the supplied Gemini pour clips (sheets built by tools/make_dispenser_sheets.py).
 *
 * The clips pour all three cups together, but the game fills its three lanes on their own (each tap starts the next free lane and
 * each full cup is served on its own). So the machine is drawn as: the empty machine once (the base), and for every lane that holds a cup
 * one copy of the SAME sheet, cropped to that lane's column, showing the frame that matches that lane's own fill progress.
 * Progress is the model's `t / fillSeconds`, not a clock, so a cup is full exactly when the model says it is ready. Nothing here changes
 * what the model does; an empty lane shows the empty cups of the base, and a lane whose cup was served goes back to empty.
 */
export interface DispenserMeta {
  key: string;
  base: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  frameCount: number;
  fullFrame: { width: number; height: number };
  bandTop: number;
  lanes: [number, number][];
}

/** Which machine pours which drink, and where it stands: bottom-centre and height as fractions of the kitchen picture (sized to cover the painted machine it replaces), and `z`, which machine is in front (the round one stands in front of the taco one, as the painted ones did). */
export const DISPENSER_ART: Record<string, { machine: string; cx: number; bottom: number; height: number; z: number }> = {
  horchata: { machine: 'round_dispenser', cx: 0.0723, bottom: 0.957, height: 0.472, z: 0.5 },
  agua_de_jamaica: { machine: 'taco_dispenser', cx: 0.1198, bottom: 0.527, height: 0.375, z: 0 },
};
export const dispenserBaseKey = (machine: string): string => `tacobase_${machine}`;

const DEPTH = 21; // just above the kitchen front layer (20, which has the old painted machines), below the food and everything that moves (25)
const smooth = (x: number): number => x * x * (3 - 2 * x);

/** Frame to show for a fill progress 0..1 on a sheet of `n` frames: the frame below, the frame above, and how far toward the upper one. */
export function pourFrame(progress: number, n: number): { lo: number; hi: number; mix: number } {
  const u = Math.min(1, Math.max(0, progress)) * (n - 1);
  const lo = Math.min(n - 1, Math.floor(u));
  const hi = Math.min(n - 1, lo + 1);
  return { lo, hi, mix: lo === hi ? 0 : u - lo };
}

interface Lane {
  cur: Phaser.GameObjects.Image;
  over: Phaser.GameObjects.Image;
}
interface Machine {
  base: Phaser.GameObjects.Image;
  lanes: Lane[];
  meta: DispenserMeta;
}

export class TacoDispensers {
  private machines = new Map<string, Machine>();

  constructor(scene: Phaser.Scene, bg: BackgroundPlacement, metas: DispenserMeta[]) {
    for (const [drink, art] of Object.entries(DISPENSER_ART)) {
      const meta = metas.find((m) => m.key === art.machine);
      const sheet = `tacosheet_${art.machine}`;
      if (!meta || !scene.textures.exists(sheet) || !scene.textures.exists(dispenserBaseKey(art.machine))) continue;
      const scale = (art.height * bg.height) / meta.fullFrame.height;
      const left = bg.x + art.cx * bg.width - (meta.fullFrame.width * scale) / 2;
      const top = bg.y + art.bottom * bg.height - meta.fullFrame.height * scale;
      const base = scene.add.image(left, top, dispenserBaseKey(art.machine)).setOrigin(0, 0).setScale(scale).setDepth(DEPTH + art.z);
      const lanes = meta.lanes.map(([x0, x1], i) => {
        const mk = (d: number): Phaser.GameObjects.Image =>
          scene.add.image(left, top + meta.bandTop * scale, sheet, 0).setOrigin(0, 0).setScale(scale).setDepth(DEPTH + art.z + d + i * 0.001).setCrop(x0, 0, x1 - x0, meta.frameHeight).setVisible(false);
        return { cur: mk(0.1), over: mk(0.2) };
      });
      this.machines.set(drink, { base, lanes, meta });
    }
  }

  /** True when this drink's machine is drawn from the pour art (otherwise the painted machine and the plain cups stay as they were). */
  has(drink: string): boolean {
    return this.machines.has(drink);
  }

  sync(s: TacoKitchenState): void {
    for (const drink of s.taco.drinks) {
      const m = this.machines.get(drink.id);
      if (!m) continue;
      s.pours[drink.id]?.forEach((p, i) => {
        const lane = m.lanes[i];
        if (!lane) return;
        if (!p) return void (lane.cur.setVisible(false), lane.over.setVisible(false));
        const f = pourFrame(p.phase === 'cooking' ? p.t / drink.fillSeconds : 1, m.meta.frameCount);
        if (String(lane.cur.frame.name) !== String(f.lo)) lane.cur.setFrame(f.lo);
        lane.cur.setVisible(true);
        if (f.mix > 0) {
          if (String(lane.over.frame.name) !== String(f.hi)) lane.over.setFrame(f.hi);
          lane.over.setVisible(true).setAlpha(smooth(f.mix));
        } else lane.over.setVisible(false);
      });
    }
  }

  destroy(): void {
    this.machines.forEach((m) => {
      m.base.destroy();
      m.lanes.forEach((l) => (l.cur.destroy(), l.over.destroy()));
    });
    this.machines.clear();
  }
}
