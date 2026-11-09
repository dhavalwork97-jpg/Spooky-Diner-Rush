import { describe, expect, it, vi } from 'vitest';
import { KitchenState } from '../src/game/KitchenState';
import { reopenWithAd } from '../src/game/reopenWithAd';

const closedState = (): KitchenState => {
  const s = new KitchenState();
  (s as unknown as { addReputation(d: number): void }).addReputation(-1000);
  return s;
};
const hooks = () => ({ onStart: vi.fn(), onAdOver: vi.fn(), onRewarded: vi.fn(), onNoReward: vi.fn() });

describe('the shared rewarded Reopen', () => {
  it('grants 100 reputation only after the ad network confirmed the reward', async () => {
    const s = closedState();
    const h = hooks();
    let reputationWhenAdEnded = -1;
    h.onAdOver.mockImplementation(() => {
      reputationWhenAdEnded = s.reputation;
    });
    const ok = await reopenWithAd(s, { rewardedAd: () => Promise.resolve(true) }, h);
    expect(ok).toBe(true);
    expect(reputationWhenAdEnded).toBeLessThan(55); // still closed when the ad ended: nothing was granted early
    expect(s.reputation).toBe(100);
    expect(h.onRewarded).toHaveBeenCalledTimes(1);
    expect(h.onNoReward).not.toHaveBeenCalled();
  });

  it('gives nothing when no reward was earned (closed early, no ad, timeout)', async () => {
    const s = closedState();
    const before = s.reputation;
    const h = hooks();
    expect(await reopenWithAd(s, { rewardedAd: () => Promise.resolve(false) }, h)).toBe(false);
    expect(s.reputation).toBe(before);
    expect(h.onAdOver).toHaveBeenCalledTimes(1);
    expect(h.onNoReward).toHaveBeenCalledTimes(1);
    expect(h.onRewarded).not.toHaveBeenCalled();
  });

  it('an ad network that throws gives nothing and never leaves the game frozen', async () => {
    const s = closedState();
    const before = s.reputation;
    const h = hooks();
    const ok = await reopenWithAd(s, { rewardedAd: () => Promise.reject(new Error('sdk')) }, h);
    expect(ok).toBe(false);
    expect(s.reputation).toBe(before);
    expect(h.onAdOver).toHaveBeenCalledTimes(1);
  });

  it('passes the start hook to the ad network', async () => {
    const h = hooks();
    await reopenWithAd(closedState(), { rewardedAd: (onStart) => (onStart(), Promise.resolve(true)) }, h);
    expect(h.onStart).toHaveBeenCalledTimes(1);
  });
});
