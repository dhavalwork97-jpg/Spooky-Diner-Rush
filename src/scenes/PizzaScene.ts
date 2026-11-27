import { pizzaMasteryDue, pizzaMasteryGrid, pizzaMasteryTiers, pizzaPaidAfter } from '../game/pizza/pizzaExtras';
import { withChoices } from '../game/choices';
import { DailyGoalPlate } from '../views/DailyGoalPlate';
import { DailyGoalSystem } from '../systems/DailyGoalSystem';
import { defaultExtras, localDateKey } from '../game/extras';
import { parseCustom } from '../game/pizza/pizzaCustom';
import Phaser from 'phaser';
import { fitBackground, logicalToNorm, type BackgroundPlacement } from '../kitchen/zones';
import { PizzaKitchenState, type PizzaEvent } from '../game/pizza/PizzaKitchenState';
import { defaultPizzaConfig, type PizzaZone } from '../game/pizza/pizzaConfig';
import { hitTestPizza, tapPizzaZone } from '../game/pizza/pizzaZones';
import { PIZZA_TUTORIAL_ID, nextPizzaHint, pizzaRecipeIntro, pizzaTutorialDue } from '../game/pizza/pizzaTutorial';
import { lessonDone, lessonMode, lessonShown, seedPizzaLearned } from '../game/pizza/pizzaLearning';
import { pizzaModsFor } from '../game/pizza/pizzaShop';
import { clampPizzaStep, pizzaMilestones, pizzaStepXpNeeded } from '../game/pizza/pizzaMenu';
import { recipeSteps } from '../game/pizza/pizzaRecipes';
import { titleEarnedAt } from '../game/career';
import type { RestaurantSelectData } from './RestaurantSelectScene';
import type { BookRow, MasteryBookData, RecipeBookData } from './RecipeBookScene';
import { startRestaurant, PIZZA_ID } from './restaurantRoute';
import { SaveSystem } from '../systems/SaveSystem';
import { CrazyGames } from '../sdk/crazygames';
import { iconFrame, loadPizzaArt, PizzaViews } from '../views/PizzaViews';
import { PizzaTickets } from '../views/PizzaTickets';
import { PizzaCustomers } from '../views/PizzaCustomers';
import { GoalBanner, Hud } from '../views/Hud';
import { PizzaGoalTracker, toPizzaGoalEvent, type PizzaGoalEnv } from '../game/pizza/pizzaGoals';
import { unlockedDishes } from '../game/pizza/pizzaConfig';
import { Ring } from '../views/Ring';
import { MenuButtons, type MenuKind } from '../views/MenuButtons';
import { MuteButton } from '../views/MuteButton';
import { EventBanner, LevelUpCard, Overlay, StoryCard, Toast } from '../views/Popups';
import { TacoTutorialView } from '../views/TacoTutorialView';
import { ParticlePool } from '../anim/ParticlePool';
import { arcTo, flyCoins } from '../anim/fly';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const SAVE_EVERY_MS = 5000;
/** Extra reach (0-1 of the art) for taps that miss every zone, so a finger can hit small zones. */
const TAP_SLOP = 0.025;
const PIZZA_INTRO_ID = 'pizza_intro_seen';

