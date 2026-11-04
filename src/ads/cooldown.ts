import { AD_GAP_MS } from './timing';

/** The spacing between mid-game ads. Same rules as the CrazyGames wrapper: an ad request starts it, and a watched rewarded ad restarts it. */
export class AdCooldown {
  private last = -Infinity;
  constructor(private readonly gapMs: number = AD_GAP_MS) {}
  ready(now: number): boolean {
    return now - this.last >= this.gapMs;
  }
  mark(now: number): void {
    this.last = now;
  }
  reset(): void {
    this.last = -Infinity;
  }
}
