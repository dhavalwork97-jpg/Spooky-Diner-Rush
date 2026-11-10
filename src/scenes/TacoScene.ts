import Phaser from 'phaser';
import { fitBackground, logicalToNorm, type BackgroundPlacement } from '../kitchen/zones';
import { TacoKitchenState, type TacoEvent } from '../game/taco/TacoKitchenState';
import { defaultTacoConfig, type TacoZone } from '../game/taco/tacoConfig';
import { hitTestTaco, tapZone } from '../game/taco/tacoZones';
import { tacoRecipeEntries, TACO_BOOK_TIPS } from '../game/taco/tacoRecipes';
import { TACO_TUTORIAL_ID, nextTacoHint, tutorialDue } from '../game/taco/tacoTutorial';
import { titleEarnedAt } from '../game/career';
import { modsFor } from '../game/shop';
import type { RestaurantSelectData } from './RestaurantSelectScene';
import type { BookRow, RecipeBookData } from './RecipeBookScene';
import { SaveSystem } from '../systems/SaveSystem';
import { CrazyGames } from '../sdk/crazygames';
import { loadTacoArt, sheetKey, spriteKey, TacoViews } from '../views/TacoViews';
import { TacoCustomers } from '../views/TacoCustomers';
import { Hud } from '../views/Hud';
import { MenuButtons, type MenuKind } from '../views/MenuButtons';
import { MuteButton } from '../views/MuteButton';
import { EventBanner, LevelUpCard, Overlay, StoryCard, Toast } from '../views/Popups';
import { TacoTutorialView } from '../views/TacoTutorialView';
import { ParticlePool } from '../anim/ParticlePool';
import { arcTo, flyCoins } from '../anim/fly';
import { audio } from '../systems/AudioSystem';
import { sfxFor } from '../views/TacoSounds';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const SAVE_EVERY_MS = 5000;
/** Extra reach (0-1 of the art) for taps that miss every zone, so a finger can hit small zones. */
const TAP_SLOP = 0.025;
/** Save id for the one-time welcome card (the guided pointer has its own id, TACO_TUTORIAL_ID). */
const TACO_INTRO_ID = 'taco_intro_seen';

/** Sparkle colour when an ingredient lands on a plate. */
const INGREDIENT_COLOR: Record<string, number> = {
  tortilla_flour_tortillas: 0xf0d9a8,
  tortilla_corn_tortillas: 0xf2c75c,
  topping_lettuce: 0x7cc46b,
  topping_tomato_slices: 0xe2503c,
  topping_shredded_bowl: 0xa9d58a,
  topping_salsa_red_bowl: 0xd9382b,
  topping_crema: 0xfff4dc,
  topping_guacamole: 0x8cbf4a,
  cooler_cheese: 0xf7c93e,
  cooler_limes: 0x9fd356,
  steam_white_rice: 0xffffff,
  steam_beans: 0x8a5a3c,
  steam_jalapenos: 0x4f9a45,
};

type Drag = {
  plate: number;
  img: Phaser.GameObjects.Image;
  home: { x: number; y: number };
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  moved: boolean;
  zone: TacoZone;
  cup?: { drink: string; lane: number };
};

/**
 * The Taco Truck. The kitchen model (TacoKitchenState) runs the game; this scene is only the picture and the input.
 * It uses the SAME HUD, menu buttons, music button, popups and tutorial pointer as the Spooky Diner, so switching restaurants
 * only changes the kitchen, never the interface.
 */
export class TacoScene extends Phaser.Scene {
  private state!: TacoKitchenState;
  private bg!: BackgroundPlacement;
  private views!: TacoViews;
  private customers!: TacoCustomers;
  private fx!: ParticlePool;
  private hud!: Hud;
  private toast!: Toast;
  private banner!: EventBanner;
  private levelUpCard!: LevelUpCard;
  private overlay!: Overlay;
  private storyCard!: StoryCard;
  private menuButtons!: MenuButtons;
  private tutorial!: TacoTutorialView;
  private tutorialOn = false;
  /** A finished dish or full cup being dragged to a customer. */
  private drag: Drag | null = null;
  private lastSave = 0;
  private panelOpen = false;
  /** An ad is loading or playing: the truck is frozen (same idea as the diner's `paused`). */
  private adActive = false;
  private adPending = false;