/** A ready dish being dragged to a customer. `from` says where it comes from, so the model serves the right thing. */
type DragFrom = { kind: 'board'; index: number } | { kind: 'small' | 'fryer'; index: number } | { kind: 'ice'; index: number } | { kind: 'plate'; index: number };
type Drag = { from: DragFrom; img: Phaser.GameObjects.Image; home: { x: number; y: number }; tx: number; ty: number; sx: number; sy: number; moved: boolean; zone: PizzaZone };

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
  private tickets!: PizzaTickets;
  private dailyPlate!: DailyGoalPlate;
  private goals!: PizzaGoalTracker;
  private goalBanner!: GoalBanner;
  private goalToasts: string[] = [];
  private fx!: ParticlePool;
  private hud!: Hud;
  private toast!: Toast;
  private banner!: EventBanner;
  private levelUpCard!: LevelUpCard;
  private overlay!: Overlay;
  private storyCard!: StoryCard;
  private menuButtons!: MenuButtons;
  private tutorial!: TacoTutorialView;
  private customToasts = 0;
  /** The player's calendar day when this visit started (for the Daily Special). */
  private dayKey = '';
  private tutorialOn = false;
  private lesson: { dish: string; mode: 'full' | 'reminder'; active: boolean } | null = null;
  /** ?debug&speed=N: time runs N times faster (testing only). */
  private speed = 1;
  private lessonPauseUntil = 0;
  private lastSave = 0;
  /** A ready dish being dragged to a customer. */
  private drag: Drag | null = null;
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
    this.drag = null;
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
    this.state.mods = withChoices(pizzaModsFor(defaultPizzaConfig.upgrades, save.pizzaOwned), 'pizza', save.choices, this.state.level);
    this.applyDebugFlags();
    this.dayKey = localDateKey();
    this.state.enableSpecial(this.dayKey, save.pizzaSpecialDay === this.dayKey);

    this.fx = new ParticlePool(this, 140);
    this.views = new PizzaViews(this, this.bg, this.state, this.fx, (x, y, r) => new Ring(this, x, y, r, true));
    this.customers = new PizzaCustomers(this, this.bg, this.state);
    this.tickets = new PizzaTickets(this, this.state);

    this.hud = new Hud(this, this.state);
    this.toast = new Toast(this, LOGICAL_WIDTH / 2, 300);
    this.banner = new EventBanner(this, 551, 42);
    this.dailyPlate = new DailyGoalPlate(this);
    this.goals = new PizzaGoalTracker(Date.now());
    this.goalBanner = new GoalBanner(this, 640, 170);
    this.goalToasts = [];
    this.levelUpCard = new LevelUpCard(this, this.fx, LOGICAL_WIDTH / 2, 330);
    this.overlay = new Overlay(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.storyCard = new StoryCard(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    new MuteButton(this);
    this.menuButtons = new MenuButtons(this, (k: MenuKind) => this.openPanel(k === 'shop' ? 'Shop' : k === 'book' ? 'RecipeBook' : 'RestaurantSelect'), this.state.menuStep > SaveSystem.data.pizzaBookSeenStep);
    this.tutorial = new TacoTutorialView(this, LOGICAL_WIDTH, LOGICAL_HEIGHT, () => (this.lesson ? this.endLesson(false) : this.finishTutorial('Tutorial skipped. The Recipe Book shows every recipe.')));
    if (debug && !q.has('nozones')) this.drawZones();

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
    this.storyCard.show({ id: PIZZA_INTRO_ID, title: 'Welcome to the Pizza Place!', text: "Tap the dough, add sauce and cheese, bake it in the oven, then drag it to the customer. Let's make your first pizza!" }, begin);
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
    this.tickets.sync();
    this.followDrag(real);
    this.hud.update(this.state, real);
    this.updateGoals(real);
    this.dailyPlate.update(DailyGoalSystem.progress(), { dtMs: real * 1000, claimed: DailyGoalSystem.claimed, blocked: this.lessonBlocked() || this.tutorialOn });
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
    this.countGoal(e);
    switch (e.type) {
      case 'boardStart':
      case 'ingredient': {
        const at = this.spotOf(e);
        if (at) this.fx.burst(at.x, at.y, e.type === 'ingredient' ? 0xffe08a : 0xf0d9a8, 6, 34, 380);
        if (e.type === 'boardStart') this.views.rollDough(e.board);
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
      case 'plated':
        audio.play('pop');
        this.toast.show('On the plate. Tap it, or drag it to a customer');
        break;
      case 'deliver': {
        const at = this.customers.centerOf(e.customer);
        if (at) this.fx.burst(at.x, at.y, 0xffffff, 6, 26, 320);
        audio.play('pop');
        break;
      }
      case 'customOrder': {
        // The first few build-your-own orders say what is on them, in words, since the icons are small.
        const r = parseCustom(e.dish);
        if (r && this.customToasts < 3) {
          this.customToasts++;
          const label = (st: string) => this.state.pizza.stepLabels[st] ?? st;
          this.toast.show(`Custom pizza: ${[`sauce:${r.sauce}`, `cheese:${r.cheese}`, ...r.toppings.map((t) => `topping:${t}`)].map(label).join(', ')}`);
        }
        break;
      }
      case 'perfectBake':
        this.views.sparkle(e.where, e.index);
        break;
      case 'arrive': {
        const sc = this.state.customers.find((c) => c.id === e.customer);
        if (sc?.special) this.toast.show(`Pizza of the day: ${this.state.dishDef(sc.items[0])?.name ?? 'pizza'}! +${Math.round(defaultExtras.dailySpecial.bonus * 100)}% coins`);
        break;
      }
      case 'comboMeal': {
        // Small popup above the customer, same floating-text style as the coins; the +coins text follows from orderDone.
        const head = this.customers.headOf(e.customer);
        if (head) this.popup(head.x, head.y - 84, 'Combo meal');
        break;
      }
      case 'orderDone': {
        {
          const bonus = DailyGoalSystem.record('pizza_place');
          if (bonus > 0) {
            this.state.coins += bonus;
            this.toast.show(`Daily goal complete! +${bonus} coins`);
          }
        }
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
        this.payMastery();
        break;
      case 'specialDone': {
        const at = this.customers.headOf(e.customer);
        if (at) this.popup(at.x, at.y - 120, `Pizza of the day! +${e.bonus}`);
        this.saveNow();
        break;
      }
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
      case 'ticketsStart':
        this.toast.show(`Delivery Rush! ${e.tickets.length} takeout pizzas`);
        break;
      case 'ticketDone': {
        const at = this.tickets.centerOf(e.ticket);
        if (at) {
          this.fx.burst(at.x + 80, at.y, 0xffe08a, 8, 30, 380);
          this.popup(at.x + 150, at.y, `+${e.coins}`);
        }
        audio.play('pop');
        break;
      }
      case 'rushComplete':
        this.toast.show(`All delivered! Bonus +${e.bonus}`);
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
        if (this.state.menuStep > SaveSystem.data.pizzaBookSeenStep) this.menuButtons.setNewBadge(true);
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

  private goalEnv(): PizzaGoalEnv {
    const kinds = new Set(unlockedDishes(this.state.pizza, this.state.menuStep).map((d) => d.kind));
    return { level: this.state.level, comboPossible: kinds.has('pizza') && (kinds.has('side') || kinds.has('fried')) && kinds.has('dessert'), customPossible: this.state.menuStep >= this.state.pizza.custom.fromStep };
  }

  /** Goals keep counting while their banner is hidden; the shared timer decides when the banner shows (Part C). Never during the tutorial, a lesson, a popup or Closed. */
  private updateGoals(real: number): void {
    const allowed = !this.tutorialOn && !this.lessonBlocked();
    const env = this.goalEnv();
    if (allowed) {
      this.goals.ensure(env);
      this.goals.tick(real, env);
    }
    this.goalBanner.update(this.tutorialOn ? null : this.goals.current, { dtMs: real * 1000, completed: this.goals.completed, blocked: !allowed });
    const msg = allowed && !this.toast.visible ? this.goalToasts.splice(0, 1)[0] : undefined;
    if (msg) this.toast.show(msg);
  }

  private countGoal(e: PizzaEvent): void {
    if (this.tutorialOn || !this.goals.current) return;
    const ge = toPizzaGoalEvent(e);
    const done = ge ? this.goals.onEvent(ge, this.goalEnv()) : null;
    if (!done) return;
    this.state.awardGoal(done.coins, done.xp);
    this.goalToasts.push(`Goal complete! +${done.coins} coins  +${done.xp} XP`);
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
    // A ready dish is dragged to a customer (a plain tap still serves the oldest customer who ordered it).
    const carry = this.carryable(z);
    if (carry) return this.startDrag(z, p, carry.from, carry.frame);
    this.views.tapFeedback(z);
    tapPizzaZone(this.state, z);
  }

  /** What a zone offers to drag right now: a baked pizza on its board, a ready tray or basket, a full ice cream cone. */
  private carryable(z: PizzaZone): { from: DragFrom; frame: { atlas: string; frame: string } } | null {
    const s = this.state;
    const edible = (p: string) => p !== 'cooking' && p !== 'burnt';
    if (z.action === 'board') {
      const item = s.boards[z.index ?? 0]?.item;
      const d = item?.status === 'baked' && item.dish ? s.dishDef(item.dish) : undefined;
      return d ? { from: { kind: 'board', index: z.index ?? 0 }, frame: iconFrame(d) } : null;
    }
    if (z.action === 'small_oven') {
      const i = s.smallOven.findIndex((t) => t && edible(t.phase));
      const d = i >= 0 ? s.dishDef(s.smallOven[i]!.dish) : undefined;
      return d ? { from: { kind: 'small', index: i }, frame: iconFrame(d) } : null;
    }
    if (z.action === 'fryer' && z.id.startsWith('fryer_basket')) {
      const t = s.fryer[z.index ?? 0];
      const d = t && edible(t.phase) ? s.dishDef(t.dish) : undefined;
      return d ? { from: { kind: 'fryer', index: z.index ?? 0 }, frame: iconFrame(d) } : null;
    }
    if (z.action === 'plate') {
      const p = s.plates[z.index ?? 0];
      const d = p ? s.dishDef(p.dish) : undefined;
      return d ? { from: { kind: 'plate', index: z.index ?? 0 }, frame: iconFrame(d) } : null;
    }
    if (z.action === 'ice') {
      const i = s.ice.findIndex((l) => l && l.phase === 'ready');
      const d = i >= 0 ? s.dishes.find((x) => x.kind === 'dessert') : undefined;
      return d ? { from: { kind: 'ice', index: i }, frame: iconFrame(d) } : null;
    }
    return null;
  }

  /** Pick the dish up: it lifts off its spot and glides to the finger, so it never jumps. */
  private startDrag(z: PizzaZone, p: Phaser.Input.Pointer, from: DragFrom, pic: { atlas: string; frame: string }): void {
    const home = this.views.spot(z);
    const img = this.add.image(home.x, home.y, pic.atlas, pic.frame).setDepth(50).setAlpha(0.95);
    const base = 90 / img.width;
    img.setScale(base);
    if (!SaveSystem.reduceMotion()) this.tweens.add({ targets: img, scale: base * 1.12, duration: 110, ease: 'Back.Out' });
    if (from.kind === 'board') this.views.setCarried(from.index, true);
    this.drag = { from, img, home: { x: home.x, y: home.y }, tx: p.worldX, ty: p.worldY, sx: p.worldX, sy: p.worldY, moved: false, zone: z };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    d.tx = p.worldX;
    d.ty = p.worldY;
    if (Math.hypot(p.worldX - d.sx, p.worldY - d.sy) > 12) d.moved = true;
  }

  /** The carried picture eases towards the finger every frame (frame-rate independent). */
  private followDrag(dtSec: number): void {
    const d = this.drag;
    if (!d || !d.moved) return;
    const k = SaveSystem.reduceMotion() ? 1 : 1 - Math.pow(0.0004, dtSec);
    d.img.x += (d.tx - d.img.x) * k;
    d.img.y += (d.ty - d.img.y) * k;
  }

  private serveDragged(from: DragFrom, customerId: number): boolean {
    const s = this.state;
    if (from.kind === 'board') return s.serveBoard(from.index, customerId);
    if (from.kind === 'ice') return s.serveIce(from.index, customerId);
    if (from.kind === 'plate') return s.servePlate(from.index, customerId);
    return s.serveTray(from.kind, from.index, customerId);
  }

  private onRelease(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.moved) {
      // A tap, not a drag: serve the oldest customer who ordered it.
      this.endDrag(d);
      this.views.tapFeedback(d.zone);
      return tapPizzaZone(this.state, d.zone);
    }
    const target = this.customers.customerAt(p.worldX, p.worldY) ?? this.tickets.ticketAt(p.worldX, p.worldY);
    const ok = target ? this.serveDragged(d.from, target.id) : false;
    const to = ok && target ? this.customers.centerOf(target.id) ?? this.tickets.centerOf(target.id) : null;
    if (to) {
      // Served: the dish flies the last bit into the customer and shrinks away.
      if (d.from.kind === 'board') this.views.setCarried(d.from.index, false);
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
    if (d.from.kind === 'board') this.views.setCarried(d.from.index, false);
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

  private openPanel(key: 'Shop' | 'RecipeBook' | 'RestaurantSelect'): void {
    if (this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing) return;
    this.cancelDrag();
    this.tutorial.hide();
    audio.setSizzle(0);
    if (key === 'RecipeBook') {
      SaveSystem.data.pizzaBookSeenStep = this.state.menuStep;
      this.menuButtons.setNewBadge(false);
    }
    this.saveNow();
    this.panelOpen = true;
    const onClose = () => {
      this.panelOpen = false;
      this.state.mods = withChoices(pizzaModsFor(defaultPizzaConfig.upgrades, SaveSystem.data.pizzaOwned), 'pizza', SaveSystem.data.choices, this.state.level); // a Shop purchase counts straight away
      this.scene.resume();
    };
    const data: RestaurantSelectData & RecipeBookData & { pizza?: { menuStep: number } } = {
      state: this.state,
      pizza: key === 'Shop' ? { menuStep: this.state.menuStep } : undefined,
      current: PIZZA_ID,
      onClose,
      onPick: (id: string) => (id === PIZZA_ID ? this.scene.restart() : startRestaurant(this, id)),
      rows: key === 'RecipeBook' ? this.recipeRows() : undefined,
      mastery: key === 'RecipeBook' ? this.masteryData() : undefined,
      tips: key === 'RecipeBook' ? `Tap the dough, then a sauce, a cheese and toppings. Tap the pizza to finish it, again to bake it. Take it out when the ring turns green, then drag it to the customer.\n${this.nextMenuHint()}` : undefined,
    };
    this.scene.launch(key, data);
    this.scene.bringToTop(key);
    this.scene.pause();
  }

  /** A short, current target for the Pizza Place's separate menu progression. */
  private nextMenuHint(): string {
    const nextStep = this.state.menuStep + 1;
    if (nextStep > 10) return 'Every Pizza Place recipe is now on the menu.';
    const next = this.state.pizza.dishes.find((d) => d.unlockStep === nextStep);
    const remaining = Math.max(0, pizzaStepXpNeeded(this.state.cfg, this.state.menuStep) - this.state.menuXp);
    return `${next ? `Next up: ${next.name}. ` : 'More recipes are coming. '}${remaining} XP to the next menu update.`;
  }

  /** The Pizza Place's real recipes for the Recipe Book: available, still locked (with the menu step that unlocks them) and the learning state. */
  private recipeRows(): BookRow[] {
    const p = this.state.pizza;
    const when = pizzaMilestones(this.state.cfg, p);
    return p.dishes.map((d) => {
      const locked = d.unlockStep > this.state.menuStep;
      const f = iconFrame(d);
      const steps = d.kind === 'pizza' ? recipeSteps(d).map((id) => (id === 'dough' ? 'dough' : (p.stepLabels[id] ?? id).replace(/^an? /, ''))) : [d.kind === 'side' ? 'small oven' : d.kind === 'fried' ? 'fryer' : 'ice cream machine'];
      const learning = !locked && this.state.familiarity(d.id) !== 'normal' ? '   (learning)' : '';
      const today = this.state.special?.dish === d.id ? (this.state.special.done ? '   Pizza of the day: done' : '   Pizza of the day: +50% coins') : '';
      return {
        name: d.name,
        icon: { key: f.atlas, frame: f.frame as unknown as number },
        stats: locked ? `Unlocks at Pizza menu step ${d.unlockStep} (about Lv ${when[d.unlockStep - 1].lv})` : `${d.price} coins   +${d.xp} XP${learning}${today}`,
        steps,
        locked,
      };
    });
  }

  // ---------------------------------------------------------------- mastery

  /** Pays every badge the serve counts of the ten pizzas have earned and not yet been paid, once each. Coins come from data/extras.json. */
  private payMastery(): void {
    const save = SaveSystem.data;
    const awards = pizzaMasteryDue(this.state.pizza.dishes, this.state.dishServes, save.pizzaMastery);
    if (awards.length === 0) return;
    save.pizzaMastery = pizzaPaidAfter(save.pizzaMastery, awards);
    let coins = 0;
    const lines: string[] = [];
    for (const a of awards) {
      coins += a.coins;
      lines.push(`${this.state.dishDef(a.dish)?.name ?? a.dish}: ${a.name} badge! +${a.coins} coins`);
    }
    this.state.coins += coins;
    this.toast.show(lines.join('\n'));
    this.saveNow();
  }

  /** The mastery tab of the Recipe Book: the ten pizzas, five to a row, from the real serve counts. */
  private masteryData(): MasteryBookData {
    const grid = pizzaMasteryGrid(this.state.pizza.dishes, this.state.dishServes, this.state.menuStep);
    const tiers = pizzaMasteryTiers();
    const bronze = this.state.pizza.dishes.filter((d) => d.kind === 'pizza' && (this.state.dishServes[d.id] ?? 0) >= tiers[0].serves).length;
    return {
      rowLabels: ['Menu 1-5', 'Menu 6-10'],
      colLabels: grid[0].map(() => ''),
      cells: grid.map((row) =>
        row.map((c) => {
          const f = iconFrame(this.state.dishDef(c.dish)!);
          return { name: c.name.replace(/ pizza$/, ''), icon: { key: f.atlas, frame: f.frame as unknown as number }, count: c.count, tier: c.tier, next: c.next ? `${c.next.remaining} more for ${c.next.name}` : 'Gold!', onMenu: c.onMenu };
        }),
      ),
      footer: `${tiers.map((t) => `${t.name} ${t.serves}`).join(', ')} served. ${bronze} / 10 pizzas Bronze.`,
    };
  }

  // ---------------------------------------------------------------- helpers

  /** Small gold popup text (combo meal, pizza of the day). Reduced motion: shown still for a moment, no movement or fade. */
  private popup(x: number, y: number, text: string): void {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: '26px', color: '#FFD54A', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5).setDepth(46);
    if (SaveSystem.reduceMotion()) this.time.delayedCall(1300, () => t.destroy());
    else this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, delay: 500, duration: 800, onComplete: () => t.destroy() });
  }

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
    if (this.state.special?.done) SaveSystem.data.pizzaSpecialDay = this.dayKey;
    SaveSystem.save();
    this.lastSave = performance.now();
  }

  private cleanup(): void {
    if (this.debugBackup !== null) {
      // Put the real save back exactly as it was before the debug flags changed anything in memory.
      Object.assign(SaveSystem.data, JSON.parse(this.debugBackup));
      this.debugBackup = null;
    } else if (this.state) this.saveNow();
    this.cancelDrag();
    this.input.off('pointerdown', this.onTap, this);
    this.input.off('pointermove', this.onMove, this);
    this.input.off('pointerup', this.onRelease, this);
    this.input.keyboard?.off('keydown-B', this.openShop, this);
    this.input.keyboard?.off('keydown-R', this.openBook, this);
    this.input.keyboard?.off('keydown-T', this.openRestaurants, this);
    this.tutorial?.destroy();
    this.storyCard?.destroy();
    this.views?.destroy();
    this.customers?.destroy();
    this.tickets?.destroy();
    this.dailyPlate?.destroy();
    this.goalBanner?.destroy();
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
