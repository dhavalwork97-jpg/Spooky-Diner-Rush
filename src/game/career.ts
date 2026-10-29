import type { CareerTitle, GameConfig } from './config';

/** Titles sorted by minLevel (the validator enforces this order for the data file). */
const titles = (cfg: GameConfig): CareerTitle[] => cfg.career.titles;

/** The title that applies at a level: the highest band whose minLevel is reached. */
export function titleForLevel(cfg: GameConfig, level: number): CareerTitle {
  const list = titles(cfg);
  let best = list[0];
  for (const t of list) if (level >= t.minLevel) best = t;
  return best;
}

/** The next title still to earn, or null at the top band. */
export function nextTitle(cfg: GameConfig, level: number): CareerTitle | null {
  return titles(cfg).find((t) => t.minLevel > level) ?? null;
}

/** The new title if reaching `level` crosses into a new band, otherwise null. */
export function titleEarnedAt(cfg: GameConfig, level: number): CareerTitle | null {
  if (level <= 1) return null;
  const now = titleForLevel(cfg, level);
  return now.minLevel === level ? now : null;
}
