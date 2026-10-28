/**
 * Sound and haptics in an online game (#271). Pure.
 *
 * A local game plays its feedback from the engine log (`flowEvents` in
 * `features/game/gameFeedback.ts`). Online, the log holds only your own
 * moves of this turn: they play as in a local game. Everything else comes
 * in a new view from the server, with an empty log. `viewEvents` reads
 * what changed between two views and gives the events a local game plays
 * for the same steps:
 *
 * - The other player's moves, one event each, from `remoteTurn` (the same
 *   turn the board flies). Each one plays when its checker starts to fly
 *   (`turnMoveDelay`), as a local move plays when it starts. A view that
 *   does not follow the view before (a missed view) plays no moves.
 * - A new turn with a server roll: `turnStart`, then `diceRoll`, as after a
 *   confirm and a roll in a local game. They play at once: the dice tumble
 *   as soon as the view is on the board. A double chosen after a 1-2 is no
 *   roll: nothing plays (Asodio, Acey-Deucey).
 * - A game you won: `gameWin`; the match: `matchWin`. A lost game plays
 *   nothing, as in a local game vs the bot. The board holds the end of the
 *   game under its game-end sheet (`boardStore.ts`, #286). When the sheet
 *   closes, the board goes from that end (`game-over`) to the next game:
 *   its first roll is a new turn and plays then, once.
 *
 * Your own turn comes back in the view after Confirm. Its moves played
 * already, on the phone, so that view plays only what the server did after
 * them (the next roll). An unchanged flow with an error is a move this
 * phone refused (`invalidMove`); the board store sets that error only for
 * a refusal, never for a send that failed.
 */
import type { GameFlow, GamePhase, MatchFlow, PlayerId } from '@tavli/engine';

import { turnMoveDelay } from '@/features/board/flights';
import type { FeedbackEvent } from '@/features/feedback/feedback';
import { stateHasChosenDouble } from '@/features/game/announcements';
import {
  isHumanWin,
  moveEvent,
  storeEvents,
  type StoreEventsOf,
  type TimedEvent,
} from '@/features/game/gameFeedback';

import { remoteTurn } from './remoteTurn';

/** Phases of a turn that is under way: a view in them has its roll already. */
const IN_TURN: ReadonlySet<GamePhase> = new Set(['moving', 'awaiting-confirm']);

const now = (event: FeedbackEvent): TimedEvent => ({ event, at: 0 });

/** The server rolled for a new turn between `before` and `after` (same game). */
function rolledTurn(before: GameFlow, after: GameFlow): TimedEvent[] {
  if (after.phase !== 'moving' || after.state.dice === null) return [];
  const newTurn = after.state.turnNumber !== before.state.turnNumber || !IN_TURN.has(before.phase);
  if (!newTurn || stateHasChosenDouble(after)) return [];
  return [now('turnStart'), now('diceRoll')];
}

/**
 * The events between two flows of the same online game for the player
 * `me`, in the order a local game plays them. `after` is a view of the
 * server; `before` is the flow the board showed (a view, or your moves
 * on it). `at` is when each one plays, in ms after the view.
 */
export function viewEvents(before: MatchFlow, after: MatchFlow, me: PlayerId): TimedEvent[] {
  if (before === after) return [];
  const humans = [me];
  const moves = (remoteTurn(before, after, me)?.moves ?? []).map((move, i) => ({
    event: moveEvent(move),
    at: turnMoveDelay(i),
  }));
  if (after.match.status === 'finished') {
    // The last game stays on the board: its winning turn flies and sounds.
    const won = before.match.status !== 'finished' && isHumanWin(after.match.winner, humans);
    return won ? [...moves, now('matchWin')] : moves;
  }
  const games = after.match.games.length;
  const gamesBefore = before.match.games.length;
  if (games !== gamesBefore) {
    // A game ended. The view has no turn that ended it: only the win plays.
    const won = games > gamesBefore && isHumanWin(after.match.games.at(-1)?.winner, humans);
    return won ? [now('gameWin')] : [];
  }
  return [...moves, ...rolledTurn(before.game, after.game)];
}

/**
 * The events of one update of an online board store (`boardStore.ts`),
 * for `useGameFeedback`. A flow with a log is your move or undo on the
 * phone: it plays as in a local game. A flow with an empty log is a view.
 */
export function onlineStoreEvents(me: PlayerId): StoreEventsOf {
  return (prev, next, humans) => {
    if (next.flow === prev.flow || next.flow.log.length > 0) return storeEvents(prev, next, humans);
    return viewEvents(prev.flow, next.flow, me);
  };
}
