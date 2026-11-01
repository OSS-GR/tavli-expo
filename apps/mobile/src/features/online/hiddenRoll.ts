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
 * Two kinds of new roll:
 * - `turn`: the server waits for you to move with these dice.
 * - `pass`: the dice had no legal move, so the server passed your turn
 *   and the other player is on. Rolling shows the pass card, as offline.
 *
 * Not held back: the opening dice (the server rolls the opening; the
 * starter plays them, `useOpeningDice`), a double chosen after a 1-2 (no
 * roll, Asodio), and the other player's rolls.
 *
 * Once a roll is shown, it stays shown for the rest of the app run, also
 * when the screen opens again (`revealRoll`): you never roll twice for one
 * turn. The memory is not saved, so after a restart the phone asks once
 * more; the dice are the same.
 */
import {
  isDouble,
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
  readonly kind: 'turn' | 'pass';
  readonly player: PlayerId;
  readonly dice: Dice;
  /** Names the turn in its game: `<games>:<turn number>`. */
  readonly key: string;
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

/**
 * Your new roll in `view`, or `null`. `before` is the view the phone had
 * before it: a pass right after you chose a double (Asodio) is no roll.
 */
export function newRoll(
  view: OnlineGameView,
  side: PlayerId,
  before: OnlineGameView | null,
): NewRoll | null {
  if (view.status !== 'active') return null;
  const { game } = view;
  const games = view.match.games.length;
  const dice = game.state.dice;
  if (
    view.waitingFor === side &&
    view.prompt === null &&
    game.phase === 'moving' &&
    game.state.toMove === side &&
    dice !== null
  ) {
    if (openingDice(game) || stateHasChosenDouble(game)) return null;
    return { kind: 'turn', player: side, dice, key: `${games}:${game.state.turnNumber}` };
  }
  const last = game.lastTurn;
  if (
    last !== null &&
    last.player === side &&
    last.moves.length === 0 &&
    game.phase !== 'game-over' &&
    game.state.toMove !== side
  ) {
    const chose = before?.prompt?.player === side && isDouble(last.dice);
    if (chose) return null;
    // The pass was the turn before the one on now.
    const turn = Math.max(1, game.state.turnNumber - 1);
    return { kind: 'pass', player: side, dice: last.dice, key: `${games}:${turn}` };
  }
  return null;
}

function flowOf(view: OnlineGameView, game: GameFlow, log: MatchFlow['log']): MatchFlow {
  return { schemaVersion: MATCH_FLOW_SCHEMA_VERSION, match: view.match, game, log };
}

/**
 * The board before you roll: the turn waits for your roll, with no dice.
 * For a pass it is the start of the turn you passed: you to move, and no
 * last turn (it would show the pass).
 */
export function hiddenFlow(view: OnlineGameView, roll: NewRoll): MatchFlow {
  const { game } = view;
  if (roll.kind === 'pass') {
    return flowOf(
      view,
      {
        ...game,
        phase: 'awaiting-roll',
        state: {
          ...game.state,
          toMove: roll.player,
          dice: null,
          turnNumber: Math.max(1, game.state.turnNumber - 1),
        },
        played: [],
        lastTurn: null,
      },
      [],
    );
  }
  return flowOf(
    view,
    { ...game, phase: 'awaiting-roll', state: { ...game.state, dice: null } },
    [],
  );
}

/**
 * The board after you rolled: the view, with your roll in the log (so the
 * screen plays it as a local roll). For a pass it is the pass as a local
 * game shows it: the other player's turn before their roll, and your
 * pass as the last turn (the pass card).
 */
export function revealedFlow(view: OnlineGameView, roll: NewRoll): MatchFlow {
  const log = [{ type: 'roll' as const, player: roll.player, dice: roll.dice }];
  const { game } = view;
  if (roll.kind === 'pass') {
    return flowOf(
      view,
      { ...game, phase: 'awaiting-roll', state: { ...game.state, dice: null }, played: [] },
      log,
    );
  }
  return flowOf(view, game, log);
}

/** The last roll shown per game in this app run (game id → `NewRoll.key`). */
const shown = new Map<string, string>();

/** Notes that this app run has shown `roll` of `gameId`. */
export function revealRoll(gameId: string, roll: NewRoll): void {
  shown.set(gameId, roll.key);
}

/** True when this app run has shown `roll` of `gameId` already. */
export function wasRevealed(gameId: string, roll: NewRoll): boolean {
  return shown.get(gameId) === roll.key;
}

/** Forgets every roll shown. For tests (`apps/mobile/test/afterEnv.ts`). */
export function forgetRevealedRollsForTest(): void {
  shown.clear();
}
