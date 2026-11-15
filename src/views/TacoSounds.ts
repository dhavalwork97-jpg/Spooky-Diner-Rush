import type { TacoEvent } from '../game/taco/TacoKitchenState';
import type { Sfx } from '../systems/AudioSystem';

/** The ghosts giggle when the combo reaches this (a throttle in AudioSystem keeps it from repeating). */
export const GIGGLE_FROM = 3;

/** Which sound effect a kitchen event makes (null = silent). Mostly the diner's sounds, plus the truck's own night sounds (owl, wolf, creak, giggle, regular's ding); all synthesized, no audio files. */
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
      return e.regular ? 'regular_ding' : 'coin';
    case 'comboChanged':
      return !e.broken && e.combo >= GIGGLE_FROM ? 'ghost_giggle' : null;
    case 'eventStart':
      return e.id === 'full_moon' ? 'wolf_howl' : e.id === 'bat_delivery' ? 'creak' : null;
    case 'menuGrew':
      return 'owl_hoot';
    case 'batCaught':
      return 'coin';
    case 'partyArrive':
      return 'party';
    case 'partyDone':
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
