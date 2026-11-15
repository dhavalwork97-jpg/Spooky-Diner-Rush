import Phaser from 'phaser';
import assetsJson from '../../data/assets.json';
import restaurantsJson from '../../data/restaurants.json';
import xpJson from '../../data/xp.json';
import upgradesJson from '../../data/upgrades.json';
import careerJson from '../../data/career.json';
import chefJson from '../../data/chef.json';
import storyJson from '../../data/story.json';
import decorJson from '../../data/decor.json';
import recipebookJson from '../../data/recipebook.json';
import restaurantMenuJson from '../../data/restaurant_menu.json';
import { assertValid, validateXp, validateAssets, validateRestaurants, validateUpgrades, validateCareer, validateChef, validateStory, validateDecor, validateRecipeBook, validateRestaurantMenu, type AssetDef, type RestaurantDef } from '../data/validate';
import { CrazyGames } from '../sdk/crazygames';
import { SaveSystem } from '../systems/SaveSystem';
import { buildAllTextures } from '../art/builders';
import { defaultConfig } from '../game/config';
import { CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN } from '../game/KitchenState';
import { pickStartRestaurant } from '../game/restaurants';
import { defaultIntros, validateIntros } from '../game/intros';
import { defaultChests, validateChests } from '../game/chests';
import { defaultBadges, validateBadges } from '../game/badges';
import { dinerArtRows } from '../views/dinerArt';
import { defaultRegulars, defaultRegularSettings, validateRegulars } from '../game/regulars';
import { validateEvents } from '../game/spooky';
import { chooseFirstScene, hasSavedProgress } from '../game/startup';

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 698;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Data is validated before anything is loaded, so bad JSON fails loudly and early.
    assertValid('assets.json', validateAssets(assetsJson));
    assertValid('restaurants.json', validateRestaurants(restaurantsJson));
    assertValid('xp.json', validateXp(xpJson));
    assertValid('upgrades.json', validateUpgrades(upgradesJson));
    assertValid('career.json', validateCareer(careerJson));
    assertValid('chef.json', validateChef(chefJson));
    assertValid('story.json', validateStory(storyJson));
    assertValid('decor.json', validateDecor(decorJson));
    assertValid('restaurant_menu.json', validateRestaurantMenu(restaurantMenuJson, (restaurantsJson as { restaurants: { id: string }[] }).restaurants.map((r) => r.id)));
    assertValid('recipebook.json', validateRecipeBook(recipebookJson, Object.keys(defaultConfig.recipes.items)));
    assertValid('intros.json', validateIntros(defaultIntros, (restaurantsJson as { restaurants: RestaurantDef[] }).restaurants.find((r) => r.id === 'burger_diner')!.zones));
    assertValid('chests.json', validateChests(defaultChests, defaultConfig.decor.items.filter((d) => d.chestOnly).map((d) => d.id)));
    assertValid('regulars.json', validateRegulars(defaultRegulars, defaultRegularSettings, CUSTOMER_LOOK_COUNT, CUSTOMER_LOOK_MIN, Object.fromEntries(Object.entries(defaultConfig.recipes.items).map(([k, v]) => [k, v.unlockLevel]))));
    assertValid('badges.json', validateBadges(defaultBadges, dinerArtRows('badges').map((r) => r.key.replace(/^dx_/, ''))));
    assertValid('events.json', validateEvents(defaultConfig.events.events));
    SaveSystem.load();

    const w = LOGICAL_WIDTH;
    const h = LOGICAL_HEIGHT;
    this.add.rectangle(w / 2, h / 2, w, h, 0x2b1b17);
    this.add
      .text(w / 2, h / 2 - 50, 'Spooky Diner Rush', { fontFamily: 'Fredoka, "Baloo 2", system-ui, sans-serif', fontSize: '56px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 6 })
      .setOrigin(0.5);
    const frame = this.add.rectangle(w / 2, h / 2 + 20, 420, 28, 0x1f2a44).setStrokeStyle(4, 0x2b1b17);
    const fill = this.add.rectangle(w / 2 - 208, h / 2 + 20, 4, 18, 0xf28c28).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => fill.setSize(Math.max(4, 416 * p), 18));
    void frame;

    // Art is loaded from the manifest. A missing file is reported, never silently replaced.
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.error(`Missing asset: ${file.key} (${file.url})`));
    for (const a of (assetsJson as { assets: AssetDef[] }).assets) {
      if (a.lazy) continue; // lazy art is loaded when its station unlocks (later milestones)
      if (a.type === 'spritesheet') this.load.spritesheet(a.key, a.file, { frameWidth: a.frameWidth ?? 0, frameHeight: a.frameHeight ?? 0 });
      else if (a.type === 'svg') this.load.svg(a.key, a.file, { width: a.width ?? 128, height: a.height ?? 128 });
      else this.load.image(a.key, a.file);
    }
  }

  create(): void {
    const restaurants = (restaurantsJson as { restaurants: RestaurantDef[] }).restaurants;
    this.registry.set('restaurants', restaurants);
    buildAllTextures(this, defaultConfig);
    const start = pickStartRestaurant(restaurants, SaveSystem.data.lastRestaurant, SaveSystem.data.level);
    // Canvas text does not redraw when a font arrives later, so wait for the bundled font (a missing file only delays by the timeout).
    // New players see the title screen (with the intro video) first; returning players and ?debug go straight in (see src/game/startup.ts).
    const params = new URLSearchParams(location.search);
    // ?debug&taco opens the Taco Truck directly (see TacoScene for its ?step, ?speed and ?coins flags).
    const next = chooseFirstScene({ debug: params.has('debug'), taco: params.has('taco'), returning: hasSavedProgress(SaveSystem.data) });
    const go = (): void => {
      CrazyGames.loadingStop();
      void this.scene.start(next, { restaurantId: start });
    };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) {
      go();
      return;
    }
    let done = false;
    const once = (): void => {
      if (done) return;
      done = true;
      go();
    };
    Promise.all([fonts.load('400 24px Fredoka'), fonts.load('700 24px Fredoka')]).then(once, once);
    window.setTimeout(once, 1500);
  }
}
