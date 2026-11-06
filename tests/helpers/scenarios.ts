import { play, type Run, type UpgradePlan } from './bot';

/** Shopping plans, bots and a runner shared by the upgrade balance report and the speed-upgrade regression tests. */
export const SCENARIOS: Record<string, boolean | UpgradePlan> = {
  none: false,
  'burn only': { allow: ['burn_guard'] },
  'calm only': { allow: ['calm_kitchen'] },
  'burn + calm': { allow: ['burn_guard', 'calm_kitchen'] },
  'old five': { allow: ['fryer_speed', 'grill_speed', 'oven_speed', 'patience', 'tips'] },
  'all, cheapest first': true,
  'all, guards first': { priority: ['burn_guard', 'calm_kitchen'] },
  'all, speed first': { priority: ['fryer_speed', 'grill_speed', 'oven_speed'] },
  'speed only': { allow: ['fryer_speed', 'grill_speed', 'oven_speed'] },
  'fryer speed only': { allow: ['fryer_speed'] },
  'grill speed only': { allow: ['grill_speed'] },
  'oven speed only': { allow: ['oven_speed'] },
  'speed + burn guard': { allow: ['fryer_speed', 'grill_speed', 'oven_speed', 'burn_guard'] },
  'comfort set': { allow: ['patience', 'tips', 'burn_guard', 'calm_kitchen'] },
};

export const BOTS = {
  fast: { reaction: 0.8, seconds: 6500 },
  average: { reaction: 1.3, seconds: 5700 },
  casual: { reaction: 2.0, seconds: 4800 },
} as const;
export type BotName = keyof typeof BOTS;

export function runAll(scenario: string, bot: BotName, seeds: number[], prepBun = false): Run[] {
  const b = BOTS[bot];
  return seeds.map((seed) => play(seed, b.reaction, b.seconds, { upgrades: SCENARIOS[scenario], prepBun }));
}

