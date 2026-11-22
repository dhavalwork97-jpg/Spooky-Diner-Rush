import Phaser from 'phaser';
import { fitBackground, logicalToNorm, type BackgroundPlacement } from '../kitchen/zones';
import { PizzaKitchenState, type PizzaEvent } from '../game/pizza/PizzaKitchenState';
import { defaultPizzaConfig, type PizzaZone } from '../game/pizza/pizzaConfig';
import { hitTestPizza, tapPizzaZone } from '../game/pizza/pizzaZones';
import { PIZZA_TUTORIAL_ID, nextPizzaHint, pizzaRecipeIntro, pizzaTutorialDue } from '../game/pizza/pizzaTutorial';
import { lessonDone, lessonMode, lessonShown, seedPizzaLearned } from '../game/pizza/pizzaLearning';
import { pizzaModsFor } from '../game/pizza/pizzaShop';
import { clampPizzaStep } from '../game/pizza/pizzaMenu';
import { recipeSteps } from '../game/pizza/pizzaRecipes';
import { titleEarnedAt } from '../game/career';
import type { RestaurantSelectData } from './RestaurantSelectScene';
import type { BookRow, RecipeBookData } from './RecipeBookScene';
import { startRestaurant, PIZZA_ID } from './restaurantRoute';
import { SaveSystem } from '../systems/SaveSystem';
import { CrazyGames } from '../sdk/crazygames';
import { iconFrame, loadPizzaArt, PizzaViews } from '../views/PizzaViews';
import { PizzaCustomers } from '../views/PizzaCustomers';
import { Hud } from '../views/Hud';
import { Ring } from '../views/Ring';
import { MenuButtons, type MenuKind } from '../views/MenuButtons';
import { MuteButton } from '../views/MuteButton';
import { EventBanner, LevelUpCard, Overlay, StoryCard, Toast } from '../views/Popups';
import { TacoTutorialView } from '../views/TacoTutorialView';
import { ParticlePool } from '../anim/ParticlePool';
import { flyCoins } from '../anim/fly';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const SAVE_EVERY_MS = 5000;
/** Extra reach (0-1 of the art) for taps that miss every zone, so a finger can hit small zones. */
const TAP_SLOP = 0.025;
const PIZZA_INTRO_ID = 'pizza_intro_seen';

/**
 * The Pizza Place. The kitchen model (PizzaKitchenState) runs the game; this scene is only the picture and the input.
 * It uses the SAME HUD, menu buttons, music button, popups and tutorial pointer as the Spooky Diner and the Taco Truck, so switching restaurants
 * only changes the kitchen, never the interface. Every station answers a tap: dough, sauces, cheeses and toppings build a pizza on one of three boards,
 * tap the pizza to finish it and again to bake it, tap the oven to take it out, tap the pizza to serve it.
 */
export class PizzaScene extends Phaser.Scene {
  private state!: PizzaKitchenState;
  private bg!: BackgroundPlacement;
  private views!: PizzaViews;
  private customers!: PizzaCustomers;
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
  private lesson: { dish: string; mode: 'full' | 'reminder'; active: boolean } | null = null;
  /** ?debug&speed=N: time runs N times faster (testing only). */
  private speed = 1;
  private lessonPauseUntil = 0;
  private lastSave = 0;
  private panelOpen = false;
  private adActive = false;
  private adPending = false;
  /** Set when ?debug flags changed the numbers: nothing is written to the save, and the original save is put back when the scene ends. */
  private debugBackup: string | null = null;

  constructor() {
    super('Pizza');
  }

