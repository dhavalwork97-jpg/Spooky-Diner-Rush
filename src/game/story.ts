import type { GameConfig, StoryCardDef } from './config';

/**
 * The story card to show now: among cards not yet seen whose level is reached, the one with
 * the highest level (first in the file wins a tie). Showing only the latest keeps a returning
 * player at a high level from sitting through every old card.
 */
export function dueStory(cfg: GameConfig, level: number, seen: readonly string[]): StoryCardDef | null {
  let best: StoryCardDef | null = null;
  for (const c of cfg.story.cards) {
    if (c.level > level || seen.includes(c.id)) continue;
    if (!best || c.level > best.level) best = c;
  }
  return best;
}

/** The seen list after showing `card`: it and every card at or below its level count as seen. */
export function seenAfter(cfg: GameConfig, seen: readonly string[], card: StoryCardDef): string[] {
  const out = [...seen];
  for (const c of cfg.story.cards) if (c.level <= card.level && !out.includes(c.id)) out.push(c.id);
  return out;
}
