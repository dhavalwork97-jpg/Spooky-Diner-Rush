import Phaser from 'phaser';
import type { RestaurantDef } from '../data/validate';
import { fitBackground, hitTestZone, logicalToNorm, normToLogical, type BackgroundPlacement, type Rect, type ZoneDef } from '../kitchen/zones';
import { handleStationTap } from '../kitchen/stationHandlers';
import { animGuard, fade, pop } from '../anim/helpers';
import { ParticlePool } from '../anim/ParticlePool';
import { SaveSystem } from '../systems/SaveSystem';
import { CrazyGames } from '../sdk/crazygames';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';

interface ZoneView {
  zone: ZoneDef;
  rect: Rect;
  outline: Phaser.GameObjects.Graphics;
}

/**
 * Kitchen scene. The background is static; everything interactive is an overlay
 * placed from normalized zone data, so layouts can change per restaurant.
 */
export class GameScene extends Phaser.Scene {
  private restaurant!: RestaurantDef;
  private bg!: BackgroundPlacement;
  private views: ZoneView[] = [];
  private highlight!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private particles!: ParticlePool;
  private showAll = false;
  private selectedId: string | null = null;

  constructor() {
    super('Game');
  }

  create(data: { restaurantId?: string }): void {
    const list = this.registry.get('restaurants') as RestaurantDef[];
    this.restaurant = list.find((r) => r.id === data.restaurantId) ?? list[0];

    const { width: iw, height: ih } = this.restaurant.backgroundSize;
    this.bg = fitBackground(LOGICAL_WIDTH, LOGICAL_HEIGHT, iw, ih);
    this.add
      .image(this.bg.x, this.bg.y, this.restaurant.background)
      .setOrigin(0, 0)
      .setDisplaySize(this.bg.width, this.bg.height)
      .setName('background');

    this.particles = new ParticlePool(this);
    this.buildZones();

    this.highlight = this.add.graphics().setDepth(900).setAlpha(0);
    this.label = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '24px', color: '#FFF4DC', stroke: '#2B1B17', strokeThickness: 5 })
      .setOrigin(0.5, 1)
      .setDepth(901)
      .setAlpha(0);

    // One scene-level handler: a single tap can only ever resolve to one zone.
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.keyboard?.on('keydown-Z', () => this.setShowAll(!this.showAll));
    this.setShowAll(new URLSearchParams(location.search).has('zones'));

    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.onFocus, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    CrazyGames.gameplayStart();

    (window as unknown as { __chefRush?: unknown }).__chefRush = {
      scene: this,
      zones: () => this.views.map((v) => ({ id: v.zone.id, station: v.zone.station, rect: v.rect })),
      selected: () => this.selectedId,
    };
  }

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

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const n = logicalToNorm(pointer.worldX, pointer.worldY, this.bg);
    const zone = hitTestZone(this.restaurant.zones, n.x, n.y);
    if (!zone) return;
    this.selectZone(zone);
  }

  private selectZone(zone: ZoneDef): void {
    const view = this.views.find((v) => v.zone.id === zone.id);
    if (!view) return;
    this.selectedId = zone.id;
    const text = handleStationTap(zone, SaveSystem.data.level);
    const { x, y, width, height } = view.rect;

    // Highlight overlay: a separate object, never part of the background.
    this.highlight.clear();
    this.highlight.fillStyle(0xfff4dc, 0.18).fillRoundedRect(x, y, width, height, 12);
    this.highlight.lineStyle(4, 0xf6c445, 1).strokeRoundedRect(x, y, width, height, 12);
    this.highlight.setAlpha(1);
    animGuard.cancel('highlight:fade');
    this.time.delayedCall(450, () => {
      if (this.selectedId === zone.id) fade(this, this.highlight, 0, 200, 'highlight');
    });

    this.label.setText(text).setPosition(x + width / 2, Math.max(y - 4, 30)).setAlpha(1);
    this.label.setScale(1);
    pop(this, this.label, 'label', 1.15, 180);
    this.time.delayedCall(900, () => {
      if (this.selectedId === zone.id) fade(this, this.label, 0, 200, 'label');
    });

    this.particles.burst(x + width / 2, y + height / 2, 0xf6c445, 6, Math.min(width, height) * 0.3, 350);
  }

  private onBlur(): void {
    CrazyGames.gameplayStop();
  }

  private onFocus(): void {
    CrazyGames.gameplayStart();
  }

  private cleanup(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.game.events.off(Phaser.Core.Events.FOCUS, this.onFocus, this);
    animGuard.cancelAll();
    this.particles.destroy();
    this.views = [];
    CrazyGames.gameplayStop();
  }
}
