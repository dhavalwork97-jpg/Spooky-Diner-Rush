// Which web portal's SDK this build talks to. The scenes only ever use `Portal`, so they do not care which one it is.
// The CrazyGames build uses the CrazyGames SDK (src/sdk/crazygames.ts); the Poki build uses the Poki SDK (src/sdk/poki.ts).
// The two are never mixed: the Poki build does not load the CrazyGames script and the CrazyGames build does not load the Poki one.
import { IS_POKI_BUILD } from '../build/target';
import { CrazyGames } from './crazygames';
import { Poki } from './poki';

/** What a scene needs from a portal SDK. Both implementations have exactly this shape. */
export interface PortalSdk {
  init(ms?: number): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  canShowAd(now?: number): boolean;
  midgameAd(onStart: () => void, now?: number): Promise<boolean>;
  canShowRewarded(): boolean;
  rewardedAd(onStart: () => void, now?: number): Promise<boolean>;
  gameplayStart(): void;
  gameplayStop(): void;
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
}

export const Portal: PortalSdk = IS_POKI_BUILD ? Poki : CrazyGames;
