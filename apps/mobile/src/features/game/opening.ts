/**
 * The opening roll as the screen shows it (wireframe 6a, #176). Pure.
 *
 * Each player rolls one die; a tie is rolled again; the higher die starts
 * and plays both dice (`useOpeningDice`), or rolls both dice again (the
 * house rule `rerollBoth`, #207). With `chosenStarterRolls` there is no
 * roll: the players pick the starter (`isChoosingStarter`).
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
import type { DieValue, GameFlow, MatchFlow, PlayerId } from '@tavli/engine';

import { diceWereRolled } from './rolledDice';

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
  // Decided. Show it during the starter's first turn only. With
  // `rerollBoth` (#207) the opening gives no dice: dice in play came from
  // the starter's own roll, so the opening is over (a remount or a resume
  // must not bring the card back over them).
  const rolledAgain =
    game.state.dice !== null && game.state.rules.match.openingRoll !== 'useOpeningDice';
  if (
    game.starter === null ||
    opening.white === null ||
    opening.black === null ||
    game.lastTurn !== null ||
    rolledAgain
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

/**
 * The dice in play are the two opening dice (`useOpeningDice`): the
 * starter's first turn, and no roll in this game yet. The opening card
 * already showed them, so they lie still and are not read again. With
 * `rerollBoth` (#207) the starter's first dice are a roll of their own.
 */
export function openingDiceInPlay(flow: MatchFlow): boolean {
  const game = flow.game;
  return (
    game.opening !== null &&
    game.lastTurn === null &&
    game.state.dice !== null &&
    !diceWereRolled(flow)
  );
}

/**
 * The house rule `chosenStarterRolls` (#207): the game waits for the
 * players to pick who starts (the engine's `chooseStarter`). The engine
 * keeps no opening roll then (`opening: null`).
 */
export function isChoosingStarter(game: GameFlow): boolean {
  return game.phase === 'opening-roll' && game.opening === null;
}

/** In pass-and-play each player taps for their own die: White first, then Black. */
export function nextOpeningRoller(game: GameFlow): PlayerId | null {
  if (game.phase !== 'opening-roll' || game.opening === null) return null;
  if (game.opening.white === null) return 'white';
  if (game.opening.black === null) return 'black';
  return null;
}
