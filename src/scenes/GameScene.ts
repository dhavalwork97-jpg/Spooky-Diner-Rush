import Phaser from 'phaser';
import type { RestaurantDef } from '../data/validate';
import { fitBackground, hitTestZone, logicalToNorm, normToLogical, type BackgroundPlacement, type Rect, type ZoneDef } from '../kitchen/zones';
import { handleStationTap, registerStationHandler, clearStationHandlers, type TapPoint } from '../kitchen/stationHandlers';
import { animGuard, fade, pop, shake } from '../anim/helpers';
import { ParticlePool } from '../anim/ParticlePool';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { CrazyGames } from '../sdk/crazygames';
import { KitchenState, type GameEvent } from '../game/KitchenState';
import { nextHint } from '../game/tutorial';
import { MUSTARD } from '../art/builders';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';
import { BURNERS, Layout, SLOTS, SRC_H, SRC_W, VATS } from '../views/layout';
import { StationViews } from '../views/StationViews';
import { ItemView } from '../views/ItemView';
import { CustomerView } from '../views/CustomerView';
import { Hud } from '../views/Hud';
import { LevelUpCard, Overlay, Toast } from '../views/Popups';
import { TutorialHand } from '../views/TutorialHand';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const SAVE_EVERY_MS = 15000;

interface ZoneView {
  zone: ZoneDef;
  rect: Rect;
  outline: Phaser.GameObjects.Graphics;
}

/**
 * Kitchen scene. The background is static. The KitchenState model owns all gameplay;
 * this scene turns taps into model calls, and turns model events into animation.
 */
export class GameScene extends Phaser.Scene {
  private restaurant!: RestaurantDef;
  private bg!: BackgroundPlacement;
  private layout!: Layout;
  private views: ZoneView[] = [];
  private highlight!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private fx!: ParticlePool;
  private showAll = false;
  private selectedId: string | null = null;

  private state!: KitchenState;
  private stations!: StationViews;
  private hud!: Hud;
  private toast!: Toast;
  private levelUpCard!: LevelUpCard;
  private overlay!: Overlay;
  private hand!: TutorialHand;
  private muteBtn!: Phaser.GameObjects.Container;
  private muteLine!: Phaser.GameObjects.Graphics;

  private items = new Map<number, ItemView>();
  private custViews = new Map<number, CustomerView>();
  private selectedSlot: number | null = null;
  private dragTarget: number | null = null;
  private paused = false;
  private speed = 1;
  private lastSave = 0;

  constructor() {
    super('Game');
  }

  create(data: { restaurantId?: string }): void {
    const list = this.registry.get('restaurants') as RestaurantDef[];
    this.restaurant = list.find((r) => r.id === data.restaurantId) ?? list[0];

    const { width: iw, height: ih } = this.restaurant.backgroundSize;
    this.bg = fitBackground(LOGICAL_WIDTH, LOGICAL_HEIGHT, iw, ih);
    this.layout = new Layout(this.bg);
    this.add
      .image(this.bg.x, this.bg.y, this.restaurant.background)
      .setOrigin(0, 0)
      .setDisplaySize(this.bg.width, this.bg.height)
      .setName('background');

    const params = new URLSearchParams(location.search);
    const debug = params.has('debug');
    const save = SaveSystem.data;
    this.state = new KitchenState({ level: save.level, xp: save.xp, coins: save.coins });
    if (debug) {
      const lv = Number(params.get('level'));
      if (lv >= 1) {
        this.state.level = Math.floor(lv);
        this.state.xp = 0;
      }
      const sp = Number(params.get('speed'));
      if (sp > 0) this.speed = Math.min(20, sp);
    }

    this.fx = new ParticlePool(this, 140);
    this.buildZones();
    this.stations = new StationViews(this, this.layout, this.fx, this.state);
    this.hud = new Hud(this, this.state);
    this.toast = new Toast(this, LOGICAL_WIDTH / 2, 300);
    this.levelUpCard = new LevelUpCard(this, this.fx, LOGICAL_WIDTH / 2, 330);
    this.overlay = new Overlay(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.hand = new TutorialHand(this);
    this.buildMuteButton();

    this.highlight = this.add.graphics().setDepth(900).setAlpha(0);
    this.label = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '24px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
      .setOrigin(0.5, 1)
      .setDepth(901)
      .setAlpha(0);

    this.registerHandlers();

    // One scene-level handler resolves a tap to at most one zone. Taps that land on an
    // interactive object (item, customer, button) belong to that object, not to a zone.
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('dragstart', this.onDragStart, this);
    this.input.on('drag', this.onDrag, this);
    this.input.on('dragend', this.onDragEnd, this);
    this.input.keyboard?.on('keydown-Z', () => this.setShowAll(!this.showAll));
    this.setShowAll(params.has('zones'));

    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    CrazyGames.gameplayStart();
    this.lastSave = performance.now();

    (window as unknown as { __chefRush?: unknown }).__chefRush = {
      scene: this,
      state: this.state,
      zones: () => this.views.map((v) => ({ id: v.zone.id, station: v.zone.station, rect: v.rect })),
      selected: () => this.selectedId,
      toast: () => (this.toast.visible ? this.toast.message : ''),
      items: () => [...this.items.entries()].map(([slot, v]) => ({ slot, kind: v.kind, x: v.x, y: v.y })),
      customers: () => [...this.custViews.values()].map((v) => ({ id: v.id, ...v.center })),
      overlayVisible: () => this.overlay.visible,
      levelCardVisible: () => this.levelUpCard.isShowing,
      slotPos: (i: number) => ({ x: this.layout.x(SLOTS[i][0]), y: this.layout.y(SLOTS[i][1]) }),
      vatPos: (i: number) => this.stations.vatPos(i),
      burnerPos: (i: number) => this.stations.burnerPos(i),
    };
  }

  // ---------------------------------------------------------------- zones

  private buildZones(): void {
    for (const zone of this.restaurant.zones) {
      const rect = normToLogical(zone, this.bg);
      const outline = this.add.graphics().setDepth(800).setVisible(false);
      outline.lineStyle(3, 0xfff4dc, 0.9).strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 12);
      this.views.push({ zone, rect, outline });
    }
  }

