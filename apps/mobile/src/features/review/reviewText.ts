/**
 * The words of the game review (#215), in the move list's notation:
 * "13 → 8, 6 → 5" on screen, and the move list's full sentences for
 * screen readers. Pure.
 */
import type { Dice, Move, Turn } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { choiceLabel, choiceShortLabel } from '@/features/accessibility/moveList';

import type { Mistake } from './review';

/**
 * The moves of a turn, one group per checker run: a move that goes on from
 * where the move before it landed joins it ("13 → 10 → 5"). The order stays
 * the order of the turn.
 */
export function moveRuns(moves: readonly Move[]): Move[][] {
  const runs: Move[][] = [];
  for (const move of moves) {
    const last = runs[runs.length - 1];
    const before = last?.[last.length - 1];
    if (last !== undefined && before !== undefined && before.to === move.from) last.push(move);
    else runs.push([move]);
  }
  return runs;
}

/** The moves on screen: "13 → 8, 6 → 5". */
export function turnShortText(t: TFunction, turn: Turn): string {
  return moveRuns(turn.moves)
    .map((run) => choiceShortLabel(t, run))
    .join(', ');
}

/** The moves for a screen reader: "Checker from point 13 to point 8; …". */
export function turnSpokenText(t: TFunction, turn: Turn): string {
  return moveRuns(turn.moves)
    .map((run) => choiceLabel(t, run))
    .join('; ');
}

/** The roll: "6-5". */
export const diceText = (dice: Dice) => dice.join('-');

/** Every line of one mistake. */
export interface MistakeText {
  /** "Big mistake". */
  readonly band: string;
  /** "Turn 12 · roll 6-5". */
  readonly turn: string;
  /** "You played: 13 → 7, 13 → 8" (pass-and-play: "Maria played: …"). */
  readonly played: string;
  /** "Best: 24 → 18 → 13". */
  readonly best: string;
  /** All of it, for a screen reader, with the moves in full sentences. */
  readonly label: string;
}

/**
 * The lines of a mistake. `name` is the player's name in pass-and-play,
 * `null` vs the bot (then it says "You played").
 */
export function mistakeText(t: TFunction, mistake: Mistake, name: string | null): MistakeText {
  const dice = mistake.state.dice ?? mistake.turn.dice;
  const vars = { number: mistake.state.turnNumber, dice: diceText(dice) };
  const band = t(`review.band.${mistake.band}`);
  const turn = t('review.turn', vars);
  const playedLine = (moves: string) =>
    name === null ? t('review.played_you', { moves }) : t('review.played', { name, moves });
  const played = playedLine(turnShortText(t, mistake.turn));
  const best = t('review.best', { moves: turnShortText(t, mistake.best) });
  const label = [
    band,
    turn,
    playedLine(turnSpokenText(t, mistake.turn)),
    t('review.best', { moves: turnSpokenText(t, mistake.best) }),
  ].join('. ');
  return { band, turn, played, best, label };
}
