import type { CookPhase } from '../cook';

/**
 * The brick oven door as a small pure state machine (no Phaser). One door serves both oven slots.
 * Rules (spec): the door never changes direction in the middle of its clip, and there is at least `minGap` seconds between two moves.
 * A change of target that arrives during a clip or during the gap is queued: only the latest wish matters when the door is free.
 *
 *  - target 'closed': something is baking and every occupied slot is still cooking;
 *  - target 'open': the oven is empty, or any slot is ready, overcooking or burnt (so the player can reach it).
 */
export type DoorState = 'open' | 'closing' | 'closed' | 'opening';
export type DoorTarget = 'open' | 'closed';

export function ovenDoorTarget(ovens: ReadonlyArray<{ phase: CookPhase } | null>): DoorTarget {
  const used = ovens.filter((o): o is { phase: CookPhase } => !!o);
  return used.length > 0 && used.every((o) => o.phase === 'cooking') ? 'closed' : 'open';
}

export class OvenDoorMachine {
  state: DoorState = 'open';
  /** Seconds since the current clip started (while moving). */
  elapsed = 0;
  /** Seconds since the last move ended. Starts large: the very first move is allowed at once. */
  sinceMove = Infinity;

  constructor(private minGap = 0.5, private openSeconds = 0.55, private closeSeconds = 0.55) {}

  get moving(): boolean {
    return this.state === 'opening' || this.state === 'closing';
  }
  /** 0..1 through the current clip (1 when still). */
  get progress(): number {
    if (!this.moving) return 1;
    const d = this.state === 'closing' ? this.closeSeconds : this.openSeconds;
    return Math.min(1, this.elapsed / d);
  }

  update(dt: number, target: DoorTarget): DoorState {
    if (this.moving) {
      this.elapsed += dt;
      const d = this.state === 'closing' ? this.closeSeconds : this.openSeconds;
      if (this.elapsed >= d) {
        this.state = this.state === 'closing' ? 'closed' : 'open';
        this.elapsed = 0;
        this.sinceMove = 0;
      }
      return this.state;
    }
    this.sinceMove += dt;
    const settled: DoorTarget = this.state === 'closed' ? 'closed' : 'open';
    if (target !== settled && this.sinceMove >= this.minGap) {
      this.state = target === 'closed' ? 'closing' : 'opening';
      this.elapsed = 0;
    }
    return this.state;
  }
}
