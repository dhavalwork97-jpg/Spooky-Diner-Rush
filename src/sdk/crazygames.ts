// Safe wrapper around the CrazyGames SDK. Every call is a no-op when the SDK is absent,
// so the game also runs locally and in tests.

interface CGData {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface CGSdk {
  init?: () => Promise<void>;
  game?: { gameplayStart?: () => void; gameplayStop?: () => void };
  data?: CGData;
}

function sdk(): CGSdk | undefined {
  return (globalThis as { CrazyGames?: { SDK?: CGSdk } }).CrazyGames?.SDK;
}

let playing = false;

export const CrazyGames = {
  /** Initialise the SDK (it must finish before the save data or any other call is used). Never throws; gives up after `ms`. */
  async init(ms = 3000): Promise<void> {
    try {
      const s = sdk();
      if (!s?.init) return;
      await Promise.race([s.init(), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
    } catch {
      /* the SDK is disabled on other domains and rejects: play without it */
    }
  },
  gameplayStart(): void {
    if (playing) return;
    playing = true;
    try {
      sdk()?.game?.gameplayStart?.();
    } catch {
      /* SDK errors must never break the game */
    }
  },
  gameplayStop(): void {
    if (!playing) return;
    playing = false;
    try {
      sdk()?.game?.gameplayStop?.();
    } catch {
      /* ignore */
    }
  },
  getItem(key: string): string | null {
    try {
      const d = sdk()?.data;
      if (d) return d.getItem(key);
    } catch {
      /* fall through to localStorage */
    }
    return null;
  },
  setItem(key: string, value: string): boolean {
    try {
      const d = sdk()?.data;
      if (d) {
        d.setItem(key, value);
        return true;
      }
    } catch {
      /* fall through */
    }
    return false;
  },
};
