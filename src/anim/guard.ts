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
