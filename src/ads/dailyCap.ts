/** Most interstitials shown per calendar day (local time). The LevelPlay dashboard has the same cap; this is the game-side safeguard. */
export const MAX_INTERSTITIALS_PER_DAY = 3;

const KEY = 'sdr.interstitialsToday';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage can throw in private windows and previews
  }
}

function dayOf(now: number): string {
  const d = new Date(now);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Counts interstitials that really started today. Kept in storage so restarting the app does not reset it, with an in-memory
 * copy so a failing storage can never allow extra ads. Never throws.
 */
export class DailyCap {
  private mem = { day: '', n: 0 };
  constructor(
    private readonly max: number = MAX_INTERSTITIALS_PER_DAY,
    private readonly store: Store | null = defaultStore(),
  ) {}

  private count(now: number): number {
    const day = dayOf(now);
    let stored = 0;
    try {
      const raw = this.store?.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as { day?: unknown; n?: unknown };
        if (p.day === day && typeof p.n === 'number' && Number.isFinite(p.n)) stored = p.n;
      }
    } catch {
      /* ignore: the memory copy still counts */
    }
    const mem = this.mem.day === day ? this.mem.n : 0;
    return Math.max(stored, mem);
  }

  canShow(now: number): boolean {
    return this.count(now) < this.max;
  }

  record(now: number): void {
    const n = this.count(now) + 1;
    this.mem = { day: dayOf(now), n };
    try {
      this.store?.setItem(KEY, JSON.stringify(this.mem));
    } catch {
      /* ignore */
    }
  }
}