  private setShowAll(on: boolean): void {
    this.showAll = on;
    for (const v of this.views) v.outline.setVisible(on);
  }

  private nearest(points: [number, number][], count: number, pt: TapPoint): number {
    const px = pt.nx * SRC_W;
    const py = pt.ny * SRC_H;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < Math.min(count, points.length); i++) {
      const d = (points[i][0] - px) ** 2 + (points[i][1] - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private registerHandlers(): void {
    clearStationHandlers();
    registerStationHandler('fryer', (_z, pt) => {
      this.state.tapFryer(this.nearest(VATS, this.state.vats.length, pt));
      return '';
    });
    registerStationHandler('grill', (_z, pt) => {
      this.state.tapGrill(this.nearest(BURNERS, this.state.burners.length, pt));
      return '';
    });
    registerStationHandler('fries_bin', () => {
      this.state.startFry();
      return '';
    });
    registerStationHandler('nuggets_bin', () => {
      this.state.startFry('nuggets');
      return '';
    });
    registerStationHandler('dough', () => {
      this.state.startPizza();
      return '';
    });
    registerStationHandler('oven', () => {
      this.state.tapOven(0);
      return '';
    });
    registerStationHandler('patty_tray', () => {
      this.state.startPatty();
      return '';
    });
    registerStationHandler('buns', () => {
      this.state.tapBuns();
      return '';
    });
    registerStationHandler('lettuce', () => {
      this.state.tapTopping('lettuce');
      return '';
    });
    registerStationHandler('tomato', () => {
      this.state.tapTopping('tomato');
      return '';
    });
    registerStationHandler('side_plate', () => '');
    registerStationHandler('trash', () => {
      const slot = this.selectedSlot ?? undefined;
      this.setSelectedSlot(null);
      this.state.tapTrash(slot);
      return '';
    });
    // The plate counter itself does nothing: items on it are the interactive objects.
    registerStationHandler('assembly', () => '');
  }

  private onPointerDown(pointer: Phaser.Input.Pointer, over: unknown[]): void {
    audio.unlock();
    audio.startMusic();
    if (over.length > 0 || this.paused) return;
    const n = logicalToNorm(pointer.worldX, pointer.worldY, this.bg);
    const zone = hitTestZone(this.restaurant.zones, n.x, n.y);
    if (!zone) {
      this.setSelectedSlot(null);
      return;
    }
    this.selectZone(zone, { nx: n.x, ny: n.y });
  }

  private selectZone(zone: ZoneDef, pt: TapPoint): void {
    const view = this.views.find((v) => v.zone.id === zone.id);
    if (!view) return;
    this.selectedId = zone.id;
    audio.play('tap');
    const text = handleStationTap(zone, this.state.level, pt);
    const { x, y, width, height } = view.rect;

    // Tap feedback: an overlay outline that fades, never part of the background.
    this.highlight.clear();
    this.highlight.fillStyle(0xfff4dc, 0.14).fillRoundedRect(x, y, width, height, 12);
    this.highlight.lineStyle(4, MUSTARD, 1).strokeRoundedRect(x, y, width, height, 12);
    this.highlight.setAlpha(1);
    animGuard.cancel('highlight:fade');
    this.time.delayedCall(300, () => {
      if (this.selectedId === zone.id) fade(this, this.highlight, 0, 200, 'highlight');
    });

    if (text) {
      this.label.setText(text).setPosition(x + width / 2, Math.max(y - 4, 30)).setAlpha(1).setScale(1);
      pop(this, this.label, 'label', 1.15, 180);
      this.time.delayedCall(900, () => {
        if (this.selectedId === zone.id) fade(this, this.label, 0, 200, 'label');
      });
    }
  }

  // ---------------------------------------------------------------- selection and dragging

  private setSelectedSlot(slot: number | null): void {
    this.selectedSlot = slot;
    this.items.forEach((v, i) => v.setSelected(i === slot));
  }

  private customerAt(x: number, y: number): CustomerView | null {
    for (const c of this.custViews.values()) if (c.hitRect.contains(x, y)) return c;
    return null;
  }

  private onDragStart(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
    if (!(obj instanceof ItemView) || obj.leaving) return;
    obj.setDragging(true);
    audio.play('tap');
  }

  private onDrag(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number): void {
    if (!(obj instanceof ItemView)) return;
    obj.setPosition(dragX, dragY);
    const over = this.customerAt(pointer.worldX, pointer.worldY);
    const id = over?.id ?? null;
    if (id !== this.dragTarget) {
      if (this.dragTarget !== null) this.custViews.get(this.dragTarget)?.setDropHighlight(false);
      if (id !== null) over?.setDropHighlight(true);
      this.dragTarget = id;
    }
  }

  private onDragEnd(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
    if (!(obj instanceof ItemView)) return;
    if (this.dragTarget !== null) this.custViews.get(this.dragTarget)?.setDropHighlight(false);
    this.dragTarget = null;
    obj.setDragging(false);
    const moved = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
    if (moved < 10) {
      // a tap: select this item, then tap a customer to serve it (tap-to-serve)
      obj.setPosition(obj.home.x, obj.home.y);
      this.setSelectedSlot(this.selectedSlot === obj.slotIndex ? null : obj.slotIndex);
      return;
    }
    const cust = this.customerAt(pointer.worldX, pointer.worldY);
    if (cust) {
      if (!this.state.serve(obj.slotIndex, cust.id)) this.snapBack(obj);
    } else {
      this.snapBack(obj);
    }
  }

  private snapBack(obj: ItemView): void {
    this.tweens.add({
      targets: obj,
      x: obj.home.x,
      y: obj.home.y,
      duration: SaveSystem.reduceMotion() ? 0 : 140,
      ease: 'Quad.Out',
      onComplete: () => shake(this, obj, `item${obj.itemId}`, 5, 200),
    });
    audio.play('wrong');
  }

  private onCustomerTap(id: number): void {
    audio.unlock();
    if (this.selectedSlot === null) return;
    const slot = this.selectedSlot;
    this.setSelectedSlot(null);
    this.state.serve(slot, id);
  }

  // ---------------------------------------------------------------- events

  private arc(obj: Phaser.GameObjects.Components.Transform, to: { x: number; y: number }, ms: number, height: number, done?: () => void): void {
    if (SaveSystem.reduceMotion()) {
      obj.setPosition(to.x, to.y);
      done?.();
      return;
    }
    const x0 = obj.x;
    const y0 = obj.y;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ms,
      ease: 'Sine.InOut',
      onUpdate: (t) => {
        const p = t.getValue() ?? 0;
        obj.setPosition(x0 + (to.x - x0) * p, y0 + (to.y - y0) * p - Math.sin(p * Math.PI) * height);
      },
      onComplete: () => {
        obj.setPosition(to.x, to.y);
        done?.();
      },
    });
  }

