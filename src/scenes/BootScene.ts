import Phaser from 'phaser';
import assetsJson from '../../data/assets.json';
import restaurantsJson from '../../data/restaurants.json';
import { assertValid, validateAssets, validateRestaurants, type AssetDef, type RestaurantDef } from '../data/validate';
import { SaveSystem } from '../systems/SaveSystem';
import { buildAllTextures } from '../art/builders';
import { defaultConfig } from '../game/config';

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
    SaveSystem.load();

    const w = LOGICAL_WIDTH;
    const h = LOGICAL_HEIGHT;
    this.add.rectangle(w / 2, h / 2, w, h, 0x2b1b17);
    this.add
      .text(w / 2, h / 2 - 50, 'Chef Rush', { fontFamily: 'Fredoka, "Baloo 2", system-ui, sans-serif', fontSize: '56px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 6 })
      .setOrigin(0.5);
    const frame = this.add.rectangle(w / 2, h / 2 + 20, 420, 28, 0x1f2a44).setStrokeStyle(4, 0x2b1b17);
    const fill = this.add.rectangle(w / 2 - 208, h / 2 + 20, 4, 18, 0xf28c28).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => fill.setSize(Math.max(4, 416 * p), 18));
    void frame;

    // Art is loaded from the manifest. A missing file is reported, never silently replaced.
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.error(`Missing asset: ${file.key} (${file.url})`));
    for (const a of (assetsJson as { assets: AssetDef[] }).assets) {
      if (a.lazy) continue; // lazy art is loaded when its station unlocks (later milestones)
      if (a.type === 'svg') this.load.svg(a.key, a.file, { width: a.width ?? 128, height: a.height ?? 128 });
      else this.load.image(a.key, a.file);
    }
  }

  create(): void {
    const restaurants = (restaurantsJson as { restaurants: RestaurantDef[] }).restaurants;
    this.registry.set('restaurants', restaurants);
    buildAllTextures(this, defaultConfig);
    this.scene.start('Game', { restaurantId: restaurants[0].id });
  }
}