  constructor() {
    super('Taco');
  }

  preload(): void {
    const a = defaultTacoConfig.art;
    this.load.image('taco_back', `${a.folder}/${a.back}.webp`);
    this.load.image('taco_front', `${a.folder}/${a.front}.webp`);
    loadTacoArt(this, defaultTacoConfig);
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.error(`Missing asset: ${file.key} (${file.url})`));
  }

  create(): void {
    this.panelOpen = false;
    this.drag = null;
    this.tutorialOn = false;
    this.adActive = false;
    this.adPending = false;
    const a = defaultTacoConfig.art;
    this.bg = fitBackground(LOGICAL_WIDTH, LOGICAL_HEIGHT, a.width, a.height);
    const layer = (key: string, depth: number) =>
      this.add.image(this.bg.x, this.bg.y, key).setOrigin(0, 0).setDisplaySize(this.bg.width, this.bg.height).setDepth(depth).setName(key);
    layer('taco_back', 0);
    layer('taco_front', 20);

    const save = SaveSystem.data;
    this.state = new TacoKitchenState({ level: save.level, xp: save.xp, coins: save.coins, menuStep: save.tacoStep, menuXp: save.tacoXp });
    this.state.mods = modsFor(this.state.cfg.upgrades.upgrades, save.owned);

    this.fx = new ParticlePool(this, 140);
    this.views = new TacoViews(this, this.bg, this.state, this.fx);
    this.customers = new TacoCustomers(this, this.bg, this.state);

    // The shared interface, built exactly as in the diner (same classes, same positions, same depths).
    this.hud = new Hud(this, this.state);
    this.toast = new Toast(this, LOGICAL_WIDTH / 2, 300);
    this.banner = new EventBanner(this, 551, 42);
    this.levelUpCard = new LevelUpCard(this, this.fx, LOGICAL_WIDTH / 2, 330);
    this.overlay = new Overlay(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.storyCard = new StoryCard(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    new MuteButton(this);
    this.menuButtons = new MenuButtons(this, (k: MenuKind) => this.openPanel(k === 'shop' ? 'Shop' : k === 'book' ? 'RecipeBook' : 'RestaurantSelect'));
    this.tutorial = new TacoTutorialView(this, LOGICAL_WIDTH, LOGICAL_HEIGHT, () => this.finishTutorial('Tutorial skipped. The Recipe Book shows every recipe.'));
    if (new URLSearchParams(location.search).has('debug')) this.drawZones();

    this.startTutorial();

    this.input.on('pointerdown', this.onTap, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onRelease, this);
    this.input.keyboard?.on('keydown-B', this.openShop, this);
    this.input.keyboard?.on('keydown-R', this.openBook, this);
    this.input.keyboard?.on('keydown-T', this.openRestaurants, this);
    this.lastSave = performance.now();
    CrazyGames.gameplayStart();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.exposeTestHooks();
  }

  /** First visit: a short welcome card, then the guided first dish. Each part is remembered in the save, so it is never repeated. */
  private startTutorial(): void {
    const save = SaveSystem.data;
    if (!tutorialDue(save.seenStory, this.state.menuStep)) return;
    const begin = (): void => {
      this.tutorialOn = true;
    };
    if (save.seenStory.includes(TACO_INTRO_ID)) return begin();
    save.seenStory.push(TACO_INTRO_ID);
    SaveSystem.save();
    this.storyCard.show(
      { id: TACO_INTRO_ID, title: 'Welcome to the Taco Truck!', text: "Tap raw food to cook it, build each dish on a plate, then drag it to the customer. Let's make your first one!" },
      begin,
    );
  }

  /** The guided dish is finished (or skipped): remember it and clear the pointer. */
  private finishTutorial(message: string): void {
    if (!this.tutorialOn) return;
    this.tutorialOn = false;
    this.tutorial.hide();
    const save = SaveSystem.data;
    if (!save.seenStory.includes(TACO_TUTORIAL_ID)) save.seenStory.push(TACO_TUTORIAL_ID);
    SaveSystem.save();
    this.toast.show(message);
  }

  override update(_time: number, delta: number): void {
    const real = Math.min(delta, 100) / 1000;
    if (!this.storyCard.isShowing && !this.adActive) this.state.update(real);
    for (const e of this.state.drainEvents()) this.handle(e);
    this.views.sync();
    this.customers.sync();
    this.hud.update(this.state, real);
    if (this.state.event) this.banner.update(this.state.event.remaining);
    this.followDrag(real);
    this.updateTutorial();

    const s = this.state;
    const cooking = s.pans.filter((p) => p && p.phase !== 'burnt').length + s.ovens.filter((o) => o && o.phase !== 'burnt').length;
    audio.setSizzle(this.panelOpen || s.closed ? 0 : Math.min(1, cooking / 2));
    if (performance.now() - this.lastSave > SAVE_EVERY_MS) this.saveNow();
  }

  // ---------------------------------------------------------------- events

  private handle(e: TacoEvent): void {
    const sfx = sfxFor(e);
    if (sfx) audio.play(sfx);
    switch (e.type) {
      case 'proteinStart': {
        const from = this.zoneSpot('protein', { arg: e.protein });
        const to = this.zoneSpot('pan', { index: e.pan });
        if (from && to) this.views.fly(spriteKey(`raw_${e.protein}`), undefined, from, to, 70, 300, 40);
        break;
      }
      case 'stepAdded': {
        const to = this.views.plateSpot(e.plate);
        if (!to) break;
        if (e.step.startsWith('protein:') && e.from?.pan !== undefined) {
          const from = this.zoneSpot('pan', { index: e.from.pan });
          if (from) this.views.fly(spriteKey(`cooked_${e.step.slice(8)}`), undefined, from, to, 70, 320, 50);
        }
        this.fx.burst(to.x, to.y, INGREDIENT_COLOR[e.step] ?? 0xffe08a, 7, 34, 380);
        break;
      }
      case 'dishDone': {
        const at = this.views.plateSpot(e.plate);
        if (at) this.fx.burst(at.x, at.y, 0xfff1b8, 10, 46, 520);
        break;
      }
      case 'discard':
      case 'burnt': {
        const where = e.where;
        const sp = where === 'pan' ? this.zoneSpot('pan', { index: e.index }) : where === 'oven' ? this.zoneSpot('oven', { index: e.index }) : where === 'plate' ? this.views.plateSpot(e.index) : null;
        if (sp) this.fx.burst(sp.x, sp.y, 0x9a9a9a, 6, 30, 350);
        if (e.type === 'burnt') this.toast.show('Burnt! Tap to throw it away');
        break;
      }
      case 'deliver': {
        const at = this.customers.centerOf(e.customer);
        if (at) this.fx.burst(at.x, at.y, 0xffffff, 6, 26, 320);
        break;
      }
      case 'orderDone': {
        this.customers.celebrate(e.customer);
        const at = this.customers.centerOf(e.customer);
        if (at) {
          this.floatText(e.customer, `+${e.coins + e.tip}`);
          flyCoins(this, this.hud.coinIcon, at, Math.min(6, 2 + Math.floor((e.coins + e.tip) / 25)));
        }
        this.saveNow();
        this.finishTutorial('You served your first order! The Recipe Book shows every recipe.');
        break;
      }
      case 'wrongDrop':
        if (e.customer !== null) this.customers.shake(e.customer);
        this.toast.show(e.penalty ? 'That is not what they ordered' : 'Drop it on a customer who ordered it');
        break;
      case 'comboChanged':
        this.hud.comboPop(e.combo);
        break;
      case 'eventStart':
        this.banner.show(e.name, e.duration);
        break;
      case 'eventEnd':
        this.banner.hide();
        break;
      case 'streakBonus':
        this.toast.show(`Streak bonus +${e.xp} XP`);
        break;
      case 'levelUp':
        this.hud.badgePop();
        this.levelUpCard.show(e.level, e.coins, e.unlocks, titleEarnedAt(this.state.cfg, e.level)?.title);
        this.saveNow();
        break;
      case 'menuGrew': {
        // A menu step often comes with a level-up: wait for that card, so the two never sit on top of each other.
        const msg = `New on the menu: ${e.added.join(', ')}`;
        if (this.levelUpCard.isShowing) this.time.delayedCall(2800, () => this.toast.show(msg));
        else this.toast.show(msg);
        break;
      }
      case 'closed':
        this.cancelDrag();
        this.banner.hide();
        audio.setSizzle(0);
        CrazyGames.gameplayStop();
        // The same Closed screen and buttons as the diner: Reopen (55 reputation) and, when an ad can play, the rewarded full reopen (100).
        // The reputation numbers live in the kitchen model's `reopen`; nothing is calculated here.
        this.overlay.show(
          'Closed',
          'Too many unhappy customers.\nYour level, XP and coins are safe.',
          'Reopen',
          () => this.breakAd(() => this.state.reopen()),
          CrazyGames.canShowRewarded() ? { label: 'Watch an ad: reopen at full reputation', onPress: () => this.reviveWithAd() } : undefined,
        );
        break;
      case 'reopened':
        this.overlay.hide();
        this.banner.hide();
        CrazyGames.gameplayStart();
        break;
      case 'invalid':
        this.toast.show(e.message);
        break;
    }
  }

  // ---------------------------------------------------------------- ads (same flow as the diner's Closed screen)

  /** The interstitial that comes before a normal Reopen. CrazyGames decides if one is shown (its own cooldown applies); `then` always runs. */
  private breakAd(then?: () => void): void {
    if (this.adActive || this.adPending) return;
    this.adPending = true;
    void CrazyGames.midgameAd(() => this.adStarted()).then((shown) => {
      this.adPending = false;
      if (shown) this.adEnded();
      then?.();
    });
  }

  /** Rewarded reopen: the full reopen is granted only after the ad finished. */
  private reviveWithAd(): void {
    if (this.adActive || this.adPending || !this.state.closed) return;
    this.adPending = true;
    void CrazyGames.rewardedAd(() => this.adStarted()).then((finished) => {
      this.adPending = false;
      if (this.adActive) this.adEnded();
      if (finished) this.state.reopen(true);
      else this.overlay.setSub('No ad available right now.\nYou can still reopen.');
    });
  }

  private adStarted(): void {
    this.adActive = true;
    audio.pauseAll();
    CrazyGames.gameplayStop();
  }

  private adEnded(): void {
    this.adActive = false;
    audio.resumeAll();
    if (!this.state.closed) CrazyGames.gameplayStart();
  }

  // ---------------------------------------------------------------- tutorial

  private updateTutorial(): void {
    if (!this.tutorialOn) return;
    const blocked = this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.drag !== null;
    const hint = blocked ? null : nextTacoHint(this.state);
    // While the player carries a dish the pointer steps aside; only the caption stays.
    if (this.drag && !blocked) return;
    this.tutorial.show(
      hint,
      (id) => {
        const z = this.state.taco.zones.find((q) => q.id === id);
        return z ? this.views.spot(z) : null;
      },
      (id) => this.customers.centerOf(id),
    );
  }

  // ---------------------------------------------------------------- input

  private onTap(p: Phaser.Input.Pointer, over: unknown[]): void {
    audio.unlock();
    audio.startMusic();
    if (over.length > 0 || this.adActive || this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing) return;
    if (window.innerWidth < 900 && window.innerHeight > window.innerWidth * 1.1) return; // the "rotate your device" screen is up
    const n = logicalToNorm(p.worldX, p.worldY, this.bg);
    const z = hitTestTaco(defaultTacoConfig.zones, n.x, n.y, TAP_SLOP);
    if (!z) return;
    // A finished dish on a plate is dragged to a customer instead of tapped.
    if (z.action === 'plate') {
      const item = this.state.plates[z.index ?? 0]?.item;
      if (item && !item.building && item.dish) {
        const d = this.state.dishDef(item.dish);
        if (d) return this.startDrag(z, p, { key: spriteKey(d.sprite), size: 90 }, z.index ?? 0);
      }
    }
    // A full cup is dragged from its dispenser to a customer; a half-filled cup cannot be picked up.
    if (z.action === 'cup') {
      const drink = this.state.taco.drinks.find((x) => x.id === z.arg);
      const lane = z.index ?? 0;
      if (drink && this.state.pourReady(drink.id, lane)) this.startDrag(z, p, { key: sheetKey('drink_cups'), frame: drink.sheetRow * 5 + 4, size: 110 }, -1, { drink: drink.id, lane });
      return;
    }
    this.views.tapFeedback(z);
    tapZone(this.state, z);
  }

  /** Pick up a dish or cup: it lifts off its spot and glides to the finger, so it never jumps. */
  private startDrag(z: TacoZone, p: Phaser.Input.Pointer, pic: { key: string; frame?: number; size: number }, plate: number, cup?: { drink: string; lane: number }): void {
    const home = this.views.spot(z);
    const img = this.add.image(home.x, home.y, pic.key, pic.frame).setDepth(50).setAlpha(0.95);
    const base = pic.size / (pic.frame !== undefined ? img.height : img.width);
    img.setScale(base);
    if (!SaveSystem.reduceMotion()) this.tweens.add({ targets: img, scale: base * 1.12, duration: 110, ease: 'Back.Out' });
    if (plate >= 0) this.views.setCarried(plate, true);
    this.drag = { plate, img, home: { x: home.x, y: home.y }, tx: p.worldX, ty: p.worldY, sx: p.worldX, sy: p.worldY, moved: false, zone: z, cup };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    d.tx = p.worldX;
    d.ty = p.worldY;
    if (Math.hypot(p.worldX - d.sx, p.worldY - d.sy) > 12) d.moved = true;
  }

  /** The carried picture eases towards the finger every frame (frame-rate independent). Without a drag move it stays on its spot. */
  private followDrag(dtSec: number): void {
    const d = this.drag;
    if (!d || !d.moved) return;
    const k = SaveSystem.reduceMotion() ? 1 : 1 - Math.pow(0.0004, dtSec);
    d.img.x += (d.tx - d.img.x) * k;
    d.img.y += (d.ty - d.img.y) * k;
  }

  private onRelease(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.moved) {
      // A tap, not a drag: the model answers "Drag it to a customer".
      this.endDrag(d);
      this.views.tapFeedback(d.zone);
      return tapZone(this.state, d.zone);
    }
    const target = this.customers.customerAt(p.worldX, p.worldY);
    const ok = target ? (d.cup ? this.state.serveFromPour(d.cup.drink, d.cup.lane, target.id) : this.state.serve(d.plate, target.id)) : false;
    const to = ok && target ? this.customers.centerOf(target.id) : null;
    if (to) {
      // Served: the dish flies the last bit into the customer and shrinks away.
      this.views.setCarried(d.plate, false);
      arcTo(this, d.img, to, 200, 24, () => this.endDrag(d));
      if (!SaveSystem.reduceMotion()) this.tweens.add({ targets: d.img, scale: d.img.scale * 0.5, alpha: 0.2, duration: 200 });
      return;
    }
    // Dropped on nothing or on the wrong customer: it glides back to where it came from.
    if (SaveSystem.reduceMotion()) return this.endDrag(d);
    this.tweens.add({ targets: d.img, x: d.home.x, y: d.home.y, duration: 190, ease: 'Quad.Out', onComplete: () => this.endDrag(d) });
  }

  private endDrag(d: Drag): void {
    this.tweens.killTweensOf(d.img);
    d.img.destroy();
    if (d.plate >= 0) this.views.setCarried(d.plate, false);
  }

  private cancelDrag(): void {
    const d = this.drag;
    this.drag = null;
    if (d) this.endDrag(d);
  }

  // ---------------------------------------------------------------- panels

  private openShop(): void {
    this.openPanel('Shop');
  }
  private openBook(): void {
    this.openPanel('RecipeBook');
  }
  private openRestaurants(): void {
    this.openPanel('RestaurantSelect');
  }

  /** Open the Shop, Recipe Book or restaurant list over the truck. The truck is paused until it closes. */
  private openPanel(key: 'Shop' | 'RecipeBook' | 'RestaurantSelect'): void {
    if (this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing) return;
    this.cancelDrag();
    this.tutorial.hide();
    audio.setSizzle(0);
    this.saveNow();
    this.panelOpen = true;
    const onClose = () => {
      this.panelOpen = false;
      this.state.mods = modsFor(this.state.cfg.upgrades.upgrades, SaveSystem.data.owned); // a Shop purchase counts straight away
      this.scene.resume();
    };
    const data: RestaurantSelectData & RecipeBookData = {
      state: this.state,
      current: defaultTacoConfig.restaurant.id,
      onClose,
      onPick: (id: string) => (id === defaultTacoConfig.restaurant.id ? this.scene.restart() : this.scene.start('Game', { restaurantId: id })),
      rows: key === 'RecipeBook' ? this.recipeRows() : undefined,
      tips: key === 'RecipeBook' ? TACO_BOOK_TIPS : undefined,
    };
    this.scene.launch(key, data);
    // The Taco scene is registered after the panels, so without this they would open underneath it.
    this.scene.bringToTop(key);
    this.scene.pause();
  }

  /** The Taco Truck's real recipes for the Recipe Book, straight from the kitchen's own data. */
  private recipeRows(): BookRow[] {
    return tacoRecipeEntries(this.state.taco, this.state.menuStep).map((e) => ({
      name: e.name,
      icon: e.kind === 'dish' ? { key: spriteKey(e.sprite!) } : { key: sheetKey('drink_cups'), frame: e.sheetRow! * 5 + 4 },
      stats: e.locked ? 'Coming to the menu soon' : `${e.price} coins   +${e.xp} XP`,
      steps: e.steps,
      locked: e.locked,
    }));
  }

  // ---------------------------------------------------------------- helpers

  private zoneSpot(action: TacoZone['action'], match: { arg?: string; index?: number }): { x: number; y: number } | null {
    const z = this.views.find(action, match);
    return z ? this.views.spot(z) : null;
  }

  private floatText(customerId: number, text: string): void {
    const at = this.customers.headOf(customerId);
    if (!at) return;
    const t = this.add.text(at.x, at.y - 40, text, { fontFamily: FONT, fontSize: '32px', color: '#FFE08A', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  private saveNow(): void {
    SaveSystem.data.level = this.state.level;
    SaveSystem.data.xp = this.state.xp;
    SaveSystem.data.coins = this.state.coins;
    SaveSystem.data.tacoStep = this.state.menuStep;
    SaveSystem.data.tacoXp = this.state.menuXp;
    SaveSystem.save();
    this.lastSave = performance.now();
  }

  private cleanup(): void {
    this.saveNow();
    this.input.off('pointerdown', this.onTap, this);
    this.input.off('pointermove', this.onMove, this);
    this.input.off('pointerup', this.onRelease, this);
    this.input.keyboard?.off('keydown-B', this.openShop, this);
    this.input.keyboard?.off('keydown-R', this.openBook, this);
    this.input.keyboard?.off('keydown-T', this.openRestaurants, this);
    this.cancelDrag();
    this.tutorial.destroy();
    this.storyCard.destroy();
    this.views.destroy();
    this.customers.destroy();
    this.fx.destroy();
    audio.setSizzle(0);
    audio.stopMusic();
    CrazyGames.gameplayStop();
  }

  /** ?debug: outline every tap zone. */
  private drawZones(): void {
    const g = this.add.graphics().setDepth(39);
    g.lineStyle(2, 0x00ff88, 0.9);
    for (const z of defaultTacoConfig.zones) g.strokeRect(this.bg.x + z.x * this.bg.width, this.bg.y + z.y * this.bg.height, z.width * this.bg.width, z.height * this.bg.height);
  }

  /** Test hooks, only when the page is opened with ?test (like the diner's). */
  private exposeTestHooks(): void {
    if (!new URLSearchParams(location.search).has('test')) return;
    (window as unknown as { __taco?: unknown }).__taco = {
      state: this.state,
      tap: (id: string) => {
        const z = this.state.taco.zones.find((q) => q.id === id);
        if (z) tapZone(this.state, z);
      },
      menuButtons: () => this.menuButtons.positions(),
      openShop: () => this.openShop(),
      openRecipeBook: () => this.openBook(),
      openRestaurants: () => this.openRestaurants(),
      tutorialOn: () => this.tutorialOn,
      hint: () => nextTacoHint(this.state),
      spot: (id: string) => {
        const z = this.state.taco.zones.find((q) => q.id === id);
        return z ? this.views.spot(z) : null;
      },
      customerCenter: (id: number) => this.customers.centerOf(id),
      toast: () => (this.toast.visible ? this.toast.message : ''),
      overlay: () => this.overlay.visible,
      story: () => this.storyCard.id,
    };
  }
}
