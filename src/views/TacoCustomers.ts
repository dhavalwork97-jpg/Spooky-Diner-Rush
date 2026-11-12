import Phaser from 'phaser';
import { LEAVE_FADE_MS, LOOK_ART, clipFor, type LookClip } from '../anim/customerMotion';
import type { BackgroundPlacement } from '../kitchen/zones';
import type { TacoCustomer, TacoKitchenState } from '../game/taco/TacoKitchenState';
import { SaveSystem } from '../systems/SaveSystem';
import { pop, shake } from '../anim/helpers';
import { sheetKey, spriteKey } from './TacoViews';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
/** Between the back layer (0) and the front counter layer (20), as the art pack asks. */
const BODY_DEPTH = 10;
const UI_DEPTH = 30;
const ICON = 40;
const CUP_COLUMNS = 5;
const CUP_FULL_COLUMN = 4;
/** The ghost body is drawn about this fraction of the customer band's height. */
const BODY_FRACTION = 0.8;
const art = LOOK_ART.mint_ghost!;
/** Leave clips already asked for, so each is requested once. */
const leaveRequested = new Set<string>();

interface View {
  id: number;
  body: Phaser.GameObjects.Sprite;
  bubble: Phaser.GameObjects.Container;
  bubbleKey: string;
  bar: Phaser.GameObjects.Graphics;
  clip: string;
  x: number;
  bottomY: number;
  leaving: boolean;
  /** Last mood seen, so the right leave clip plays once the model removes the customer. */
  angry: boolean;
}

/** The five seats of the Taco Truck, drawn with the supplied mint ghost. Reads the model; never changes it. */
export class TacoCustomers {
  private views = new Map<number, View>();
  private bodyH: number;

  constructor(private scene: Phaser.Scene, private bg: BackgroundPlacement, private s: TacoKitchenState) {
    const w = s.taco.customerWindow;
    this.bodyH = (w.bandBottom - w.bandTop) * bg.height * BODY_FRACTION;
  }

  sync(): void {
    const seen = new Set<number>();
    for (const c of this.s.customers) {
      seen.add(c.id);
      let v = this.views.get(c.id);
      if (!v) v = this.create(c);
      this.update(v, c);
    }
    for (const v of this.views.values()) if (!seen.has(v.id) && !v.leaving) this.remove(v);
  }

  /** Screen position (top of the head) of a customer, for floating text. */
  headOf(id: number): { x: number; y: number } | null {
    const v = this.views.get(id);
    return v ? { x: v.x, y: v.bottomY - this.bodyH } : null;
  }

  /** Middle of a customer's body, where a dish is dropped and coins start from. */
  centerOf(id: number): { x: number; y: number } | null {
    const v = this.views.get(id);
    return v ? { x: v.x, y: v.bottomY - this.bodyH / 2 } : null;
  }

  /** A short head-shake for a wrong drop. */
  shake(id: number): void {
    const v = this.views.get(id);
    if (v && !v.leaving) shake(this.scene, v.body, `taco_cust_${id}`, 6, 240);
  }

  /** The waiting customer under a screen point, using the window's drop area and the nearest seat. */
  customerAt(px: number, py: number): TacoCustomer | null {
    const d = this.s.taco.customerWindow.dropZone;
    const nx = (px - this.bg.x) / this.bg.width;
    const ny = (py - this.bg.y) / this.bg.height;
    if (nx < d.x || nx > d.x + d.width || ny < d.y || ny > d.y + d.height) return null;
    let best: View | null = null;
    let bestDx = Infinity;
    for (const v of this.views.values()) {
      if (v.leaving) continue;
      const dx = Math.abs(px - v.x);
      if (dx < bestDx) {
        bestDx = dx;
        best = v;
      }
    }
    return best ? (this.s.customers.find((c) => c.id === best!.id) ?? null) : null;
  }