  private slotPos(i: number): { x: number; y: number } {
    return { x: this.layout.x(SLOTS[i][0]), y: this.layout.y(SLOTS[i][1]) - 6 };
  }

  private makeItem(slotIndex: number, at?: { x: number; y: number }): ItemView | null {
    const slot = this.state.slots[slotIndex];
    if (!slot.item) return null;
    const home = this.slotPos(slotIndex);
    const v = new ItemView(this, at?.x ?? home.x, at?.y ?? home.y, slot.item.id, slot.item.kind, slotIndex, this.layout.s(slot.item.kind === 'burger' ? 62 : slot.item.kind === 'pizza' ? 84 : 70));
    v.home = home;
    this.items.set(slotIndex, v);
    return v;
  }

  private handle(e: GameEvent): void {
    switch (e.type) {
      case 'fryStart': {
        audio.play('pop');
        // Raw fries or nuggets hop from the bin into the vat, then cook there.
        const bin = this.zoneCenter(e.kind === 'nuggets' ? 'nuggets_bin' : 'fries_bin');
        const to = this.stations.vatPos(e.vat);
        if (bin && !SaveSystem.reduceMotion()) {
          this.stations.holdVat(e.vat, 380, this.game.loop.time);
          const raw = this.add.image(bin.x, bin.y, `${e.kind}_raw`).setDepth(650);
          raw.setScale(this.layout.s(e.kind === 'nuggets' ? 80 : 110) / raw.width);
          this.arc(raw, to, 360, 50, () => {
            raw.destroy();
            this.fx.burst(to.x, to.y, 0xfff1b8, 6, 30, 350);
            audio.play('drop');
          });
        }
        break;
      }
      case 'ovenStart': {
        audio.play('pop');
        // A raw pizza slides from the dough bases into the oven.
        const from = this.zoneCenter('dough');
        const to = this.stations.ovenPos(e.oven);
        if (from && !SaveSystem.reduceMotion()) {
          this.stations.holdOven(e.oven, 400, this.game.loop.time);
          const raw = this.add.image(from.x, from.y, 'pizza_raw').setDepth(650);
          raw.setScale(this.layout.s(190) / raw.width);
          this.arc(raw, to, 380, 40, () => {
            raw.destroy();
            audio.play('drop');
          });
        }
        break;
      }
      case 'ovenPhase':
        if (e.phase === 'ready') {
          audio.play('ding');
          this.stations.readyBounce('oven', e.oven);
        }
        break;
      case 'pattyStart':
        audio.play('pop');
        break;
      case 'fryPhase':
        if (e.phase === 'ready') {
          audio.play('ding');
          this.stations.readyBounce('vat', e.vat);
        }
        break;
      case 'pattyPhase':
        if (e.phase === 'ready') {
          audio.play('ding');
          this.stations.readyBounce('burner', e.burner);
        }
        break;
      case 'pattyFlip':
        this.stations.flip(e.burner);
        audio.play('pop');
        break;
      case 'burnt':
        this.stations.burntPuff(e.where, e.index);
        audio.play('burn');
        this.toast.show('Burnt! Tap to throw it away');
        break;
      case 'collect': {
        const from = e.from === 'fryer' ? this.stations.vatPos(e.index) : this.stations.ovenPos(e.index);
        const v = this.makeItem(e.slot, from);
        if (v) {
          v.showFries();
          v.setScale(0.6);
          this.arc(v, v.home, 340, 40, () => {
            v.setScale(1);
            audio.play('drop');
          });
          this.tweens.add({ targets: v, scale: 1, duration: 340 });
        }
        break;
      }
      case 'buildStart': {
        const v = this.makeItem(e.slot);
        v?.syncLayers(this.state.slots[e.slot].item?.placed ?? [], true, true);
        break;
      }
      case 'layerAdded':
      case 'burgerDone': {
        const it = this.state.slots[e.slot].item;
        if (it) this.items.get(e.slot)?.syncLayers(it.placed, it.building, true);
        break;
      }
      case 'discard':
        if (e.where === 'slot' || e.where === 'build') {
          const v = this.items.get(e.index);
          if (v) this.removeItem(e.index, true);
        }
        audio.play('wrong');
        break;
      case 'arrive': {
        const c = this.state.customers.find((x) => x.id === e.customer);
        if (c && !this.custViews.has(c.id)) this.addCustomer(c.id);
        audio.play('pop');
        break;
      }
      case 'deliver': {
        const v = this.items.get(e.slot);
        const cv = this.custViews.get(e.customer);
        if (v) {
          this.items.delete(e.slot);
          v.leaving = true;
          v.setDragging(false);
          if (this.selectedSlot === e.slot) this.setSelectedSlot(null);
          const target = cv ? cv.center : v.home;
          this.arc(v, target, 260, 20, () => v.destroy());
          this.tweens.add({ targets: v, scale: 0.4, alpha: 0.2, duration: 260 });
        }
        audio.play('pop');
        break;
      }
      case 'wrongDrop': {
        this.toast.show('That is not what they ordered');
        break;
      }
      case 'orderDone': {
        const cv = this.custViews.get(e.customer);
        this.flyCoins(cv?.center ?? { x: 640, y: 150 }, Math.min(6, 2 + Math.floor(e.coins / 10)));
        audio.play('coin');
        this.saveNow();
        break;
      }
      case 'angryLeave':
        audio.play('wrong');
        this.cameras.main.shake(SaveSystem.reduceMotion() ? 0 : 120, 0.002);
        break;
      case 'leave': {
        const cv = this.custViews.get(e.customer);
        if (cv) {
          this.custViews.delete(e.customer);
          cv.leave(() => cv.destroy());
        }
        break;
      }
      case 'levelUp':
        this.hud.badgePop();
        this.levelUpCard.show(e.level, e.coins, e.unlocks);
        this.saveNow();
        break;
      case 'closed':
        this.setSelectedSlot(null);
        this.hand.hide();
        audio.play('close');
        audio.setSizzle(0);
        CrazyGames.gameplayStop();
        this.overlay.show('Closed', 'Too many unhappy customers.\nYour level, XP and coins are safe.', 'Reopen', () => this.state.reopen());
        break;
      case 'reopened':
        this.items.forEach((v) => v.destroy());
        this.items.clear();
        this.custViews.forEach((c) => c.destroy());
        this.custViews.clear();
        this.overlay.hide();
        CrazyGames.gameplayStart();
        break;
      case 'invalid':
        this.toast.show(e.message);
        audio.play('wrong');
        break;
    }
  }

