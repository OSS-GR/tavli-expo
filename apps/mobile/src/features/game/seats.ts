/**
 * How the board screen names each player. The names come from the match
 * setup in the app language, so a language switch renames the players.
 */
import type { PerPlayer } from '@tavli/engine';

export interface Seat {
  /** In sentences and the score line: "Maria", "You", "Bot". */
  readonly name: string;
  /** The name on the seat: "You", "Bot", "Maria". */
  readonly label: string;
  /** The turn words on the active seat: "Your turn", "Playing", "Maria’s turn". */
  readonly turnLabel: string;
  /**
   * The first part of the quiet status line, before the game: the bot level
   * ("Easy · Portes") or "Online" (#499). None for a person on this phone.
   */
  readonly detail?: string;
  /** A named online opponent: their id and name for the checker avatar (#499). */
  readonly avatar?: { readonly key: string; readonly name: string };
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
