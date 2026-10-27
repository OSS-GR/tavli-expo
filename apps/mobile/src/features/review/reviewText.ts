/**
 * The words of the game review (#215), in the move list's notation:
 * "13 → 8, 6 → 5" on screen, and the move list's full sentences for
 * screen readers. The moves use the Hint's helpers (`hintText.ts`), so the
 * two read the same. Pure.
 */
import type { Dice, Turn } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { movesShortText, movesSpokenText } from '@/features/hint/hintText';

import type { Mistake } from './review';

/** The moves of a turn on screen: "13 → 8, 6 → 5". */
export const turnShortText = (t: TFunction, turn: Turn) => movesShortText(t, turn.moves);

/** The moves of a turn for a screen reader: "Checker from point 13 to point 8; …". */
export const turnSpokenText = (t: TFunction, turn: Turn) => movesSpokenText(t, turn.moves);

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
