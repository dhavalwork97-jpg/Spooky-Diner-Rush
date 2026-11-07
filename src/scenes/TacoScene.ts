import Phaser from 'phaser';
import { fitBackground, logicalToNorm, type BackgroundPlacement } from '../kitchen/zones';
import { TacoKitchenState } from '../game/taco/TacoKitchenState';
import { defaultTacoConfig } from '../game/taco/tacoConfig';
import { hitTestTaco, tapZone } from '../game/taco/tacoZones';
import { modsFor } from '../game/shop';
import type { RestaurantSelectData } from './RestaurantSelectScene';
import { SaveSystem } from '../systems/SaveSystem';
import { audio } from '../systems/AudioSystem';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './BootScene';

const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
const SAVE_EVERY_MS = 5000;
/** Extra reach (0-1 of the art) for taps that miss every zone, so a finger can hit small zones. */
const TAP_SLOP = 0.025;

/**
 * The Taco Truck. This is the first playable shell: the real kitchen model (TacoKitchenState) runs and every zone tap works,
 * with the pack art as background and a plain text status on top. The animated views (pans, oven, plates, customers) are the next step.
 */
export class TacoScene extends Phaser.Scene {
  private state!: TacoKitchenState;
  private bg!: BackgroundPlacement;
  private status!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private noteUntil = 0;
  private lastSave = 0;
  private panelOpen = false;

  constructor() {
    super('Taco');
  }

  preload(): void {
    const a = defaultTacoConfig.art;
    this.load.image('taco_back', `${a.folder}/${a.back}.webp`);
    this.load.image('taco_front', `${a.folder}/${a.front}.webp`);
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.error(`Missing asset: ${file.key} (${file.url})`));
  }

  create(): void {
    this.panelOpen = false;
    const a = defaultTacoConfig.art;
    this.bg = fitBackground(LOGICAL_WIDTH, LOGICAL_HEIGHT, a.width, a.height);
    const layer = (key: string, depth: number) =>
      this.add.image(this.bg.x, this.bg.y, key).setOrigin(0, 0).setDisplaySize(this.bg.width, this.bg.height).setDepth(depth).setName(key);
    layer('taco_back', 0);
    layer('taco_front', 20);

    const save = SaveSystem.data;
    this.state = new TacoKitchenState({ level: save.level, xp: save.xp, coins: save.coins });
    this.state.mods = modsFor(this.state.cfg.upgrades.upgrades, save.owned);

    this.status = this.add.text(16, 12, '', { fontFamily: FONT, fontSize: '26px', color: '#FFF3D6', stroke: '#2B1B17', strokeThickness: 5 }).setDepth(40);
    this.note = this.add.text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 40, '', { fontFamily: FONT, fontSize: '30px', color: '#FFE08A', stroke: '#2B1B17', strokeThickness: 6 }).setOrigin(0.5).setDepth(40);

    this.makeButton(LOGICAL_WIDTH - 150, 40, 'Restaurants', 260, 56, () => this.openRestaurants());
    if (new URLSearchParams(location.search).has('debug')) this.drawZones();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));
    this.lastSave = performance.now();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.saveNow());
  }

  override update(_time: number, delta: number): void {
    if (this.panelOpen) return;
    this.state.update(Math.min(delta, 100) / 1000);
    for (const e of this.state.events) {
      if (e.type === 'invalid') this.say(e.message);
      else if (e.type === 'levelUp') this.say(`Level ${e.level}!`);
      else if (e.type === 'closed') this.say('Closed: reputation ran out');
    }
    this.state.events = [];
    const s = this.state;
    this.status.setText(`Lv ${s.level}   Coins ${s.coins}   Rep ${Math.round(s.reputation)}   Customers ${s.customers.length}`);
    if (this.noteUntil && performance.now() > this.noteUntil) {
      this.note.setText('');
      this.noteUntil = 0;
    }
    if (performance.now() - this.lastSave > SAVE_EVERY_MS) this.saveNow();
  }

  private onTap(p: Phaser.Input.Pointer): void {
    if (this.panelOpen || this.state.closed) return;
    const n = logicalToNorm(p.worldX, p.worldY, this.bg);
    const z = hitTestTaco(defaultTacoConfig.zones, n.x, n.y, TAP_SLOP);
    if (z) tapZone(this.state, z);
  }

  private say(text: string): void {
    this.note.setText(text);
    this.noteUntil = performance.now() + 1800;
  }

  private saveNow(): void {
    SaveSystem.data.level = this.state.level;
    SaveSystem.data.xp = this.state.xp;
    SaveSystem.data.coins = this.state.coins;
    SaveSystem.save();
    this.lastSave = performance.now();
  }

  private openRestaurants(): void {
    if (this.panelOpen) return;
    this.saveNow();
    this.panelOpen = true;
    const data: RestaurantSelectData = {
      state: this.state,
      current: defaultTacoConfig.restaurant.id,
      onClose: () => {
        this.panelOpen = false;
        this.scene.resume();
      },
      onPick: (id: string) => (id === defaultTacoConfig.restaurant.id ? this.scene.restart() : this.scene.start('Game', { restaurantId: id })),
    };
    this.scene.launch('RestaurantSelect', data);
    this.scene.pause();
  }

  private makeButton(x: number, y: number, label: string, w: number, h: number, onClick: () => void): void {
    const box = this.add.rectangle(x, y, w, h, 0xf28c28).setStrokeStyle(4, 0x2b1b17).setDepth(40).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '28px', color: '#2B1B17' }).setOrigin(0.5).setDepth(41);
    box.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      audio.play('click');
      onClick();
    });
  }

  /** ?debug: outline every tap zone. */
  private drawZones(): void {
    const g = this.add.graphics().setDepth(39);
    g.lineStyle(2, 0x00ff88, 0.9);
    for (const z of defaultTacoConfig.zones) g.strokeRect(this.bg.x + z.x * this.bg.width, this.bg.y + z.y * this.bg.height, z.width * this.bg.width, z.height * this.bg.height);
  }
}