  preload(): void {
    const a = defaultPizzaConfig.art;
    this.load.image('pizza_back', `${a.folder}/${a.back}.webp`);
    this.load.image('pizza_front', `${a.folder}/${a.front}.webp`);
    loadPizzaArt(this);
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.error(`Missing asset: ${file.key} (${file.url})`));
  }

  create(): void {
    const q = new URLSearchParams(location.search);
    const debug = q.has('debug');
    // Not bought yet (and not a debug session): back to the diner instead of opening a restaurant the player does not own.
    if (!debug && !SaveSystem.data.restaurants.includes(PIZZA_ID)) {
      this.scene.start('Game', { restaurantId: 'burger_diner' });
      return;
    }
    this.panelOpen = false;
    this.tutorialOn = false;
    this.lesson = null;
    this.lessonPauseUntil = 0;
    this.adActive = false;
    this.adPending = false;
    const a = defaultPizzaConfig.art;
    this.bg = fitBackground(LOGICAL_WIDTH, LOGICAL_HEIGHT, a.width, a.height);
    const layer = (key: string, depth: number) => this.add.image(this.bg.x, this.bg.y, key).setOrigin(0, 0).setDisplaySize(this.bg.width, this.bg.height).setDepth(depth).setName(key);
    layer('pizza_back', 0);
    layer('pizza_front', 20);

    const save = SaveSystem.data;
    this.state = new PizzaKitchenState({ level: save.level, xp: save.xp, coins: save.coins, menuStep: save.pizzaStep, menuXp: save.pizzaXp, pizzaServed: save.pizzaServed });
    // The Pizza Place uses its own upgrades only (the diner's and the truck's shop upgrades do not carry over).
    this.state.mods = pizzaModsFor(defaultPizzaConfig.upgrades, save.pizzaOwned);
    this.applyDebugFlags();

    this.fx = new ParticlePool(this, 140);
    this.views = new PizzaViews(this, this.bg, this.state, this.fx, (x, y, r) => new Ring(this, x, y, r, true));
    this.customers = new PizzaCustomers(this, this.bg, this.state);

    this.hud = new Hud(this, this.state);
    this.toast = new Toast(this, LOGICAL_WIDTH / 2, 300);
    this.banner = new EventBanner(this, 551, 42);
    this.levelUpCard = new LevelUpCard(this, this.fx, LOGICAL_WIDTH / 2, 330);
    this.overlay = new Overlay(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.storyCard = new StoryCard(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    new MuteButton(this);
    this.menuButtons = new MenuButtons(this, (k: MenuKind) => this.openPanel(k === 'shop' ? 'Shop' : k === 'book' ? 'RecipeBook' : 'RestaurantSelect'));
    this.tutorial = new TacoTutorialView(this, LOGICAL_WIDTH, LOGICAL_HEIGHT, () => (this.lesson ? this.endLesson(false) : this.finishTutorial('Tutorial skipped. The Recipe Book shows every recipe.')));
    if (debug && !q.has('nozones')) this.drawZones();

    this.startTutorial();

    this.input.on('pointerdown', this.onTap, this);
    this.input.keyboard?.on('keydown-B', this.openShop, this);
    this.input.keyboard?.on('keydown-R', this.openBook, this);
    this.input.keyboard?.on('keydown-T', this.openRestaurants, this);
    this.lastSave = performance.now();
    CrazyGames.gameplayStart();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.exposeTestHooks();
  }

  // ---------------------------------------------------------------- first visit

  private startTutorial(): void {
    const save = SaveSystem.data;
    if (!pizzaTutorialDue(save.seenStory, this.state.menuStep)) return;
    const begin = (): void => {
      this.tutorialOn = true;
    };
    if (save.seenStory.includes(PIZZA_INTRO_ID)) return begin();
    save.seenStory.push(PIZZA_INTRO_ID);
    this.saveNow();
    this.storyCard.show({ id: PIZZA_INTRO_ID, title: 'Welcome to the Pizza Place!', text: "Tap the dough, add sauce and cheese, then bake it in the oven. Let's make your first pizza!" }, begin);
  }

  private finishTutorial(message: string, finished = false): void {
    if (!this.tutorialOn) return;
    this.tutorialOn = false;
    this.tutorial.hide();
    const save = SaveSystem.data;
    if (!save.seenStory.includes(PIZZA_TUTORIAL_ID)) save.seenStory.push(PIZZA_TUTORIAL_ID);
    for (const d of this.state.pizza.dishes.filter((x) => x.unlockStep <= 1)) save.pizzaLessons = finished ? lessonDone(save.pizzaLessons, d.id) : lessonShown(save.pizzaLessons, d.id);
    this.saveNow();
    this.toast.show(message);
  }

  override update(_time: number, delta: number): void {
    if (!this.state) return;
    const real = Math.min(delta, 100) / 1000;
    if (!this.storyCard.isShowing && !this.adActive) this.state.update(real * this.speed);
    for (const e of this.state.drainEvents()) this.handle(e);
    this.views.sync();
    this.customers.sync();
    this.hud.update(this.state, real);
    if (this.state.event) this.banner.update(this.state.event.remaining);
    this.updateTutorial();
    this.updateLesson();
    const s = this.state;
    const cooking = s.ovens.filter((o) => o && o.phase !== 'burnt').length + s.fryer.filter((f) => f && f.phase !== 'burnt').length + s.smallOven.filter((o) => o && o.phase !== 'burnt').length;
    audio.setSizzle(this.panelOpen || s.closed ? 0 : Math.min(1, cooking / 2));
    if (performance.now() - this.lastSave > SAVE_EVERY_MS) this.saveNow();
  }

  // ---------------------------------------------------------------- events

  private spotOf(e: { board: number }): { x: number; y: number } | null {
    return this.views.boardSpot(e.board);
  }

  private handle(e: PizzaEvent): void {
    switch (e.type) {
      case 'boardStart':
      case 'ingredient': {
        const at = this.spotOf(e);
        if (at) this.fx.burst(at.x, at.y, e.type === 'ingredient' ? 0xffe08a : 0xf0d9a8, 6, 34, 380);
        this.views.boardPop(e.board);
        audio.play('pop');
        break;
      }
      case 'pizzaBuilt': {
        const at = this.spotOf(e);
        if (at) this.fx.burst(at.x, at.y, 0xfff1b8, 10, 46, 520);
        break;
      }
      case 'ovenStart':
        audio.play('click');
        break;
      case 'ovenFull':
        this.views.ovenFullShake();
        break;
      case 'wobble':
        this.views.wobble(e.where, e.index);
        break;
      case 'collect': {
        const at = this.views.ovenSlotSpot(e.slot);
        if (at) this.fx.burst(at.x, at.y, 0xfff1b8, 8, 40, 450);
        audio.play('pop');
        break;
      }
      case 'discard':
      case 'burnt': {
        const sp = e.where === 'board' ? this.views.boardSpot(e.index) : e.where === 'oven' ? this.views.ovenSlotSpot(e.index) : null;
        if (sp) this.fx.burst(sp.x, sp.y, 0x9a9a9a, 6, 30, 350);
        if (e.type === 'burnt') this.toast.show('Burnt! Tap to throw it away');
        break;
      }
      case 'deliver': {
        const at = this.customers.centerOf(e.customer);
        if (at) this.fx.burst(at.x, at.y, 0xffffff, 6, 26, 320);
        audio.play('pop');
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
        this.finishTutorial('You served your first order! The Recipe Book shows every recipe.', true);
        break;
      }
      case 'recipeServed':
        this.onRecipeServed(e.dish, e.learned);
        break;
      case 'wrongDrop':
        if (e.customer !== null) this.customers.shake(e.customer);
        if (e.penalty) this.toast.show('That is not what they ordered');
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
        const msg = `New on the menu: ${e.added.join(', ')}`;
        if (this.levelUpCard.isShowing) this.time.delayedCall(2800, () => this.toast.show(msg));
        else this.toast.show(msg);
        this.saveNow();
        break;
      }
      case 'closed':
        this.endLesson(false, true);
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
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- ads (same flow as the diner's and the truck's Closed screen; no new placement)

  private breakAd(then?: () => void): void {
    if (this.adActive || this.adPending) return;
    this.adPending = true;
    void CrazyGames.midgameAd(() => this.adStarted()).then((shown) => {
      this.adPending = false;
      if (shown) this.adEnded();
      then?.();
    });
  }

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

  // ---------------------------------------------------------------- tutorial and lessons

  private updateTutorial(): void {
    const lesson = this.lesson?.active ? this.lesson.dish : undefined;
    if (!this.tutorialOn && lesson === undefined) return;
    const blocked = this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing;
    const hint = blocked ? null : nextPizzaHint(this.state, lesson);
    this.tutorial.show(
      hint,
      (id) => {
        const z = defaultPizzaConfig.zones.find((q) => q.id === id);
        return z ? this.zoneSpot(z) : null;
      },
      (id) => this.customers.centerOf(id),
    );
  }

  private zoneSpot(z: PizzaZone): { x: number; y: number; w: number; h: number } {
    const c = this.views.spot(z);
    return { x: c.x, y: c.y, w: z.width * this.bg.width, h: z.height * this.bg.height };
  }

  private lessonBlocked(): boolean {
    return this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing || this.adActive;
  }

  private updateLesson(): void {
    const s = this.state;
    if (this.lesson) {
      const stillWanted = s.customers.some((c) => c.mood === 'waiting' && c.items.some((k, i) => k === this.lesson!.dish && !c.delivered[i]));
      if (!stillWanted && this.lesson.active) this.endLesson(false);
      return;
    }
    if (this.tutorialOn || this.lessonBlocked() || this.time.now < this.lessonPauseUntil) return;
    for (const c of s.customers) {
      if (c.mood !== 'waiting') continue;
      for (let i = 0; i < c.items.length; i++) {
        const id = c.items[i];
        if (c.delivered[i] || !s.dishDef(id) || s.familiarity(id) === 'normal') continue;
        const mode = lessonMode(SaveSystem.data.pizzaLessons, id);
        if (mode) return this.beginLesson(id, mode);
      }
    }
  }

  private beginLesson(dish: string, mode: 'full' | 'reminder'): void {
    const def = this.state.dishDef(dish);
    if (!def) return;
    SaveSystem.data.pizzaLessons = lessonShown(SaveSystem.data.pizzaLessons, dish);
    this.saveNow();
    this.lesson = { dish, mode, active: mode === 'reminder' };
    if (mode === 'reminder') return void this.toast.show(`Quick reminder: ${def.name}`);
    const intro = pizzaRecipeIntro(this.state.pizza, def);
    this.storyCard.show({ id: `pizza_recipe_${dish}`, ...intro }, () => {
      if (this.lesson?.dish === dish) this.lesson.active = true;
    });
  }

  private endLesson(done: boolean, silent = false): void {
    const l = this.lesson;
    if (!l) return;
    this.lesson = null;
    this.lessonPauseUntil = this.time.now + 90_000;
    this.tutorial.hide();
    if (done) {
      SaveSystem.data.pizzaLessons = lessonDone(SaveSystem.data.pizzaLessons, l.dish);
      this.toast.show(`${this.state.dishDef(l.dish)?.name ?? 'Recipe'} learned!`);
    } else if (!silent && l.active) this.toast.show('The Recipe Book shows every recipe.');
    this.saveNow();
  }

  private onRecipeServed(dish: string, learned: boolean): void {
    if (this.lesson?.dish === dish) this.endLesson(true);
    if (learned && !this.lesson) this.saveNow();
  }

  // ---------------------------------------------------------------- input

  private onTap(p: Phaser.Input.Pointer, over: unknown[]): void {
    audio.unlock();
    audio.startMusic();
    if (over.length > 0 || this.adActive || this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing) return;
    if (window.innerWidth < 900 && window.innerHeight > window.innerWidth * 1.1) return; // the "rotate your device" screen is up
    const n = logicalToNorm(p.worldX, p.worldY, this.bg);
    const z = hitTestPizza(defaultPizzaConfig.zones, n.x, n.y, TAP_SLOP);
    if (!z) return;
    this.views.tapFeedback(z);
    tapPizzaZone(this.state, z);
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

  private openPanel(key: 'Shop' | 'RecipeBook' | 'RestaurantSelect'): void {
    if (this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing) return;
    this.tutorial.hide();
    audio.setSizzle(0);
    this.saveNow();
    this.panelOpen = true;
    const onClose = () => {
      this.panelOpen = false;
      this.state.mods = pizzaModsFor(defaultPizzaConfig.upgrades, SaveSystem.data.pizzaOwned); // a Shop purchase counts straight away
      this.scene.resume();
    };
    const data: RestaurantSelectData & RecipeBookData & { pizza?: { menuStep: number } } = {
      state: this.state,
      pizza: key === 'Shop' ? { menuStep: this.state.menuStep } : undefined,
      current: PIZZA_ID,
      onClose,
      onPick: (id: string) => (id === PIZZA_ID ? this.scene.restart() : startRestaurant(this, id)),
      rows: key === 'RecipeBook' ? this.recipeRows() : undefined,
      tips: key === 'RecipeBook' ? 'Tap the dough, then a sauce, a cheese and toppings. Tap the pizza to finish it, again to bake it. Take it out when the ring turns green, then tap it to serve.' : undefined,
    };
    this.scene.launch(key, data);
    this.scene.bringToTop(key);
    this.scene.pause();
  }

  /** The Pizza Place's real recipes for the Recipe Book: available, still locked (with the menu step that unlocks them) and the learning state. */
  private recipeRows(): BookRow[] {
    const p = this.state.pizza;
    return p.dishes.map((d) => {
      const locked = d.unlockStep > this.state.menuStep;
      const f = iconFrame(d);
      const steps = d.kind === 'pizza' ? recipeSteps(d).map((id) => (id === 'dough' ? 'dough' : (p.stepLabels[id] ?? id).replace(/^an? /, ''))) : [d.kind === 'side' ? 'small oven' : d.kind === 'fried' ? 'fryer' : 'ice cream machine'];
      const learning = !locked && this.state.familiarity(d.id) !== 'normal' ? '   (learning)' : '';
      return {
        name: d.name,
        icon: { key: f.atlas, frame: f.frame as unknown as number },
        stats: locked ? `Unlocks at Pizza menu step ${d.unlockStep}` : `${d.price} coins   +${d.xp} XP${learning}`,
        steps,
        locked,
      };
    });
  }

  // ---------------------------------------------------------------- helpers

  private floatText(customerId: number, text: string): void {
    const at = this.customers.headOf(customerId);
    if (!at) return;
    const t = this.add.text(at.x, at.y - 40, text, { fontFamily: FONT, fontSize: '32px', color: '#FFE08A', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  private saveNow(): void {
    if (this.debugBackup !== null) return; // a ?debug session with changed numbers never writes
    SaveSystem.data.level = this.state.level;
    SaveSystem.data.xp = this.state.xp;
    SaveSystem.data.coins = this.state.coins;
    SaveSystem.data.pizzaStep = this.state.menuStep;
    SaveSystem.data.pizzaXp = this.state.menuXp;
    SaveSystem.data.pizzaServed = { ...this.state.dishServes };
    SaveSystem.save();
    this.lastSave = performance.now();
  }

  private cleanup(): void {
    if (this.debugBackup !== null) {
      // Put the real save back exactly as it was before the debug flags changed anything in memory.
      Object.assign(SaveSystem.data, JSON.parse(this.debugBackup));
      this.debugBackup = null;
    } else if (this.state) this.saveNow();
    this.input.off('pointerdown', this.onTap, this);
    this.input.keyboard?.off('keydown-B', this.openShop, this);
    this.input.keyboard?.off('keydown-R', this.openBook, this);
    this.input.keyboard?.off('keydown-T', this.openRestaurants, this);
    this.tutorial?.destroy();
    this.storyCard?.destroy();
    this.views?.destroy();
    this.customers?.destroy();
    this.fx?.destroy();
    audio.setSizzle(0);
    audio.stopMusic();
    CrazyGames.gameplayStop();
  }

  /**
   * Development test mode (only with ?debug&pizza): ?step=N jumps the Pizza menu to step N (every older dish already learned), ?coins=N sets coins,
   * ?level=N the global Lv, ?speed=N (up to 8) runs time faster. These change the running game only: nothing is written to the save while they are used,
   * and the real save is restored when the scene ends. Nothing here runs in a normal game.
   */
  private applyDebugFlags(): void {
    const q = new URLSearchParams(location.search);
    if (!q.has('debug')) return;
    const num = (k: string): number | null => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
    const step = num('step');
    const coins = num('coins');
    const level = num('level');
    if (step !== null || coins !== null || level !== null) this.debugBackup = JSON.stringify(SaveSystem.data);
    if (step !== null) {
      this.state.menuStep = clampPizzaStep(step);
      this.state.menuXp = 0;
      const seeded = seedPizzaLearned(this.state.pizza, this.state.menuStep);
      this.state.dishServes = seeded.served;
      SaveSystem.data.pizzaLessons = seeded.lessons;
      if (this.state.menuStep > 1 && !SaveSystem.data.seenStory.includes(PIZZA_TUTORIAL_ID)) SaveSystem.data.seenStory.push(PIZZA_TUTORIAL_ID);
    }
    if (coins !== null) this.state.coins = Math.max(0, Math.floor(coins));
    if (level !== null) this.state.level = Math.max(1, Math.floor(level));
    this.speed = Math.max(1, Math.min(8, num('speed') ?? 1));
  }

  private drawZones(): void {
    const g = this.add.graphics().setDepth(39);
    g.lineStyle(2, 0x00ff88, 0.9);
    for (const z of defaultPizzaConfig.zones) g.strokeRect(this.bg.x + z.x * this.bg.width, this.bg.y + z.y * this.bg.height, z.width * this.bg.width, z.height * this.bg.height);
  }

  /** Test hooks, only when the page is opened with ?test (like the diner's and the truck's). */
  private exposeTestHooks(): void {
    if (!new URLSearchParams(location.search).has('test')) return;
    (window as unknown as { __pizza?: unknown }).__pizza = {
      state: this.state,
      tap: (id: string) => {
        const z = defaultPizzaConfig.zones.find((q) => q.id === id);
        if (z) tapPizzaZone(this.state, z);
      },
      spot: (id: string) => {
        const z = defaultPizzaConfig.zones.find((q) => q.id === id);
        return z ? this.zoneSpot(z) : null;
      },
      menuButtons: () => this.menuButtons.positions(),
      openShop: () => this.openShop(),
      openRecipeBook: () => this.openBook(),
      openRestaurants: () => this.openRestaurants(),
      tutorialOn: () => this.tutorialOn,
      hint: () => nextPizzaHint(this.state, this.lesson?.active ? this.lesson.dish : undefined),
      customerCenter: (id: number) => this.customers.centerOf(id),
      toast: () => (this.toast.visible ? this.toast.message : ''),
      overlay: () => this.overlay.visible,
      story: () => this.storyCard.id,
      storyShowing: () => this.storyCard.isShowing,
      closeStory: () => this.storyCard.isShowing && this.input.keyboard?.emit('keydown-ENTER'),
    };
  }
}