  /** A short happy hop when an order is complete. */
  celebrate(id: number): void {
    const v = this.views.get(id);
    if (!v || SaveSystem.reduceMotion()) return; // the floating +coins text still shows
    this.scene.tweens.add({ targets: v.body, y: v.bottomY - 22, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
  }

  destroy(): void {
    for (const v of this.views.values()) this.kill(v);
    this.views.clear();
  }

  private ensureAnim(clip: LookClip): void {
    const anims = this.scene.anims;
    if (anims.exists(clip.key)) return;
    anims.create({ key: clip.key, frames: anims.generateFrameNumbers(clip.key, { start: 0, end: clip.frames - 1 }), frameRate: clip.fps, repeat: clip.loop ? -1 : 0 });
  }

  private create(c: TacoCustomer): View {
    const slot = this.s.taco.customerWindow.slots[c.seat] ?? this.s.taco.customerWindow.slots[0];
    const x = this.bg.x + slot.x * this.bg.width;
    const bottomY = this.bg.y + slot.bottomY * this.bg.height;
    const calm = art.calm;
    this.ensureAnim(calm);
    const body = this.scene.add.sprite(x, bottomY, calm.key).setOrigin(0.5, calm.footY).setDepth(BODY_DEPTH);
    body.setScale(this.bodyH / art.bodyH);
    // Start at a random point of the loop so neighbours do not move in step.
    body.play({ key: calm.key, startFrame: Math.floor(Math.random() * calm.frames) });
    const bubble = this.scene.add.container(x, bottomY - this.bodyH - 6).setDepth(UI_DEPTH);
    const bar = this.scene.add.graphics().setDepth(UI_DEPTH);
    const v: View = { id: c.id, body, bubble, bubbleKey: '', bar, clip: calm.key, x, bottomY, leaving: false, angry: false };
    this.requestLeaveClips();
    this.views.set(c.id, v);
    if (!SaveSystem.reduceMotion()) {
      // Arrive with a small rise and fade, so a new customer never just appears.
      body.setAlpha(0).setY(bottomY + 14);
      bubble.setAlpha(0);
      this.scene.tweens.add({ targets: body, alpha: 1, y: bottomY, duration: 300, ease: 'Quad.Out' });
      this.scene.tweens.add({ targets: bubble, alpha: 1, duration: 300, delay: 120 });
    }
    return v;
  }

  private update(v: View, c: TacoCustomer): void {
    const frac = c.patience / c.patienceMax;
    const mood = c.mood === 'angry' || frac < 0.25 ? 'angry' : frac < 0.5 ? 'worried' : c.mood === 'happy' ? 'happy' : 'normal';
    const clip = art[clipFor(mood)];
    if (clip.key !== v.clip) {
      this.ensureAnim(clip);
      v.clip = clip.key;
      v.body.play(clip.key);
    }
    v.angry = c.mood === 'angry';
    const done = c.mood === 'happy';
    const key = done ? 'done' : c.items.map((it, i) => `${it}${c.delivered[i] ? '+' : '-'}`).join(',');
    if (key !== v.bubbleKey) {
      const changed = v.bubbleKey !== '';
      this.drawBubble(v, c, done);
      // A delivered item ticks off with a little pop (not on the first draw).
      if (changed && !done) pop(this.scene, v.bubble, `taco_bubble_${v.id}`, 1.12, 200);
    }
    v.bubbleKey = key;
    this.drawBar(v, done ? 0 : frac);
  }

  private drawBar(v: View, frac: number): void {
    const w = 64;
    const g = v.bar;
    g.clear();
    if (frac <= 0) return;
    const x = v.x - w / 2;
    const y = v.bottomY + 6;
    g.fillStyle(0x2b1b17, 0.85).fillRoundedRect(x - 2, y - 2, w + 4, 11, 4);
    g.fillStyle(frac > 0.5 ? 0x5cc46b : frac > 0.25 ? 0xf6c445 : 0xe5533d, 1).fillRoundedRect(x, y, Math.max(2, w * frac), 7, 3);
  }

  private drawBubble(v: View, c: TacoCustomer, done: boolean): void {
    const box = v.bubble;
    box.removeAll(true);
    if (done) return;
    const n = c.items.length;
    const w = n * (ICON + 6) + 10;
    const h = ICON + 14;
    const g = this.scene.add.graphics();
    g.fillStyle(0xfff4dc, 1).fillRoundedRect(-w / 2, -h, w, h, 12);
    g.lineStyle(3, 0x2b1b17, 1).strokeRoundedRect(-w / 2, -h, w, h, 12);
    g.fillStyle(0xfff4dc, 1).fillTriangle(-7, 0, 7, 0, 0, 9);
    box.add(g);
    c.items.forEach((id, i) => {
      const cx = -w / 2 + 8 + ICON / 2 + 3 + i * (ICON + 6);
      const img = this.iconFor(id);
      if (!img) return;
      const k = Math.min(ICON / img.width, ICON / img.height);
      img.setScale(k).setPosition(cx, -h / 2);
      if (c.delivered[i]) {
        img.setAlpha(0.3);
        box.add(this.scene.add.text(cx, -h / 2, '✓', { fontFamily: FONT, fontSize: '30px', color: '#2E8B3E', stroke: '#FFF4DC', strokeThickness: 4 }).setOrigin(0.5));
      }
      box.add(img);
      box.sendToBack(g);
    });
  }

  private iconFor(id: string): Phaser.GameObjects.Image | null {
    const dish = this.s.dishDef(id);
    if (dish) return this.scene.add.image(0, 0, spriteKey(dish.sprite));
    const drink = this.s.taco.drinks.find((d) => d.id === id);
    if (drink) return this.scene.add.image(0, 0, sheetKey('drink_cups'), drink.sheetRow * CUP_COLUMNS + CUP_FULL_COLUMN);
    return null;
  }

  private remove(v: View): void {
    v.leaving = true;
    v.bubble.setVisible(false);
    v.bar.clear();
    if (SaveSystem.reduceMotion()) {
      this.kill(v);
      this.views.delete(v.id);
      return;
    }
    // The supplied leave clip (happy or angry) plays in place once it has loaded; until then the customer just floats away and fades.
    const clip = v.angry ? art.leaveAngry : art.leaveHappy;
    if (this.scene.textures.exists(clip.key)) {
      this.playLeaveClip(v, clip);
      return;
    }
    this.scene.tweens.add({
      targets: v.body,
      alpha: 0,
      y: v.bottomY - 30,
      duration: 450,
      onComplete: () => {
        this.kill(v);
        this.views.delete(v.id);
      },
    });
  }

  /** Ask for the two leave clips in the background, once. They are big, so they load after the scene starts. */
  private requestLeaveClips(): void {
    if (SaveSystem.reduceMotion()) return;
    for (const clip of [art.leaveHappy, art.leaveAngry]) {
      if (leaveRequested.has(clip.key) || this.scene.textures.exists(clip.key)) continue;
      leaveRequested.add(clip.key);
      this.scene.load.spritesheet(clip.key, clip.file, { frameWidth: clip.size, frameHeight: clip.size });
    }
    if (!this.scene.load.isLoading()) this.scene.load.start();
  }

  private playLeaveClip(v: View, clip: LookClip): void {
    const b = v.body;
    this.ensureAnim(clip);
    b.setOrigin(0.5, clip.footY).setAlpha(1).setPosition(v.x, v.bottomY).setScale((this.bodyH / art.bodyH) * clip.scale);
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      this.scene.tweens.add({
        targets: b,
        alpha: 0,
        duration: LEAVE_FADE_MS,
        onComplete: () => {
          this.kill(v);
          this.views.delete(v.id);
        },
      });
    };
    b.once('animationcomplete', finish);
    this.scene.time.delayedCall((clip.frames / clip.fps) * 1000 + 800, finish); // safety net if the clip never reports completion
    b.play(clip.key);
  }

  private kill(v: View): void {
    v.body.destroy();
    v.bubble.destroy();
    v.bar.destroy();
  }
}
