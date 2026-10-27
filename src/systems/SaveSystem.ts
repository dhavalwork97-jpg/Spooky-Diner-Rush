import { CrazyGames } from '../sdk/crazygames';

export interface SaveData {
  version: 1;
  level: number;
  xp: number;
  coins: number;
  settings: { reduceMotion: boolean | null; musicVolume: number; sfxVolume: number; muted: boolean };
}

const KEY = 'chef-rush-save';

export function defaultSave(): SaveData {
  return {
    version: 1,
    level: 1,
    xp: 0,
    coins: 0,
    settings: { reduceMotion: null, musicVolume: 0.6, sfxVolume: 0.8, muted: false },
  };
}

function read(key: string): string | null {
  const fromSdk = CrazyGames.getItem(key);
  if (fromSdk !== null) return fromSdk;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (CrazyGames.setItem(key, value)) return;
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable: play on without saving */
  }
}

/** Merge unknown input over defaults so old or corrupt saves never crash the game. */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave();
  if (!raw) return base;
  try {
    const p = JSON.parse(raw) as Partial<SaveData>;
    const num = (v: unknown, d: number, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : d);
    return {
      version: 1,
      level: Math.max(1, Math.floor(num(p.level, base.level, 1))),
      xp: num(p.xp, base.xp),
      coins: Math.floor(num(p.coins, base.coins)),
      settings: {
        reduceMotion: typeof p.settings?.reduceMotion === 'boolean' ? p.settings.reduceMotion : null,
        musicVolume: Math.min(1, num(p.settings?.musicVolume, base.settings.musicVolume)),
        sfxVolume: Math.min(1, num(p.settings?.sfxVolume, base.settings.sfxVolume)),
        muted: p.settings?.muted === true,
      },
    };
  } catch {
    return base;
  }
}

export const SaveSystem = {
  data: defaultSave(),
  load(): SaveData {
    this.data = parseSave(read(KEY));
    return this.data;
  },
  save(): void {
    write(KEY, JSON.stringify(this.data));
  },
  /** Reduced motion: explicit setting wins, otherwise follow the OS preference. */
  reduceMotion(): boolean {
    if (this.data.settings.reduceMotion !== null) return this.data.settings.reduceMotion;
    try {
      return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      return false;
    }
  },
};
