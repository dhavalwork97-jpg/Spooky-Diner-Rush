import badgesJson from '../../data/badges.json';

/**
 * Badges: ten lifetime goals shown on the Badges page (Recipe Book, second tab). Each badge watches one counter in `SaveData.stats`; when the
 * counter reaches the target the badge is earned once and a small toast shows. No coin reward. Pure logic (no Phaser), so it is unit tested.
 */
export interface BadgeDef {
  id: string;
  name: string;
  /** The goal text shown on the Badges page (also for a locked badge). */
  goal: string;
  /** Which counter in `stats` the badge watches. */
  stat: string;
  target: number;
  /** Art name in public/assets/diner_extras/badges. */
  art: string;
}

export const defaultBadges: BadgeDef[] = (badgesJson as { badges: BadgeDef[] }).badges;

export type Stats = Record<string, number>;

/** Things the game tells the badge counters about. */
export type BadgeEvent =
  | { type: 'serve'; rush: boolean; atMaxCombo: boolean; duringMoon: boolean; regular: boolean }
  | { type: 'burn' }
  | { type: 'mastery' }
  | { type: 'bat' }
  | { type: 'party' }
  | { type: 'chest' }
  | { type: 'pumpkin' }
  | { type: 'coins'; amount: number };

const bump = (s: Stats, key: string, n = 1): void => {
  s[key] = Math.min(100000, (s[key] ?? 0) + n);
};

/** The counters after one event (returns a new object). A burn ends the "without a burn" run. */
export function track(stats: Readonly<Stats>, e: BadgeEvent): Stats {
  const s: Stats = { ...stats };
  switch (e.type) {
    case 'serve':
      bump(s, 'cleanRun');
      if (e.rush) bump(s, 'rushServes');
      if (e.atMaxCombo) bump(s, 'maxCombos');
      if (e.duringMoon) bump(s, 'moonServes');
      if (e.regular) bump(s, 'regularServes');
      break;
    case 'burn':
      delete s.cleanRun;
      break;
    case 'mastery':
      bump(s, 'masteries');
      break;
    case 'bat':
      bump(s, 'bats');
      break;
    case 'party':
      bump(s, 'parties');
      break;
    case 'chest':
      bump(s, 'chests');
      break;
    case 'pumpkin':
      bump(s, 'pumpkins');
      break;
    case 'coins':
      if (e.amount > 0) bump(s, 'coinsEarned', Math.floor(e.amount));
      break;
  }
  return s;
}

/** Badges whose counter has reached the target and that are not earned yet. */
export const newlyEarned = (defs: readonly BadgeDef[], stats: Readonly<Stats>, have: readonly string[]): BadgeDef[] =>
  defs.filter((d) => !have.includes(d.id) && (stats[d.stat] ?? 0) >= d.target);

/** "12 / 50" style progress for a badge (capped at the target). */
export const progressOf = (d: BadgeDef, stats: Readonly<Stats>): { have: number; target: number } => ({ have: Math.min(d.target, stats[d.stat] ?? 0), target: d.target });

export function validateBadges(defs: readonly BadgeDef[], artNames: readonly string[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const d of defs) {
    const w = `badge ${d.id || '?'}`;
    if (!d.id || ids.has(d.id)) errors.push(`${w}: missing or duplicate id`);
    ids.add(d.id);
    if (!d.name || d.name.length > 18) errors.push(`${w}: name must be 1 to 18 characters`);
    if (!d.goal || d.goal.length > 70) errors.push(`${w}: goal must be 1 to 70 characters`);
    if (!d.stat) errors.push(`${w}: missing stat`);
    if (!Number.isInteger(d.target) || d.target < 1 || d.target > 100000) errors.push(`${w}: target must be a whole number from 1 to 100000`);
    if (!artNames.includes(d.art)) errors.push(`${w}: art ${d.art} not found`);
  }
  return errors;
}
