import type { TacoEvent } from '../game/taco/TacoKitchenState';
import type { Sfx } from '../systems/AudioSystem';

/** Which existing sound effect a kitchen event makes (null = silent). Reuses the diner's sounds; no new audio files. */
export function sfxFor(e: TacoEvent): Sfx | null {
  switch (e.type) {
    case 'proteinStart':
    case 'ovenStart':
    case 'pressStart':
    case 'drinkStart':
    case 'buildStart':
    case 'stepAdded':
    case 'collect':
      return 'pop';
    case 'panPhase':
    case 'ovenPhase':
    case 'drinkPhase':
      return e.phase === 'ready' ? 'ding' : null;
    case 'dishDone':
    case 'arrive':
      return 'ding';
    case 'deliver':
      return 'drop';
    case 'orderDone':
      return 'coin';
    case 'burnt':
      return 'burn';
    case 'discard':
      return e.penalty ? 'wrong' : 'drop';
    case 'wrongDrop':
    case 'invalid':
    case 'angryLeave':
      return 'wrong';
    case 'levelUp':
      return 'levelUp';
    case 'closed':
      return 'close';
    default:
      return null;
  }
}
