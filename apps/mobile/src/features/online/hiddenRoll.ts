/**
 * Your own roll in an online game, held back until you roll (#347). Pure,
 * but for a small memory of the rolls this app run has shown.
 *
 * The server rolls each roll when the turn starts (anti-cheat), so a view
 * of your turn already holds your dice. A local game waits for a tap on
 * Roll or a swipe. So the phone hides the dice of your new roll: the
 * board shows the turn before the roll (`awaiting-roll`), with the same
 * Roll button and swipe as offline. Rolling shows the server's dice, with
 * the roll in the log, so the throw, the sound and the screen reader text
 * are those of a local roll. The phone never picks or changes a die.
 *
 * Only a roll you can play is held back: a view where the server waits
 * for you to move (`moving`, you to move, dice set). A roll with no legal
 * move is not: the server passed it already and the other player is on,
 * so the screen shows the pass with your dice at once, as before. Not
 * held back either: the opening dice (the server rolls the opening; the
 * starter plays them, `useOpeningDice`), a double chosen after a 1-2 (no
 * roll, Asodio), and the other player's rolls.
 *
 * A roll is named by the view's `version`: the server saves a new version
 * when it rolls, and the next change of the game is your turn. Once a roll
 * is shown, it stays shown for the rest of the app run, also when the
 * screen opens again (`revealRoll`): you never roll twice for one turn.
 * The memory is not saved, so after a restart the phone asks once more;
 * the dice are the same.
 */
import {
  MATCH_FLOW_SCHEMA_VERSION,
  type Dice,
  type GameFlow,
  type MatchFlow,
  type PlayerId,
} from '@tavli/engine';
import type { OnlineGameView } from '@tavli/contracts';

import { stateHasChosenDouble } from '@/features/game/announcements';

/** A roll of yours that the server made. */
export interface NewRoll {
  readonly player: PlayerId;
  readonly dice: Dice;
  /** The version of the view that brought the roll. */
  readonly version: number;
}

/** The starter plays the opening dice: nobody rolled them in this turn. */
function openingDice(game: GameFlow): boolean {
  const { opening } = game;
  return (
    game.lastTurn === null &&
    opening !== null &&
    opening.white !== null &&
    opening.black !== null &&
    game.state.rules.match.openingRoll === 'useOpeningDice'
  );
}

/** Your new roll in `view`, to hold back, or `null`. */
export function newRoll(view: OnlineGameView, side: PlayerId): NewRoll | null {
  const { game } = view;
  const dice = game.state.dice;
  if (
    view.status !== 'active' ||
    view.waitingFor !== side ||
    view.prompt !== null ||
    game.phase !== 'moving' ||
    game.state.toMove !== side ||
    dice === null ||
    openingDice(game) ||
    stateHasChosenDouble(game)
  ) {
    return null;
  }
  return { player: side, dice, version: view.version };
}

function flowOf(view: OnlineGameView, game: GameFlow, log: MatchFlow['log']): MatchFlow {
  return { schemaVersion: MATCH_FLOW_SCHEMA_VERSION, match: view.match, game, log };
}

/** The board before you roll: the turn waits for your roll, with no dice. */
export function hiddenFlow(view: OnlineGameView): MatchFlow {
  const { game } = view;
  return flowOf(
    view,
    { ...game, phase: 'awaiting-roll', state: { ...game.state, dice: null } },
    [],
  );
}

/**
 * The board after you rolled: the view, with your roll in the log (so the
 * screen plays it as a local roll).
 */
export function revealedFlow(view: OnlineGameView, roll: NewRoll): MatchFlow {
  return flowOf(view, view.game, [{ type: 'roll', player: roll.player, dice: roll.dice }]);
}

/** The rolls shown per game in this app run (game id to view versions). */
const shown = new Map<string, Set<number>>();

/** Notes that this app run has shown `roll` of `gameId`. */
export function revealRoll(gameId: string, roll: NewRoll): void {
  const versions = shown.get(gameId) ?? new Set<number>();
  versions.add(roll.version);
  shown.set(gameId, versions);
}

/** True when this app run has shown `roll` of `gameId` already. */
export function wasRevealed(gameId: string, roll: NewRoll): boolean {
  return shown.get(gameId)?.has(roll.version) ?? false;
}

/** Forgets every roll shown. For tests (`apps/mobile/test/afterEnv.ts`). */
export function forgetRevealedRollsForTest(): void {
  shown.clear();
}
