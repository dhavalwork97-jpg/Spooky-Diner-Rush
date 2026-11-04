import Phaser from 'phaser';
import type { RestaurantDef } from '../data/validate';
import { fitBackground, hitTestZone, logicalToNorm, normToLogical, type BackgroundPlacement, type Rect, type ZoneDef } from '../kitchen/zones';
import { handleStationTap, registerStationHandler, clearStationHandlers, type TapPoint } from '../kitchen/stationHandlers';
import { animGuard, fade, pop, shake } from '../anim/helpers';
import { ParticlePool } from '../anim/ParticlePool';
import { Atmosphere } from '../anim/atmosphere';
import { SaveSystem } from '../systems/SaveSystem';
import { modsFor } from '../game/shop';
import { titleEarnedAt } from '../game/career';
import { ChefTalk } from '../game/chef';
import { dueStory, seenAfter } from '../game/story';
import type { RestaurantSelectData } from './RestaurantSelectScene';
import { ownedDecor } from '../game/decor';
import { decorKey } from '../art/builders';
import { makeRng } from '../game/rng';
import { ChefBubble } from '../views/ChefBubble';
import { MenuButtons, type MenuKind } from '../views/MenuButtons';
import { audio } from '../systems/AudioSystem';
import { CrazyGames } from '../sdk/crazygames';
import { KitchenState, type GameEvent } from '../game/KitchenState';
import { nextHint } from '../game/tutorial';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';
import { laneSpan } from '../kitchen/grab';
import { BURNERS, COLD, COLD_BASE_W, COLD_LANE_DX, FRY_FROM, ICE, ICE_BASE_W, ICE_LANE_DX, Layout, SLOTS, SRC_H, SRC_W, VAT_FOOD_W, VATS } from '../views/layout';
import { StationViews } from '../views/StationViews';
import { StockViews } from '../views/StockViews';
import { PourViews, loadColdDrinkArt, loadIceCreamArt } from '../views/PourViews';
import { loadOvenSheet } from '../views/OvenDoor';
import { ItemView } from '../views/ItemView';
import { CustomerView } from '../views/CustomerView';
import { Hud } from '../views/Hud';
import { EventBanner, LevelUpCard, Overlay, Toast, StoryCard } from '../views/Popups';
import { TutorialHand } from '../views/TutorialHand';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const SAVE_EVERY_MS = 15000;
/** Model seconds of quiet before the chef offers an idle tip. */
const CHEF_IDLE_AFTER = 45;
/** Extra reach (fraction of the kitchen image) for taps that miss every zone. */
const TOUCH_SLOP = 0.025;

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
  private label!: Phaser.GameObjects.Text;
  private fx!: ParticlePool;
  private atmosphere?: Atmosphere;
  private showAll = false;
  private selectedId: string | null = null;

  private state!: KitchenState;
  private stations!: StationViews;
  private stock!: StockViews;
  private pours!: PourViews;
  private hud!: Hud;
  private toast!: Toast;
  private banner!: EventBanner;
  private levelUpCard!: LevelUpCard;
  private overlay!: Overlay;
  private hand!: TutorialHand;
  private decorViews = new Map<string, Phaser.GameObjects.Image>();
  private menuButtons!: MenuButtons;
  private storyCard!: StoryCard;
  private chef!: ChefBubble;
  private chefTalk!: ChefTalk;
  /** Model clock when the chef last spoke, for the idle tip. */
  private chefLastAt = 0;
  private muteBtn!: Phaser.GameObjects.Container;
  private muteLine!: Phaser.GameObjects.Graphics;

  private items = new Map<number, ItemView>();
  /** A grab area over each finished cup or cone, keyed `dispenser0`, `icecream1`... */
  private pourItems = new Map<string, ItemView>();
  private selectedPour: string | null = null;
  /** The green tick on the dispenser: a big touch target that picks the first full cup (tap it, then tap the customer). */
  private drinkBadge?: Phaser.GameObjects.Zone;
  private pourIds = 0;
  private custViews = new Map<number, CustomerView>();
  private selectedSlot: number | null = null;
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
    this.state.mods = modsFor(this.state.cfg.upgrades.upgrades, save.owned);
    if (debug) {
      const lv = Number(params.get('level'));
      if (lv >= 1) {
        this.state.level = Math.floor(lv);
        this.state.xp = 0;
      }
      const sp = Number(params.get('speed'));
      if (sp > 0) this.speed = Math.min(20, sp);
    }

    this.syncDecor();
    this.fx = new ParticlePool(this, 140);
    this.atmosphere = new Atmosphere(this, this.layout);
    this.buildZones();
    this.stock = new StockViews(this, this.layout, this.state.level);
    loadOvenSheet(this); // background load; the oven works without the door art until it arrives
    this.stations = new StationViews(this, this.layout, this.fx, this.state);
    this.pours = new PourViews(this, this.layout);
    loadColdDrinkArt(this); // background load; the code-drawn glass is used until it arrives
    loadIceCreamArt(this); // background load; the code-drawn scoop is used until it arrives
    this.hud = new Hud(this, this.state);
    this.toast = new Toast(this, LOGICAL_WIDTH / 2, 300);
    this.banner = new EventBanner(this, 551, 42);
    this.levelUpCard = new LevelUpCard(this, this.fx, LOGICAL_WIDTH / 2, 330, () => this.levelBreakAd());
    this.overlay = new Overlay(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.hand = new TutorialHand(this);
    this.storyCard = new StoryCard(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.chef = new ChefBubble(this, this.layout);
    this.chefTalk = new ChefTalk(this.state.cfg.chef, makeRng(Date.now()));
    this.buildMuteButton();
    this.menuButtons = new MenuButtons(this, (k: MenuKind) => (k === 'shop' ? this.openShop() : k === 'book' ? this.openRecipeBook() : this.openRestaurants()));

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
    this.input.keyboard?.on('keydown-B', this.openShop, this);
    this.input.keyboard?.on('keydown-R', this.openRecipeBook, this);
    this.input.keyboard?.on('keydown-T', this.openRestaurants, this);
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
      banner: () => (this.banner.visible ? this.banner.text : ''),
      startEvent: (id: string) => {
        const def = this.state.cfg.events.events.find((e) => e.id === id);
        if (def) this.state.startEvent(def);
      },
      spawn: (type: string) => this.state.spawnCustomer(type),
      atmosphere: () => this.atmosphere?.live,
      levelCardVisible: () => this.levelUpCard.isShowing,
      chef: () => this.chef.text,
      story: () => this.storyCard.id,
      ovenDoor: (i = 0) => this.stations.doorState(i),
      decor: () => [...this.decorViews.keys()],
      menuButtons: () => this.menuButtons.positions(),
      openShop: () => this.openShop(),
      openRecipeBook: () => this.openRecipeBook(),
      openRestaurants: () => this.openRestaurants(),
      chefSay: (trigger: string) => this.sayChef(this.chefTalk.say(trigger, this.state.clock)),
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
    registerStationHandler('drinks', () => {
      this.state.tapDrinks();
      return '';
    });
    registerStationHandler('ice_cream', () => {
      this.state.tapIceCream();
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
    if (over.length > 0 || this.paused || (window.innerWidth < 900 && window.innerHeight > window.innerWidth * 1.1)) return;
    const n = logicalToNorm(pointer.worldX, pointer.worldY, this.bg);
    const zone = hitTestZone(this.restaurant.zones, n.x, n.y, TOUCH_SLOP);
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
    const { x, y, width } = view.rect;

    // No box is drawn around the tapped zone any more (it looked like a stray outline); the tap sound and the label below remain.
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
    if (slot !== null) this.setSelectedPour(null);
  }

  private setSelectedPour(key: string | null): void {
    this.selectedPour = key;
    this.pourItems.forEach((v, k) => v.setSelected(k === key));
    if (key !== null && this.selectedSlot !== null) this.setSelectedSlot(null);
  }

  /** Keep one grab area over every finished cup and cone; the model decides which ones are ready. */
  private syncPourItems(): void {
    const lanes: { from: 'dispenser' | 'icecream'; n: number }[] = [
      { from: 'dispenser', n: this.state.spouts.length },
      { from: 'icecream', n: this.state.cones.length },
    ];
    const live = new Set<string>();
    for (const { from, n } of lanes) {
      const ready = Array.from({ length: n }, (_, i) => this.state.pourReady(from, i));
      const sig = ready.map((r) => (r ? '1' : '0')).join('');
      const pos = Array.from({ length: n }, (_, i) => (from === 'dispenser' ? this.pours.dispenserPos(i) : this.pours.conePos(i)));
      const kind = from === 'dispenser' ? 'drink' : 'icecream';
      const pitch = this.layout.s(from === 'dispenser' ? (COLD_LANE_DX.right * COLD.w) / COLD_BASE_W : (ICE_LANE_DX.right * ICE.w) / ICE_BASE_W);
      for (let i = 0; i < n; i++) {
        if (!ready[i]) continue;
        const key = `${from}${i}`;
        live.add(key);
        const old = this.pourItems.get(key);
        // The grab span depends on which neighbours are ready, so build it again when that changes (never while it is held or flying).
        if (old && (old.pourSig === sig || old.dragging || old.leaving)) continue;
        if (old) {
          this.pourItems.delete(key);
          if (this.selectedPour === key) this.selectedPour = null;
          old.destroy();
        }
        // Wide: its own lane plus free neighbour lanes. Tall: a cone's area reaches down over its progress ring.
        const span = laneSpan(pos.map((p) => p.x), ready, i, pitch);
        const down = from === 'icecream' ? this.layout.s(34) : this.layout.s(8);
        const cx = pos[i].x + (span.left + span.right) / 2;
        const v = new ItemView(this, cx, pos[i].y + down, 100000 + this.pourIds++, kind, -1, this.layout.s(kind === 'drink' ? 100 : 104), { w: span.right - span.left, h: this.layout.s(from === 'icecream' ? 150 : 120) });
        v.source = { from, index: i };
        v.pourSig = sig;
        v.showFries();
        v.setProxy(true);
        this.pourItems.set(key, v);
      }
    }
    // The tick on the dispenser works as a handle while a full cup waits.
    if (!this.drinkBadge) {
      const r = this.pours.ringPos('drink');
      const z = this.add.zone(r.x, r.y, this.layout.s(110), this.layout.s(110)).setDepth(900).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        audio.unlock();
        const i = this.state.spouts.findIndex((_, n) => this.state.pourReady('dispenser', n));
        if (i >= 0) this.setSelectedPour(this.selectedPour === `dispenser${i}` ? null : `dispenser${i}`);
      });
      this.drinkBadge = z;
    }
    if (this.drinkBadge.input) this.drinkBadge.input.enabled = this.state.spouts.some((_, n) => this.state.pourReady('dispenser', n));
    for (const [key, v] of this.pourItems) {
      if (live.has(key) || v.leaving) continue;
      this.pourItems.delete(key);
      if (this.selectedPour === key) this.selectedPour = null;
      v.destroy();
    }
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

  private onDrag(_pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number): void {
    if (!(obj instanceof ItemView)) return;
    obj.setPosition(dragX, dragY);
    // Nothing is drawn on the customer under the item (no box or outline); the drop target is found again when the item is released.
  }

  private onDragEnd(pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
    if (!(obj instanceof ItemView)) return;
    obj.setDragging(false);
    const moved = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
    const src = obj.source;
    if (src) {
      const key = `${src.from}${src.index}`;
      if (moved < 10) {
        obj.setPosition(obj.home.x, obj.home.y);
        this.setSelectedPour(this.selectedPour === key ? null : key);
        return;
      }
      const target = this.customerAt(pointer.worldX, pointer.worldY);
      if (!target || !this.state.serveFromPour(src.from, src.index, target.id)) this.snapBack(obj);
      return;
    }
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
    if (obj.source) obj.reveal();
    this.tweens.add({
      targets: obj,
      x: obj.home.x,
      y: obj.home.y,
      duration: SaveSystem.reduceMotion() ? 0 : 140,
      ease: 'Quad.Out',
      onComplete: () => {
        if (obj.source) obj.setProxy(true);
        shake(this, obj, `item${obj.itemId}`, 5, 200);
      },
    });
    audio.play('wrong');
  }

  private onCustomerTap(id: number): void {
    audio.unlock();
    if (this.selectedPour !== null) {
      const v = this.pourItems.get(this.selectedPour);
      this.setSelectedPour(null);
      if (v?.source) this.state.serveFromPour(v.source.from, v.source.index, id);
      return;
    }
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
    const v = new ItemView(this, at?.x ?? home.x, at?.y ?? home.y, slot.item.id, slot.item.kind, slotIndex, this.layout.s(slot.item.kind === 'burger' ? 62 : slot.item.kind === 'pizza' ? 112 : slot.item.kind === 'icecream' ? 104 : slot.item.kind === 'drink' ? 100 : 70));
    v.home = home;
    this.items.set(slotIndex, v);
    return v;
  }

  private handle(e: GameEvent): void {
    this.sayChef(this.chefTalk.onEvent(e, this.state.clock));
    switch (e.type) {
      case 'fryStart': {
        audio.play('pop');
        // Raw fries or nuggets hop from the bin into the vat, then cook there.
        // The food leaves from the pile painted in the basket, so it starts exactly where the player sees it.
        const pile = FRY_FROM[e.kind === 'nuggets' ? 'nuggets' : 'fries'];
        const bin = { x: this.layout.x(pile[0]), y: this.layout.y(pile[1]) };
        const to = this.stations.vatPos(e.vat);
        if (bin && !SaveSystem.reduceMotion()) {
          this.stations.holdVat(e.vat, 380, this.game.loop.time);
          const raw = this.add.image(bin.x, bin.y, `${e.kind}_raw`).setDepth(650);
          raw.setScale(this.layout.s(VAT_FOOD_W[e.kind === 'nuggets' ? 'nuggets' : 'fries']) / raw.width);
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
        const to = this.stations.ovenLoadPos(e.oven);
        if (from && !SaveSystem.reduceMotion()) {
          this.stations.holdOven(e.oven, 400, this.game.loop.time);
          const raw = this.add.image(from.x, from.y, 'pizza_raw').setDepth(650);
          raw.setScale(this.layout.s(160) / raw.width);
          this.arc(raw, to, 380, 40, () => {
            raw.destroy();
            audio.play('drop');
          });
        }
        break;
      }
      case 'drinkStart':
      case 'coneStart':
        audio.play('pop');
        break;
      case 'drinkPhase':
      case 'conePhase':
        if (e.phase === 'ready') {
          audio.play('ding');
          const at = e.type === 'drinkPhase' ? this.pours.ringPos('drink') : this.pours.coneRingPos(e.machine);
          this.fx.burst(at.x, at.y, 0xffffff, 6, 26, 320);
        }
        break;
      case 'melted': {
        this.pours.melt(e.machine);
        const at = this.pours.conePos(e.machine);
        this.fx.burst(at.x, at.y, 0xf7b6c8, 8, 30, 420);
        this.floatText(at.x, at.y - 24, 'Melted', '#FFF4DC');
        break;
      }
      case 'ovenPhase':
        if (e.phase === 'ready') {
          audio.play('ding');
          this.stations.readyBounce('oven', e.oven);
        }
        break;
      case 'pattyStart': {
        audio.play('pop');
        // A raw patty hops from the tray onto the grill.
        const tray = this.zoneCenter('patty_tray');
        const to = this.stations.burnerPos(e.burner);
        if (tray && !SaveSystem.reduceMotion()) {
          this.stations.holdBurner(e.burner, 360, this.game.loop.time);
          const raw = this.add.image(tray.x, tray.y, 'patty_raw').setDepth(650);
          raw.setScale(this.layout.s(120) / raw.width);
          this.arc(raw, to, 340, 50, () => {
            raw.destroy();
            this.fx.burst(to.x, to.y, 0xffffff, 5, 26, 300);
            audio.play('drop');
          });
        }
        break;
      }
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
        const key = e.from ? `${e.from}${e.index}` : null;
        const v = key ? this.pourItems.get(key) : this.items.get(e.slot);
        if (key) {
          this.pourItems.delete(key);
          if (this.selectedPour === key) this.setSelectedPour(null);
          v?.setProxy(false);
        }
        const cv = this.custViews.get(e.customer);
        if (v) {
          this.items.delete(e.slot);
          v.leaving = true;
          v.setDragging(false);
          if (!key && this.selectedSlot === e.slot) this.setSelectedSlot(null);
          const target = cv ? cv.center : v.home;
          this.arc(v, target, 260, 20, () => v.destroy());
          this.tweens.add({ targets: v, scale: 0.4, alpha: 0.2, duration: 260 });
        }
        audio.play('pop');
        break;
      }
      case 'wrongDrop': {
        this.toast.show('That is not what they ordered');
        if (e.customer !== null) this.custViews.get(e.customer)?.shake();
        break;
      }
      case 'comboChanged':
        this.hud.comboPop(e.combo);
        if (e.broken) audio.play('wrong');
        else if (e.combo >= 3) audio.play('ding');
        break;
      case 'eventStart':
        this.banner.show(e.name, e.duration);
        audio.play('ding');
        break;
      case 'eventEnd':
        this.banner.hide();
        break;
      case 'streakBonus':
        this.toast.show(`Streak bonus +${e.xp} XP`);
        audio.play('ding');
        break;
      case 'orderDone': {
        const cv = this.custViews.get(e.customer);
        this.flyCoins(cv?.center ?? { x: 640, y: 150 }, Math.min(6, 2 + Math.floor(e.coins / 10)));
        if (cv) {
          const at = { x: cv.center.x + 78, y: cv.center.y - 8 };
          if (e.rush) this.floatText(at.x, at.y, 'Rush!', '#FF6B5A');
          if (e.combo >= 2) this.floatText(at.x, at.y - 26, `Combo x${e.combo}`, '#F6C445');
          if (e.tip > 0) this.floatText(at.x, at.y + 24, `+${e.tip} tip`, '#9BE37A');
        }
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
        this.levelUpCard.show(e.level, e.coins, e.unlocks, titleEarnedAt(this.state.cfg, e.level)?.title);
        this.saveNow();
        break;
      case 'closed':
        this.setSelectedSlot(null);
        this.hand.hide();
        audio.play('close');
        audio.setSizzle(0);
        CrazyGames.gameplayStop();
        this.overlay.show(
          'Closed',
          'Too many unhappy customers.\nYour level, XP and coins are safe.',
          'Reopen',
          () => this.breakAd(() => this.state.reopen()),
          CrazyGames.canShowRewarded() ? { label: 'Watch an ad: reopen at full reputation', onPress: () => this.reviveWithAd() } : undefined,
        );
        break;
      case 'reopened':
        this.banner.hide();
        this.items.forEach((v) => v.destroy());
        this.items.clear();
        this.pourItems.forEach((v) => v.destroy());
        this.pourItems.clear();
        this.selectedPour = null;
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

  /** Show the story card due at this level, once. Waits for the level-up card, overlays and pauses. */
  private maybeShowStory(): void {
    if (this.paused || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing) return;
    const card = dueStory(this.state.cfg, this.state.level, SaveSystem.data.seenStory);
    if (!card) return;
    SaveSystem.data.seenStory = seenAfter(this.state.cfg, SaveSystem.data.seenStory, card);
    this.saveNow();
    this.chef.hide();
    this.chef.setChefVisible(false);
    this.setSelectedSlot(null);
    this.storyCard.show(card, () => this.chef.setChefVisible(true));
  }

  /** Draw owned decor. Cosmetic images sit above the background and below customers (depth 100). */
  private syncDecor(): void {
    for (const d of ownedDecor(this.state.cfg.decor.items, SaveSystem.data.decor)) {
      if (this.decorViews.has(d.id)) continue;
      const img = this.add.image(this.layout.x(d.x), this.layout.y(d.y), decorKey(d.id)).setOrigin(0, 0).setDepth(100).setName(`decor_${d.id}`);
      this.layout.fit(img, d.width);
      this.decorViews.set(d.id, img);
    }
  }

  /** Open the Shop over the game. The game scene is paused until it closes. */
  openShop(): void {
    this.openPanel('Shop');
  }

  /** Open the Recipe Book over the game (read-only). */
  openRecipeBook(): void {
    this.openPanel('RecipeBook');
  }

  /** Open the restaurant list. Picking another open restaurant restarts this scene in it. */
  openRestaurants(): void {
    this.openPanel('RestaurantSelect');
  }

  private openPanel(key: 'Shop' | 'RecipeBook' | 'RestaurantSelect'): void {
    if (this.paused || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing) return;
    this.setSelectedSlot(null);
    this.chef.hide();
    this.hand.hide();
    audio.setSizzle(0);
    this.saveNow();
    const data: RestaurantSelectData = {
      state: this.state,
      current: this.restaurant.id,
      onClose: () => {
        this.syncDecor();
        this.scene.resume();
      },
      onPick: (id: string) => this.scene.start('Game', { restaurantId: id }),
    };
    this.scene.launch(key, data);
    this.scene.pause();
  }

  private sayChef(line: { text: string; hold: number } | null): void {
    if (!line || this.paused || this.state.closed || this.storyCard.isShowing) return;
    this.chef.show(line.text, line.hold);
    this.chefLastAt = this.state.clock;
  }

  private addCustomer(id: number): void {
    const c = this.state.customers.find((x) => x.id === id);
    if (!c) return;
    const view = new CustomerView(this, this.layout, c, this.fx);
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

  /** Short-lived text that rises and fades (Rush, Combo, tip). */
  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '24px', color, stroke: '#2B1B17', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(960);
    if (SaveSystem.reduceMotion()) {
      this.time.delayedCall(900, () => t.destroy());
      return;
    }
    t.setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, delay: 250, onComplete: () => t.destroy() });
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
    const portrait = window.innerWidth < 900 && window.innerHeight > window.innerWidth * 1.1;
    if (!this.paused && !portrait && !this.storyCard.isShowing) {
      const dt = dtReal * this.speed;
      // run the model in small steps so a speed-up never skips a phase
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) this.state.update(dt / steps);
    }
    for (const e of this.state.drainEvents()) this.handle(e);

    // keep views in step with the model
    for (const c of this.state.customers) {
      if (!this.custViews.has(c.id) && c.mood !== 'angry' && c.mood !== 'happy') this.addCustomer(c.id);
      this.custViews.get(c.id)?.update(c, time, this.state.isRush(c));
    }
    for (const slot of this.state.slots) {
      const v = this.items.get(slot.index);
      if (slot.item && !v) {
        const nv = this.makeItem(slot.index);
        if (nv) slot.item.kind !== 'burger' ? nv.showFries() : nv.syncLayers(slot.item.placed, slot.item.building, false);
      } else if (!slot.item && v && !v.leaving) this.removeItem(slot.index, false);
    }
    this.atmosphere?.update(delta);
    this.stock.update(this.state.level);
    this.stock.updateDough(this.state);
    this.stations.update(this.state, time);
    this.pours.update(this.state, time);
    this.syncPourItems();
    this.hud.update(this.state, dtReal);
    if (this.state.event) this.banner.update(this.state.event.remaining);
    this.updateHint();
    this.maybeShowStory();
    this.runDueAd();
    if (!this.paused && !this.state.closed && this.state.clock - this.chefLastAt > CHEF_IDLE_AFTER) {
      this.chefLastAt = this.state.clock;
      this.sayChef(this.chefTalk.say('idle', this.state.clock));
    }

    const cooking = this.state.vats.filter((v) => v && v.phase !== 'burnt').length + this.state.burners.filter((b) => b && b.phase !== 'burnt').length + this.state.ovens.filter((o) => o && o.phase !== 'burnt').length;
    audio.setSizzle(this.paused || this.state.closed ? 0 : Math.min(1, cooking / 2));

    if (time - this.lastSave > SAVE_EVERY_MS) this.saveNow();
  }

  private zoneCenter(station: string): { x: number; y: number } | null {
    const z = this.views.find((v) => v.zone.station === station);
    return z ? { x: z.rect.x + z.rect.width / 2, y: z.rect.y + z.rect.height / 2 } : null;
  }

  private updateHint(): void {
    const hint = this.paused || this.overlay.visible || this.storyCard.isShowing ? null : nextHint(this.state);
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

  /** True while a CrazyGames ad is on screen: the model and sound are frozen. */
  private adActive = false;
  private adPending = false;

  /**
   * A mid-game ad at a natural break. The game and sound stay frozen while it plays; `then` always runs afterwards,
   * also when no ad was shown (no SDK, cooldown, error), so it can never block the player.
   */
  private breakAd(then?: () => void): void {
    if (this.adActive || this.adPending) return;
    this.adPending = true;
    void CrazyGames.midgameAd(() => {
      this.adActive = true;
      this.paused = true;
      audio.pauseAll();
      CrazyGames.gameplayStop();
    }).then((shown) => {
      this.adPending = false;
      if (shown) {
        this.adActive = false;
        this.paused = false;
        audio.resumeAll();
        if (!this.state.closed) CrazyGames.gameplayStart();
      }
      then?.();
    });
  }

  private adDue = false;

  /** Rewarded ad on the Closed screen: reopen at full reputation, but only if the ad is watched to the end. */
  private reviveWithAd(): void {
    if (this.adActive || this.adPending || !this.state.closed) return;
    this.adPending = true;
    void CrazyGames.rewardedAd(() => {
      this.adActive = true;
      this.paused = true;
      audio.pauseAll();
      CrazyGames.gameplayStop();
    }).then((finished) => {
      this.adPending = false;
      if (this.adActive) {
        this.adActive = false;
        this.paused = false;
        audio.resumeAll();
      }
      if (finished) this.state.reopen(true);
      else this.overlay.setSub('No ad available right now.\nYou can still reopen.');
    });
  }

  /** After the last level-up card: an ad is due from Lv 3 on; it runs at the next calm moment (see `runDueAd`). */
  private levelBreakAd(): void {
    if (this.state.level >= 3) this.adDue = true;
  }

  /** Runs a due ad only when nothing else is open: no pause, closed overlay, story card or level-up card. */
  private runDueAd(): void {
    if (!this.adDue || this.adActive || this.adPending) return;
    if (this.paused || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing) return;
    this.adDue = false;
    this.breakAd();
  }

  /** Android app: it went to the background or Back was pressed. Pauses like losing window focus; does nothing while a panel already holds the game. */
  pauseFromSystem(): void {
    if (this.scene.isActive()) this.onBlur();
  }

  /** What the Android Back button needs to know. */
  get backState(): { paused: boolean; closed: boolean; adActive: boolean } {
    return { paused: this.paused, closed: this.state.closed, adActive: this.adActive };
  }

  private onBlur(): void {
    if (this.adActive) return;
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
    this.input.keyboard?.off('keydown-B', this.openShop, this);
    this.input.keyboard?.off('keydown-R', this.openRecipeBook, this);
    this.input.keyboard?.off('keydown-T', this.openRestaurants, this);
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('dragstart', this.onDragStart, this);
    this.input.off('drag', this.onDrag, this);
    this.input.off('dragend', this.onDragEnd, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    animGuard.cancelAll();
    this.stations.destroy();
    this.stock.destroy();
    this.pours.destroy();
    this.hand.destroy();
    this.storyCard.destroy();
    this.fx.destroy();
    this.atmosphere?.destroy();
    this.atmosphere = undefined;
    this.items.clear();
    this.pourItems.clear();
    this.custViews.clear();
    this.views = [];
    audio.setSizzle(0);
    audio.stopMusic();
    CrazyGames.gameplayStop();
  }
}
