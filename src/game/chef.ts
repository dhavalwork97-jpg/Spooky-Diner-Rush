import type { GameEvent } from './KitchenState';
import type { ChefConfig } from './config';
import type { Rng } from './rng';

export interface ChefLine {
  trigger: string;
  text: string;
  /** Seconds the bubble stays up. */
  hold: number;
}

/**
 * Picks the chef's speech lines. Pure: no Phaser, no timers. The caller passes the
 * current model time in seconds. A global cooldown keeps the chef from chattering,
 * each trigger has its own longer cooldown, `once` triggers fire one time per run,
 * and `priority` triggers (a level-up) skip the global cooldown.
 */
export class ChefTalk {
  private lastAny = -Infinity;
  private lastByTrigger = new Map<string, number>();
  private lastLine = new Map<string, string>();
  private done = new Set<string>();
  private orders = 0;

  constructor(private cfg: ChefConfig, private rng: Rng) {}

  /** Map a model event to a trigger and try to say it. */
  onEvent(e: GameEvent, now: number): ChefLine | null {
    switch (e.type) {
      case 'orderDone':
        this.orders++;
        if (this.orders === 1) return this.say('first_serve', now);
        return e.rush ? this.say('rush', now) : null;
      case 'comboChanged':
        return !e.broken && (e.combo === 3 || e.combo === e.max) ? this.say('combo', now) : null;
      case 'burnt':
        return this.say('burn', now);
      case 'angryLeave':
        return this.say('angry', now);
      case 'eventStart':
        return this.say(e.id === 'full_moon' ? 'full_moon' : 'event', now);
      case 'batCaught':
        return this.say('bat', now);
      case 'partyDone':
        return this.say('party', now);
      case 'levelUp':
        return this.say('level_up', now);
      default:
        return null;
    }
  }

  /** Say a line for a trigger, or null when it is on cooldown, used up, or unknown. */
  say(trigger: string, now: number): ChefLine | null {
    const def = this.cfg.triggers[trigger];
    if (!def || def.lines.length === 0) return null;
    if (def.once && this.done.has(trigger)) return null;
    if (!def.priority && now - this.lastAny < this.cfg.cooldown) return null;
    if (now - (this.lastByTrigger.get(trigger) ?? -Infinity) < this.cfg.triggerCooldown && !def.priority) return null;

    const prev = this.lastLine.get(trigger);
    const pool = def.lines.length > 1 ? def.lines.filter((l) => l !== prev) : def.lines;
    const text = pool[Math.min(pool.length - 1, Math.floor(this.rng() * pool.length))];

    this.lastAny = now;
    this.lastByTrigger.set(trigger, now);
    this.lastLine.set(trigger, text);
    if (def.once) this.done.add(trigger);
    return { trigger, text, hold: this.cfg.hold };
  }
}