  private addCustomer(id: number): void {
    const c = this.state.customers.find((x) => x.id === id);
    if (!c) return;
    const view = new CustomerView(this, this.layout, c);
    view.body.on('pointerdown', () => this.onCustomerTap(id));
    this.custViews.set(id, view);
  }

  private removeItem(slot: number, poof: boolean): void {
    const v = this.items.get(slot);
    if (!v) return;
    this.items.delete(slot);
    if (this.selectedSlot === slot) this.selectedSlot = null;
    v.leaving = true;
    if (poof && !SaveSystem.reduceMotion()) {
      this.fx.burst(v.x, v.y, 0x9a9a9a, 6, 30, 350);
      this.tweens.add({ targets: v, scale: 0, alpha: 0, duration: 200, onComplete: () => v.destroy() });
    } else v.destroy();
  }

  private flyCoins(from: { x: number; y: number }, count: number): void {
    const target = { x: this.hud.coinIcon.x, y: this.hud.coinIcon.y };
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(SaveSystem.reduceMotion() ? 0 : i * 70, () => {
        const coin = this.add.image(from.x, from.y, 'coin').setDepth(1000);
        coin.setScale(30 / coin.width);
        this.arc(coin, target, 480, 70, () => {
          coin.destroy();
          if (i === count - 1) pop(this, this.hud.coinIcon, 'coinicon', 1.25, 180);
        });
      });
    }
  }

  // ---------------------------------------------------------------- mute button

  private buildMuteButton(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2).fillCircle(0, 4, 24);
    g.fillStyle(0xfff4dc, 1).fillCircle(0, 0, 24);
    g.lineStyle(4, 0x2b1b17, 1).strokeCircle(0, 0, 24);
    const note = this.add.text(0, -1, '♪', { fontFamily: FONT, fontSize: '30px', color: '#2B1B17' }).setOrigin(0.5);
    this.muteLine = this.add.graphics();
    this.muteLine.lineStyle(5, 0xd9382b, 1).beginPath().moveTo(-16, 16).lineTo(16, -16).strokePath();
    this.muteLine.setVisible(SaveSystem.data.settings.muted);
    // 88 px hit area around a smaller visual
    this.muteBtn = this.add.container(1232, 112, [g, note, this.muteLine]).setDepth(850).setSize(88, 88).setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', () => {
      audio.unlock();
      audio.setMuted(!SaveSystem.data.settings.muted);
      this.muteLine.setVisible(SaveSystem.data.settings.muted);
      audio.play('click');
    });
  }

  // ---------------------------------------------------------------- loop

  override update(time: number, delta: number): void {
    const dtReal = Math.min(delta / 1000, 0.1);
    if (!this.paused) {
      const dt = dtReal * this.speed;
      // run the model in small steps so a speed-up never skips a phase
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) this.state.update(dt / steps);
    }
    for (const e of this.state.drainEvents()) this.handle(e);

    // keep views in step with the model
    for (const c of this.state.customers) {
      if (!this.custViews.has(c.id) && c.mood !== 'angry' && c.mood !== 'happy') this.addCustomer(c.id);
      this.custViews.get(c.id)?.update(c, time);
    }
    for (const slot of this.state.slots) {
      const v = this.items.get(slot.index);
      if (slot.item && !v) {
        const nv = this.makeItem(slot.index);
        if (nv) slot.item.kind !== 'burger' ? nv.showFries() : nv.syncLayers(slot.item.placed, slot.item.building, false);
      } else if (!slot.item && v && !v.leaving) this.removeItem(slot.index, false);
    }
    this.stations.update(this.state, time);
    this.hud.update(this.state, dtReal);
    this.updateHint();

    const cooking = this.state.vats.filter((v) => v && v.phase !== 'burnt').length + this.state.burners.filter((b) => b && b.phase !== 'burnt').length + this.state.ovens.filter((o) => o && o.phase !== 'burnt').length;
    audio.setSizzle(this.paused || this.state.closed ? 0 : Math.min(1, cooking / 2));

    if (time - this.lastSave > SAVE_EVERY_MS) this.saveNow();
  }

  private zoneCenter(station: string): { x: number; y: number } | null {
    const z = this.views.find((v) => v.zone.station === station);
    return z ? { x: z.rect.x + z.rect.width / 2, y: z.rect.y + z.rect.height / 2 } : null;
  }

  private updateHint(): void {
    const hint = this.paused || this.overlay.visible ? null : nextHint(this.state);
    if (!hint) return this.hand.hide();
    const off = { x: 6, y: 8 };
    const tap = (key: string, p: { x: number; y: number } | null) => (p ? this.hand.point(key, { x: p.x + off.x, y: p.y + off.y }) : this.hand.hide());
    switch (hint.kind) {
      case 'fries_bin':
        return tap('fries_bin', this.zoneCenter('fries_bin'));
      case 'vat':
        return tap(`vat${hint.vat}:${this.state.vats[hint.vat]?.phase ?? 'empty'}`, this.stations.vatPos(hint.vat));
      case 'grill':
        return tap(`grill${hint.burner}:${this.state.burners[hint.burner]?.phase ?? 'empty'}:${this.state.burners[hint.burner]?.side ?? 0}`, this.stations.burnerPos(hint.burner));
      case 'patty_tray':
        return tap('patty_tray', this.zoneCenter('patty_tray'));
      case 'buns':
        return tap('buns', this.zoneCenter('buns'));
      case 'topping':
        return tap(`topping:${hint.layer}`, this.zoneCenter(hint.layer));
      case 'drag': {
        const from = this.slotPos(hint.slot);
        const cv = this.custViews.get(hint.customer);
        if (cv) this.hand.point(`drag${hint.slot}-${hint.customer}`, { x: from.x, y: from.y }, cv.center);
        else this.hand.hide();
      }
    }
  }

  private saveNow(): void {
    SaveSystem.data.level = this.state.level;
    SaveSystem.data.xp = this.state.xp;
    SaveSystem.data.coins = this.state.coins;
    SaveSystem.save();
    this.lastSave = performance.now();
  }

  // ---------------------------------------------------------------- pause

  private onBlur(): void {
    if (this.paused || this.state.closed) return;
    this.paused = true;
    CrazyGames.gameplayStop();
    audio.pauseAll();
    this.overlay.show('Paused', '', 'Resume', () => {
      this.paused = false;
      this.overlay.hide();
      audio.resumeAll();
      CrazyGames.gameplayStart();
    });
  }

  private cleanup(): void {
    this.saveNow();
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('dragstart', this.onDragStart, this);
    this.input.off('drag', this.onDrag, this);
    this.input.off('dragend', this.onDragEnd, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    animGuard.cancelAll();
    this.stations.destroy();
    this.hand.destroy();
    this.fx.destroy();
    this.items.clear();
    this.custViews.clear();
    this.views = [];
    audio.setSizzle(0);
    audio.stopMusic();
    CrazyGames.gameplayStop();
  }
}
