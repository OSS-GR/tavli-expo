/**
 * The opening roll as the screen shows it (wireframe 6a). Pure.
 *
 * Each player rolls one die; a tie is rolled again; the higher die starts
 * and plays both dice (`useOpeningDice`). The card stays a moment after the
 * result, while the starter's first turn has begun.
 */
import type { DieValue, GameFlow, PlayerId } from '@tavli/engine';

export type OpeningStatus =
  | {
      readonly kind: 'rolling';
      readonly white: DieValue | null;
      readonly black: DieValue | null;
      /** The value of the last tie, if the round was rolled again. */
      readonly tie: DieValue | null;
    }
  | {
      readonly kind: 'decided';
      readonly white: DieValue;
      readonly black: DieValue;
      readonly starter: PlayerId;
    };

/** What the opening card shows, or `null` when there is no opening roll to show. */
export function openingStatus(game: GameFlow): OpeningStatus | null {
  const opening = game.opening;
  if (opening === null) return null;
  if (game.phase === 'opening-roll') {
    return {
      kind: 'rolling',
      white: opening.white,
      black: opening.black,
      tie: opening.ties[opening.ties.length - 1] ?? null,
    };
  }
  // Decided. Show it during the starter's first turn only.
  if (
    game.starter === null ||
    opening.white === null ||
    opening.black === null ||
    game.lastTurn !== null
  ) {
    return null;
  }
  return { kind: 'decided', white: opening.white, black: opening.black, starter: game.starter };
}

/** In pass-and-play each player taps for their own die: White first, then Black. */
export function nextOpeningRoller(game: GameFlow): PlayerId | null {
  if (game.phase !== 'opening-roll' || game.opening === null) return null;
  if (game.opening.white === null) return 'white';
  if (game.opening.black === null) return 'black';
  return null;
}
