/**
 * Keeps one running animation per (target, kind) key, so repeated taps
 * restart or are ignored instead of stacking duplicates.
 * Pure TypeScript so it can be tested without Phaser.
 */
export interface Cancelable {
  stop(): void;
}

export class AnimGuard {
  private running = new Map<string, Cancelable>();

  /** Start an animation. 'restart' stops the old one first, 'ignore' keeps it. */
  start(key: string, create: () => Cancelable, mode: 'restart' | 'ignore' = 'restart'): boolean {
    const existing = this.running.get(key);
    if (existing) {
      if (mode === 'ignore') return false;
      existing.stop();
    }
    this.running.set(key, create());
    return true;
  }

  /** Call from the animation's completion handler. */
  finish(key: string): void {
    this.running.delete(key);
  }

  cancel(key: string): void {
    this.running.get(key)?.stop();
    this.running.delete(key);
  }

  cancelAll(): void {
    for (const a of this.running.values()) a.stop();
    this.running.clear();
  }

  get size(): number {
    return this.running.size;
  }
}

/**
 * The resting value (scale, x, y) of a target while an animation of one key is in flight. A restart reads the
 * value from here, not from the target, which is already mid-animation: otherwise every overlapping restart
 * ratchets the rest value up (the HUD coin icon grew to fill the screen).
 */
export class RestValues<T> {
  private values = new Map<string, T>();

  /** The rest value in flight for this key, or `current` when nothing is animating. */
  of(key: string, current: T): T {
    return this.values.get(key) ?? current;
  }

  set(key: string, value: T): void {
    this.values.set(key, value);
  }

  clear(key: string): void {
    this.values.delete(key);
  }
}
