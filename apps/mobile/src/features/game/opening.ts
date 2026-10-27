/**
 * The opening roll as the screen shows it (wireframe 6a, #176). Pure.
 *
 * Each player rolls one die; a tie is rolled again; the higher die starts
 * and plays both dice (`useOpeningDice`).
 *
 * - `rolling`: a round is under way. A die that is not rolled yet is `null`.
 * - `tie`: the last round was a tie. The engine has already cleared the
 *   round, but the card keeps both tied dice on screen until the next roll,
 *   so the players see what happened.
 * - `decided`: the higher die starts. The card stays a moment, while the
 *   starter's first turn has begun.
 *
 * `round` counts the rounds from 0 (each tie starts a new one). The card
 * keys each die on it, so a die rolls again only in a new round.
 */
import type { DieValue, GameFlow, PlayerId } from '@tavli/engine';

export type OpeningStatus =
  | {
      readonly kind: 'rolling';
      readonly white: DieValue | null;
      readonly black: DieValue | null;
      readonly round: number;
    }
  | {
      readonly kind: 'tie';
      /** Both players rolled this value. */
      readonly value: DieValue;
      /** The round that was a tie. */
      readonly round: number;
    }
  | {
      readonly kind: 'decided';
      readonly white: DieValue;
      readonly black: DieValue;
      readonly starter: PlayerId;
      readonly round: number;
    };

/** What the opening card shows, or `null` when there is no opening roll to show. */
export function openingStatus(game: GameFlow): OpeningStatus | null {
  const opening = game.opening;
  if (opening === null) return null;
  const round = opening.ties.length;
  if (game.phase === 'opening-roll') {
    const tie = opening.ties[round - 1];
    if (tie !== undefined && opening.white === null && opening.black === null) {
      return { kind: 'tie', value: tie, round: round - 1 };
    }
    return { kind: 'rolling', white: opening.white, black: opening.black, round };
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
  return {
    kind: 'decided',
    white: opening.white,
    black: opening.black,
    starter: game.starter,
    round,
  };
}

/** The die each player shows on the card. A tie shows the tied value for both. */
export function openingDice(status: OpeningStatus): {
  white: DieValue | null;
  black: DieValue | null;
} {
  if (status.kind === 'tie') return { white: status.value, black: status.value };
  return { white: status.white, black: status.black };
}

/** In pass-and-play each player taps for their own die: White first, then Black. */
export function nextOpeningRoller(game: GameFlow): PlayerId | null {
  if (game.phase !== 'opening-roll' || game.opening === null) return null;
  if (game.opening.white === null) return 'white';
  if (game.opening.black === null) return 'black';
  return null;
}
