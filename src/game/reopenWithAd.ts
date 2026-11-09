import type { AdService } from '../ads/types';

/** What the screen that shows the Closed overlay (the diner or the Taco Truck) does around a rewarded Reopen. */
export interface ReopenAdHooks {
  /** An ad really started: freeze the kitchen and the sound. */
  onStart(): void;
  /** The ad is over (watched, closed early, failed or timed out): undo what `onStart` did. Runs BEFORE the reward is granted. */
  onAdOver(): void;
  /** The reward was granted (the ad was watched to the end). */
  onRewarded?(): void;
  /** No reward (no ad available, closed early, error). The normal Reopen is still available. */
  onNoReward?(): void;
}

/** The only thing the reward needs from the kitchen model. */
export interface Reopenable {
  reopen(rewarded?: boolean): void;
}

/**
 * Rewarded Reopen, shared by the diner and the Taco Truck, on every platform and with every ad network.
 * This is the ONE place that grants the rewarded Reopen (100 reputation, see `KitchenState.reopen`; a normal Reopen gives 55),
 * and it does so only after the ad network confirmed the reward (`rewardedAd` resolves true). It never grants it before.
 */
export async function reopenWithAd(state: Reopenable, ads: Pick<AdService, 'rewardedAd'>, hooks: ReopenAdHooks): Promise<boolean> {
  let finished = false;
  try {
    finished = await ads.rewardedAd(hooks.onStart);
  } catch {
    finished = false; // an ad network must never block the player
  }
  hooks.onAdOver();
  if (finished) {
    state.reopen(true);
    hooks.onRewarded?.();
  } else {
    hooks.onNoReward?.();
  }
  return finished;
}
