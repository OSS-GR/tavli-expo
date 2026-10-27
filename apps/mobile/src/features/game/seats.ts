/**
 * How the board screen names each player. The names come from the match
 * setup in the app language, so a language switch renames the players.
 */
import type { PerPlayer } from '@tavli/engine';

export interface Seat {
  /** In sentences and the score line: "Maria", "You", "Bot". */
  readonly name: string;
  /** In the player strip, for example "Bot · Easy". */
  readonly label: string;
  /** The pill on the active strip: "Your turn", "Playing", "Maria’s turn". */
  readonly turnLabel: string;
  /** The human vs the bot: texts say "you" ("You win the game!"). */
  readonly you: boolean;
}

/** Seats from plain names, with one pill text for both (the default of GameScreen, tests). */
export function plainSeats(names: PerPlayer<string>, turnLabel: string): PerPlayer<Seat> {
  return {
    white: { name: names.white, label: names.white, turnLabel, you: false },
    black: { name: names.black, label: names.black, turnLabel, you: false },
  };
}
