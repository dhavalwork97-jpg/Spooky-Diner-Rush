import Phaser from 'phaser';
import { startRestaurant } from './restaurantRoute';
import { fitBackground, logicalToNorm, type BackgroundPlacement } from '../kitchen/zones';
import { TacoKitchenState, type TacoEvent } from '../game/taco/TacoKitchenState';
import { defaultTacoConfig, type TacoZone } from '../game/taco/tacoConfig';
import { hitTestTaco, tapZone } from '../game/taco/tacoZones';
import { tacoRecipeEntries, TACO_BOOK_TIPS } from '../game/taco/tacoRecipes';
import { TACO_TUTORIAL_ID, nextTacoHint, recipeIntro, tutorialDue } from '../game/taco/tacoTutorial';
import { lessonDone, lessonMode, lessonShown, seedLearned } from '../game/taco/tacoLearning';
import { tacoModsFor } from '../game/taco/tacoShop';
import { clampStep } from '../game/taco/tacoMenu';
import { titleEarnedAt } from '../game/career';
import type { RestaurantSelectData } from './RestaurantSelectScene';
import type { BookRow, MasteryBookData, RecipeBookData } from './RecipeBookScene';
import { allBronze, dueTacoChests, masteryDue, masteryGrid, paidAfter, tacoAllBronzeCoins, tacoChestsAfter, TACO_FORMATS, TACO_PROTEINS } from '../game/taco/tacoExtras';
import { ChestCard } from '../views/ChestViews';
import { dxKey, hasDinerArt, loadDinerArt } from '../views/dinerArt';
import { BatFlyers } from '../views/BatViews';
import { TacoHaunted } from '../views/TacoHaunted';
import { batSchedule } from '../game/spooky';
import { makeRng } from '../game/rng';
import { newlyEarned, track, type BadgeEvent } from '../game/badges';
import { tacoBadges, tacoEvents, tacoHaunted, TACO_BAT_LANE } from '../game/taco/tacoExtras';
import { SaveSystem } from '../systems/SaveSystem';
import { CrazyGames } from '../sdk/crazygames';
import { loadTacoArt, sheetKey, spriteKey, TacoViews } from '../views/TacoViews';
import { TacoCustomers } from '../views/TacoCustomers';
import { Hud } from '../views/Hud';
import { Ring } from '../views/Ring';
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
  private chestCard!: ChestCard;
  private haunted!: TacoHaunted;
  private lastBat = { x: LOGICAL_WIDTH / 2, y: 140 };
  private bats!: BatFlyers;
  private overlay!: Overlay;
  private storyCard!: StoryCard;
  private menuButtons!: MenuButtons;
  private tutorial!: TacoTutorialView;
  private tutorialOn = false;
  /** The recipe tutorial that is running (one dish at a time), or null. `active` turns true once its intro card is closed. */
  private lesson: { dish: string; mode: 'full' | 'reminder'; active: boolean } | null = null;
  /** ?debug&speed=N: time runs N times faster (testing only). */
  private speed = 1;
  /** No automatic tutorial starts before this time (ms, scene clock): after a skip or an ended lesson the player is left alone for a while. */
  private lessonPauseUntil = 0;
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
    this.lesson = null;
    this.lessonPauseUntil = 0;
    this.adActive = false;
    this.adPending = false;
    const a = defaultTacoConfig.art;
    this.bg = fitBackground(LOGICAL_WIDTH, LOGICAL_HEIGHT, a.width, a.height);
    const layer = (key: string, depth: number) =>
      this.add.image(this.bg.x, this.bg.y, key).setOrigin(0, 0).setDisplaySize(this.bg.width, this.bg.height).setDepth(depth).setName(key);
    layer('taco_back', 0);
    layer('taco_front', 20);

    const save = SaveSystem.data;
    this.state = new TacoKitchenState({ level: save.level, xp: save.xp, coins: save.coins, menuStep: save.tacoStep, menuXp: save.tacoXp, tacoServed: save.tacoServed });
    // The truck uses its own upgrades only (the diner's shop upgrades do not carry over).
    this.state.mods = tacoModsFor(this.state.taco.upgrades, save.tacoOwned);
    this.applyDebugFlags();

    this.fx = new ParticlePool(this, 140);
    this.haunted = new TacoHaunted(this, this.bg, (id) => this.tapPumpkin(id));
    // Bat Delivery: the bat flies across the window between the back layer (0) and the front frame (20), behind the customers (10) and their bubbles.
    // Nothing else is tappable inside the glass (no zone), so the bat cannot steal a tap from a station, drop zone, customer or bubble.
    const lane = { top: this.bg.y + TACO_BAT_LANE.top * this.bg.height, bottom: this.bg.y + TACO_BAT_LANE.bottom * this.bg.height, bob: TACO_BAT_LANE.bob * this.bg.height };
    this.bats = new BatFlyers(this, this.bg.width * (0.829 - 0.244), (x, y) => this.tapBat(x, y), { band: lane, depth: 5, scale: 0.17, x0: this.bg.x + this.bg.width * 0.244, sfx: 'bat_flap' });
    this.views = new TacoViews(this, this.bg, this.state, this.fx, (x, y, r) => new Ring(this, x, y, r, true));
    this.customers = new TacoCustomers(this, this.bg, this.state);

    // The shared interface, built exactly as in the diner (same classes, same positions, same depths).
    this.hud = new Hud(this, this.state);
    this.toast = new Toast(this, LOGICAL_WIDTH / 2, 300);
    this.banner = new EventBanner(this, 551, 42);
    this.levelUpCard = new LevelUpCard(this, this.fx, LOGICAL_WIDTH / 2, 330);
    this.overlay = new Overlay(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.storyCard = new StoryCard(this, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.chestCard = new ChestCard(this, this.fx, LOGICAL_WIDTH / 2, 360, 'chest_open');
    this.prepareExtrasArt();
    new MuteButton(this);
    this.menuButtons = new MenuButtons(this, (k: MenuKind) => this.openPanel(k === 'shop' ? 'Shop' : k === 'book' ? 'RecipeBook' : 'RestaurantSelect'));
    this.tutorial = new TacoTutorialView(this, LOGICAL_WIDTH, LOGICAL_HEIGHT, () => (this.lesson ? this.endLesson(false) : this.finishTutorial('Tutorial skipped. The Recipe Book shows every recipe.')));
    if (new URLSearchParams(location.search).has('debug') && !new URLSearchParams(location.search).has('nozones')) this.drawZones();

    this.startTutorial();
    this.claimMissedChests();

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
  private finishTutorial(message: string, finished = false): void {
    if (!this.tutorialOn) return;
    this.tutorialOn = false;
    this.tutorial.hide();
    const save = SaveSystem.data;
    if (!save.seenStory.includes(TACO_TUTORIAL_ID)) save.seenStory.push(TACO_TUTORIAL_ID);
    // The first-visit guide teaches the menu's first dish(es): that counts as their lesson (finished) or as one showing (skipped).
    for (const d of this.state.taco.dishes.filter((x) => x.unlockStep <= 1)) save.tacoLessons = finished ? lessonDone(save.tacoLessons, d.id) : lessonShown(save.tacoLessons, d.id);
    SaveSystem.save();
    this.toast.show(message);
  }

  override update(_time: number, delta: number): void {
    const real = Math.min(delta, 100) / 1000;
    if (!this.storyCard.isShowing && !this.adActive) this.state.update(real * this.speed);
    for (const e of this.state.drainEvents()) this.handle(e);
    this.views.sync();
    this.customers.sync();
    this.hud.update(this.state, real);
    if (this.state.event) this.banner.update(this.state.event.remaining);
    if (this.state.event?.def.bat) this.bats.update(this.state.event.def.duration - this.state.event.remaining);
    this.followDrag(real);
    this.updateTutorial();
    this.updateLesson();

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
        this.badgeEvent({ type: 'serve', rush: e.rush, atMaxCombo: e.combo >= this.state.cfg.combo.maxCombo, duringMoon: this.state.event?.def.id === 'full_moon', regular: !!e.regular });
        this.badgeEvent({ type: 'coins', amount: e.coins + e.tip });
        this.saveNow();
        this.finishTutorial('You served your first order! The Recipe Book shows every recipe.', true);
        break;
      }
      case 'recipeServed':
        this.onRecipeServed(e.dish, e.learned);
        break;
      case 'wrongDrop':
        if (e.customer !== null) this.customers.shake(e.customer);
        this.toast.show(e.penalty ? 'That is not what they ordered' : 'Drop it on a customer who ordered it');
        break;
      case 'comboChanged':
        this.hud.comboPop(e.combo);
        this.haunted.setCombo(e.combo, e.max);
        break;
      case 'eventStart':
        this.banner.show(e.name, e.duration);
        this.startEventFx();
        break;
      case 'eventEnd':
        this.banner.hide();
        this.endEventFx();
        break;
      case 'batCaught':
        this.badgeEvent({ type: 'bat' });
        this.onBatCaught(e.coins);
        break;
      case 'pumpkinTap': {
        this.badgeEvent({ type: 'pumpkin' });
        this.haunted.flare(e.id);
        const k = tacoHaunted.pumpkins.find((x) => x.id === e.id);
        if (k) this.fx.burst(this.bg.x + k.x * this.bg.width, this.bg.y + k.y * this.bg.height, 0xff8a1f, 6, 36, 400);
        audio.play('pop');
        break;
      }
      case 'partyArrive': {
        // Three ghosts walk in together: a short cheer over the window, nothing that blocks play.
        if (!SaveSystem.reduceMotion()) this.fx.burst(LOGICAL_WIDTH / 2, 150, 0xf6c445, 12, 70, 600);
        this.bannerText(LOGICAL_WIDTH / 2, 120, 'Party!', '#F6C445');
        break;
      }
      case 'partyDone':
        this.badgeEvent({ type: 'party' });
        this.toast.show(`Party bonus +${e.bonus} coins`);
        this.bannerText(LOGICAL_WIDTH / 2, 130, `+${e.bonus}`, '#F6C445');
        this.flyCoins2(Math.min(8, 3 + Math.floor(e.bonus / 20)));
        this.saveNow();
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
        this.prepareExtrasArt();
        this.claimMissedChests(); // a milestone chest follows the step-up card
        break;
      }
      case 'closed':
        this.endEventFx();
        this.haunted.setCombo(0, this.state.cfg.combo.maxCombo);
        this.endLesson(false, true);
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
    const lesson = this.lesson?.active ? this.lesson.dish : undefined;
    if (!this.tutorialOn && lesson === undefined) return;
    const blocked = this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.drag !== null;
    const hint = blocked ? null : nextTacoHint(this.state, lesson);
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

  // ---------------------------------------------------------------- recipe lessons

  private lessonBlocked(): boolean {
    return this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing || this.adActive;
  }

  /** Each frame: start the tutorial for a dish a customer has ordered (when none runs), or end it when nobody wants that dish any more. */
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
        const mode = lessonMode(SaveSystem.data.tacoLessons, id);
        if (mode) return this.beginLesson(id, mode);
      }
    }
  }

  /** The first sight of a dish gets the full lesson (intro card, then the pointer); a skipped or unfinished one gets one short reminder; then never again. */
  private beginLesson(dish: string, mode: 'full' | 'reminder'): void {
    const def = this.state.dishDef(dish);
    if (!def) return;
    SaveSystem.data.tacoLessons = lessonShown(SaveSystem.data.tacoLessons, dish); // counted when it starts, so a reload never repeats it
    SaveSystem.save();
    this.lesson = { dish, mode, active: mode === 'reminder' };
    if (mode === 'reminder') return void this.toast.show(`Quick reminder: ${def.name}`);
    const intro = recipeIntro(this.state.taco, def);
    this.storyCard.show({ id: `taco_recipe_${dish}`, ...intro }, () => {
      if (this.lesson?.dish === dish) this.lesson.active = true;
    });
  }

  /** The dish was made with the pointer's help (`done`) or the tutorial ended early (skip, closed, customer gone). */
  private endLesson(done: boolean, silent = false): void {
    const l = this.lesson;
    if (!l) return;
    this.lesson = null;
    this.lessonPauseUntil = this.time.now + 90_000;
    this.tutorial.hide();
    if (done) {
      SaveSystem.data.tacoLessons = lessonDone(SaveSystem.data.tacoLessons, l.dish);
      this.toast.show(`${this.state.dishDef(l.dish)?.name ?? 'Recipe'} learned!`);
    } else if (!silent && l.active) this.toast.show('The Recipe Book shows every recipe.');
    SaveSystem.save();
  }

  private onRecipeServed(dish: string, learned: boolean): void {
    if (this.lesson?.dish === dish) this.endLesson(true);
    this.payMastery();
    if (learned && !this.lesson) this.saveNow();
  }

  // ---------------------------------------------------------------- taco events (Full Moon, Bat Delivery)

  private startEventFx(): void {
    const def = this.state.event?.def;
    if (!def) return;
    this.haunted.setMoon(def.look === 'moon');
    if (def.bat) this.bats.start(batSchedule(def.bat.flights, def.duration, makeRng(Date.now() & 0xffff)));
  }

  private endEventFx(): void {
    this.haunted.setMoon(false);
    this.bats.clear();
  }

  /** The player tapped a bat: the model pays the bag; show the bag falling and the coins flying in. */
  private tapBat(x: number, y: number): void {
    if (this.panelOpen || this.adActive || this.storyCard.isShowing || this.chestCard.isShowing) return;
    audio.unlock();
    this.lastBat = { x, y };
    if (this.state.catchBat() > 0) this.bats.caught(x, y);
  }

  /** The player tapped a window pumpkin: the model pays a couple of coins (or nothing while it rests). */
  private tapPumpkin(id: string): void {
    if (this.panelOpen || this.adActive || this.storyCard.isShowing || this.chestCard.isShowing || this.state.closed) return;
    audio.unlock();
    this.state.tapPumpkin(id);
  }

  private onBatCaught(coins: number): void {
    const at = this.lastBat;
    this.fx.burst(at.x, at.y, 0xf6c445, 10, 46, 500);
    const t = this.add.text(at.x, at.y - 10, `+${coins}`, { fontFamily: FONT, fontSize: '32px', color: '#F6C445', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
    if (hasDinerArt(this, 'coin_bag')) {
      const bag = this.add.image(at.x, at.y, dxKey('coin_bag')).setOrigin(0.5, 1).setScale(0.22).setDepth(45);
      if (SaveSystem.reduceMotion()) this.time.delayedCall(700, () => bag.destroy());
      else this.tweens.add({ targets: bag, y: at.y + 90, duration: 520, ease: 'Bounce.Out', onComplete: () => this.tweens.add({ targets: bag, alpha: 0, duration: 260, delay: 220, onComplete: () => bag.destroy() }) });
    }
    flyCoins(this, this.hud.coinIcon, { x: at.x, y: at.y + 60 }, Math.min(6, 2 + Math.floor(coins / 10)));
    this.saveNow();
  }

  // ---------------------------------------------------------------- taco badges

  /** Count something for the truck's badges; a newly earned badge shows a small toast. No coin reward. */
  private badgeEvent(e: BadgeEvent): void {
    const save = SaveSystem.data;
    save.tacoStats = track(save.tacoStats, e);
    const won = newlyEarned(tacoBadges, save.tacoStats, save.tacoBadges);
    if (won.length === 0) return;
    save.tacoBadges = [...save.tacoBadges, ...won.map((b) => b.id)];
    this.toast.show(`Badge earned: ${won.map((b) => b.name).join(', ')}!`);
    this.saveNow();
  }

  // ---------------------------------------------------------------- taco extras (mastery grid, milestone chests)

  /** Load the shared extras art the truck's features need (lazy: a background load, views skip their art until it arrives). */
  private prepareExtrasArt(): void {
    const step = this.state.menuStep;
    if (step >= 2) loadDinerArt(this, 'chest'); // the chest card (and the bat's coin bag)
    if (step >= 3) loadDinerArt(this, 'badges'); // the regulars' heart
    if (step >= 4) loadDinerArt(this, 'bat');
  }

  /** Pays every mastery badge the serve counts have earned and not yet been paid, plus the all-16-bronze bonus, once each. */
  private payMastery(): void {
    const save = SaveSystem.data;
    const awards = masteryDue(this.state.dishServes, save.tacoMastery);
    let coins = 0;
    const lines: string[] = [];
    if (awards.length > 0) {
      save.tacoMastery = paidAfter(save.tacoMastery, awards);
      for (const a of awards) {
        this.badgeEvent({ type: 'mastery' });
        coins += a.coins;
        lines.push(`${this.state.dishDef(a.dish)?.name ?? a.dish}: ${a.name} badge! +${a.coins} coins`);
      }
    }
    if (!save.tacoMasteryBonus && allBronze(this.state.taco.dishes, this.state.dishServes)) {
      save.tacoMasteryBonus = true;
      coins += tacoAllBronzeCoins;
      lines.push(`All 16 dishes Bronze! +${tacoAllBronzeCoins} coins`);
    }
    if (coins === 0) return;
    this.state.coins += coins;
    this.toast.show(lines.join('\n'));
    this.saveNow();
  }

  /** The mastery tab of the Recipe Book: the 4 x 4 grid from the real serve counts. */
  private masteryData(): MasteryBookData {
    const grid = masteryGrid(this.state.taco.dishes, this.state.dishServes, this.state.menuStep);
    const bronze = this.state.taco.dishes.filter((d) => (this.state.dishServes[d.id] ?? 0) >= 10).length;
    return {
      rowLabels: TACO_PROTEINS.map((p) => p[0].toUpperCase() + p.slice(1)),
      colLabels: TACO_FORMATS.map((k) => (k === 'soft_taco' ? 'Soft taco' : k === 'crispy_taco' ? 'Crispy taco' : k === 'burrito' ? 'Burrito' : 'Nachos')),
      cells: grid.map((row) =>
        row.map((c) => {
          const d = this.state.dishDef(c.dish)!;
          return { name: c.name, icon: { key: spriteKey(d.sprite) }, count: c.count, tier: c.tier, next: c.next ? `${c.next.remaining} more for ${c.next.name}` : 'Gold!', onMenu: c.onMenu };
        }),
      ),
      footer: SaveSystem.data.tacoMasteryBonus ? 'All 16 dishes Bronze: bonus paid!' : `Bronze 10, Silver 40, Gold 100 served. All 16 Bronze pays +${tacoAllBronzeCoins} coins (${Math.min(16, bronze)} / 16).`,
    };
  }

  /** Milestone chest cards (menu steps 3, 6 and 10), one after the other. A player already past a step gets one claim card per missed chest. */
  private claimMissedChests(): void {
    if (dueTacoChests(this.state.menuStep, SaveSystem.data.tacoChests).length === 0) return;
    const tryShow = (): void => {
      if (this.storyCard.isShowing || this.levelUpCard.isShowing || this.panelOpen || this.state.closed || this.overlay.visible || this.chestCard.isShowing) this.time.delayedCall(2000, tryShow);
      else this.showChests();
    };
    this.time.delayedCall(2500, tryShow);
  }

  private showChests(): void {
    const due = dueTacoChests(this.state.menuStep, SaveSystem.data.tacoChests);
    if (due.length === 0 || this.chestCard.isShowing) return;
    this.chestCard.show(
      due[0],
      (c) => {
        SaveSystem.data.tacoChests = tacoChestsAfter(SaveSystem.data.tacoChests, c as (typeof due)[number]);
        this.state.coins += c.coins;
        this.badgeEvent({ type: 'chest' });
        this.flyCoins2(Math.min(8, 3 + Math.floor(c.coins / 60)));
        this.saveNow();
        return [`+${c.coins} coins`];
      },
      () => this.time.delayedCall(400, () => this.showChests()),
    );
  }

  private flyCoins2(n: number): void {
    flyCoins(this, this.hud.coinIcon, { x: LOGICAL_WIDTH / 2, y: 330 }, n);
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
    if (this.panelOpen || this.state.closed || this.overlay.visible || this.storyCard.isShowing || this.levelUpCard.isShowing || this.chestCard.isShowing) return;
    this.cancelDrag();
    this.tutorial.hide();
    audio.setSizzle(0);
    this.saveNow();
    this.panelOpen = true;
    const onClose = () => {
      this.panelOpen = false;
      this.state.mods = tacoModsFor(this.state.taco.upgrades, SaveSystem.data.tacoOwned); // a Shop purchase counts straight away
      this.scene.resume();
    };
    const data: RestaurantSelectData & RecipeBookData & { taco?: { menuStep: number } } = {
      state: this.state,
      taco: key === 'Shop' ? { menuStep: this.state.menuStep } : undefined,
      current: defaultTacoConfig.restaurant.id,
      onClose,
      onPick: (id: string) => (id === defaultTacoConfig.restaurant.id ? this.scene.restart() : startRestaurant(this, id)),
      rows: key === 'RecipeBook' ? this.recipeRows() : undefined,
      mastery: key === 'RecipeBook' ? this.masteryData() : undefined,
      badges: key === 'RecipeBook' ? { defs: tacoBadges, stats: SaveSystem.data.tacoStats, have: SaveSystem.data.tacoBadges } : undefined,
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

  /** A short coloured message floating up at a screen position (party cheer, party bonus). */
  private bannerText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: '34px', color, stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
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
    SaveSystem.data.tacoServed = { ...this.state.dishServes };
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
    this.chestCard.destroy();
    this.haunted.destroy();
    this.bats.destroy();
    this.views.destroy();
    this.customers.destroy();
    this.fx.destroy();
    audio.setSizzle(0);
    audio.stopMusic();
    CrazyGames.gameplayStop();
  }

  /**
   * Development test mode (only with ?debug): ?step=N jumps the menu to step N with every older dish already learned (and its tutorial done),
   * so the newest dishes arrive as brand-new recipes; ?coins=N sets the coins; ?level=N the level; ?speed=N (up to 8) runs time faster.
   * Nothing here runs in a normal game.
   */
  private applyDebugFlags(): void {
    const q = new URLSearchParams(location.search);
    if (!q.has('debug')) return;
    const num = (k: string): number | null => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
    const step = num('step');
    if (step !== null) {
      this.state.menuStep = clampStep(step);
      this.state.menuXp = 0;
      const seeded = seedLearned(this.state.taco, this.state.menuStep);
      this.state.dishServes = seeded.served;
      SaveSystem.data.tacoLessons = seeded.lessons;
      SaveSystem.data.tacoServed = { ...seeded.served };
      if (this.state.menuStep > 1 && !SaveSystem.data.seenStory.includes(TACO_TUTORIAL_ID)) SaveSystem.data.seenStory.push(TACO_TUTORIAL_ID);
    }
    const coins = num('coins');
    if (coins !== null) this.state.coins = Math.max(0, Math.floor(coins));
    const level = num('level');
    if (level !== null) this.state.level = Math.max(1, Math.floor(level));
    this.speed = Math.max(1, Math.min(8, num('speed') ?? 1));
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
      lesson: () => (this.lesson ? { dish: this.lesson.dish, mode: this.lesson.mode, active: this.lesson.active } : null),
      hint: () => nextTacoHint(this.state, this.lesson?.active ? this.lesson.dish : undefined),
      spot: (id: string) => {
        const z = this.state.taco.zones.find((q) => q.id === id);
        return z ? this.views.spot(z) : null;
      },
      customerCenter: (id: number) => this.customers.centerOf(id),
      toast: () => (this.toast.visible ? this.toast.message : ''),
      overlay: () => this.overlay.visible,
      story: () => this.storyCard.id,
      bats: () => ({ flying: this.bats.flying, positions: this.bats.positions(), tap: (x: number, y: number) => this.tapBat(x, y) }),
      haunted: () => this.haunted.status,
      pumpkin: (id: string) => this.tapPumpkin(id),
      startEvent: (id: string) => {
        const def = [...this.state.cfg.events.events, ...tacoEvents].find((d) => d.id === id);
        if (def) this.state.startEvent(def);
      },
      chest: () => ({ showing: this.chestCard.isShowing, opened: this.chestCard.opened, tap: () => this.chestCard.tap(), claimed: [...SaveSystem.data.tacoChests] }),
    };
  }
}
