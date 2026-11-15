import Phaser from 'phaser';
import type { BackgroundPlacement } from '../kitchen/zones';
import { SaveSystem } from '../systems/SaveSystem';
import { comboLightTier, tacoHaunted } from '../game/taco/tacoExtras';

/**
 * The haunted window of the Taco Truck: additive glows drawn in code over the painted night (positions measured from the final back layer,
 * data/taco.json "haunted"). The Full Moon event makes the moon glow; the combo lights the mansion windows (tier 1 at combo 3, tier 2 at 5,
 * tier 3 at the max combo with a flashing tower), and everything goes dark again when the combo breaks. The glows sit above the back layer (0)
 * and below the customers (10) and the front frame (20), so they only show through the window glass.
 * Reduced motion: the moon glow is static and the tower does not flash.
 */
const DEPTH = 2;
const WARM = 0xffb54a;
const MOON = 0xcfe0ff;

export class TacoHaunted {
  private moon: Phaser.GameObjects.Arc[] = [];
  private lights = new Map<string, Phaser.GameObjects.GameObject[]>();
  private moonOn = false;
  private tier = 0;
  private moonTween?: Phaser.Tweens.Tween;
  private towerTween?: Phaser.Tweens.Tween;

  constructor(private scene: Phaser.Scene, bg: BackgroundPlacement) {
    const m = tacoHaunted.moon;
    const cx = bg.x + m.x * bg.width;
    const cy = bg.y + m.y * bg.height;
    const r = m.radius * bg.width;
    // Three soft rings: a wide faint halo, a tighter one, and a core over the painted disc.
    for (const [k, a] of [[2.3, 0.10], [1.6, 0.16], [1.05, 0.22]] as const) {
      this.moon.push(scene.add.circle(cx, cy, r * k, MOON, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH).setData('a', a));
    }
    for (const w of tacoHaunted.windows) {
      const x = bg.x + w.x * bg.width;
      const y = bg.y + w.y * bg.height;
      const pw = Math.max(5, w.w * bg.width);
      const ph = Math.max(6, w.h * bg.height);
      const halo = scene.add.rectangle(x, y, pw * 2.6, ph * 2.2, WARM, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH).setData('a', 0.22);
      const core = scene.add.rectangle(x, y, pw, ph, WARM, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH).setData('a', 0.75);
      this.lights.set(w.id, [halo, core]);
    }
  }

  /** The Full Moon event started or ended. */
  setMoon(on: boolean): void {
    this.moonOn = on;
    this.moonTween?.remove();
    const reduce = SaveSystem.reduceMotion();
    this.moon.forEach((o) => {
      const a = (o.getData('a') as number) ?? 0.15;
      o.setAlpha(1).setFillStyle(MOON, on ? a : 0);
    });
    if (on && !reduce) this.moonTween = this.scene.tweens.add({ targets: this.moon, alpha: { from: 0.7, to: 1 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  /** The combo changed: light the windows of that combo level, or put them all out when it broke. */
  setCombo(combo: number, maxCombo: number): void {
    const tier = comboLightTier(combo, maxCombo);
    if (tier === this.tier) return;
    const wasMax = this.tier === 3;
    this.tier = tier;
    const reduce = SaveSystem.reduceMotion();
    for (const w of tacoHaunted.windows) {
      const parts = this.lights.get(w.id) as Phaser.GameObjects.Rectangle[];
      const on = w.tier <= tier;
      parts.forEach((p) => {
        this.scene.tweens.killTweensOf(p);
        const a = on ? (p.getData('a') as number) : 0;
        if (reduce || !on) p.setFillStyle(WARM, a);
        else {
          p.setFillStyle(WARM, 0);
          this.scene.tweens.addCounter({ from: 0, to: a, duration: 350, onUpdate: (t) => p.setFillStyle(WARM, t.getValue() ?? a) });
        }
      });
    }
    this.towerTween?.remove();
    this.towerTween = undefined;
    const tower = tacoHaunted.windows.find((w) => w.tower);
    if (tower && tier === 3 && !reduce) {
      const parts = this.lights.get(tower.id) as Phaser.GameObjects.Rectangle[];
      this.towerTween = this.scene.tweens.add({ targets: parts, alpha: { from: 1, to: 0.25 }, duration: 260, yoyo: true, repeat: -1 });
    } else if (wasMax && tower) (this.lights.get(tower.id) as Phaser.GameObjects.Rectangle[]).forEach((p) => p.setAlpha(1));
  }

  /** For tests and the debug hook. */
  get status(): { tier: number; moon: boolean } {
    return { tier: this.tier, moon: this.moonOn };
  }

  destroy(): void {
    this.moonTween?.remove();
    this.towerTween?.remove();
    this.moon.forEach((o) => o.destroy());
    this.lights.forEach((l) => l.forEach((o) => o.destroy()));
    this.lights.clear();
  }
}
