/**
 * Sound and haptics in an online game (#271). Pure.
 *
 * A local game plays its feedback from the engine log (`flowEvents` in
 * `features/game/gameFeedback.ts`). Online, the log holds only your own
 * roll (#355) and moves of this turn: they play as in a local game. Everything
 * else comes in a new view from the server, with an empty log.
 * `viewEvents` reads what changed between two views and gives the events a
 * local game plays for the same steps:
 *
 * - The other player's moves, one event each, from `remoteSteps` (the
 *   same moves the board flies). Each one plays when its checker starts to
 *   fly (`turnMoveDelay`), as a local move plays when it starts. A view
 *   that does not follow the view before (a missed view) plays no moves.
 *   Live moves (#374): each draft plays its new moves; moves taken back
 *   play nothing (a local undo plays nothing either), and the end of the
 *   turn plays only the moves the drafts did not show.
 * - A new turn that waits for its roll: `turnStart`, as after a confirm in
 *   a local game.
 * - The other player's roll (#355): `diceRoll`, at once: their dice are
 *   thrown over the board as soon as the view is on it (#373). Their roll with no legal move
 *   (the view is the next turn, with their pass in `lastTurn`):
 *   `diceRoll`, then `turnStart`. Your own roll is in the log (the store
 *   asked for it), so it plays as a local roll. A double chosen after a
 *   1-2 is no roll: nothing plays (Asodio, Acey-Deucey).
 * - The other player's opening die (#379): `diceRoll`, as a local opening
 *   roll (a tie too). Your own die is in the log (the store asked for it).
 *   When their die decides the opening and the starter rolls both dice
 *   again (`rerollBoth`), `turnStart` follows.
 * - A view that skipped the roll (a missed view, the opening dice of a
 *   server that rolls the opening): `turnStart`, then `diceRoll`.
 * - A game you won: `gameWin`; the match: `matchWin`. A lost game plays
 *   no win, as in a local game vs the bot. The board holds the end of the
 *   game under its game-end sheet (`boardStore.ts`, #286), with the turn
 *   that ended it (#299): the other player's winning turn plays its moves
 *   like any turn of theirs. When the sheet
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

import { remoteSteps } from './remoteTurn';

/** Phases of a turn that is under way: a view in them has its roll already. */
const IN_TURN: ReadonlySet<GamePhase> = new Set(['moving', 'awaiting-confirm']);

const now = (event: FeedbackEvent): TimedEvent => ({ event, at: 0 });

/**
 * The other player's opening die between `before` (in the opening roll)
 * and `after` (same game), for the player `me` (#379).
 */
function openingEvents(before: GameFlow, after: GameFlow, me: PlayerId): TimedEvent[] {
  const was = before.opening;
  const next = after.opening;
  if (was === null || next === null) return [];
  const them = me === 'white' ? 'black' : 'white';
  const rolled = was[them] === null && (next[them] !== null || next.ties.length > was.ties.length);
  if (!rolled) return [];
  return [now('diceRoll'), ...(after.phase === 'awaiting-roll' ? [now('turnStart')] : [])];
}

/** A new turn or a roll between `before` and `after` (same game). */
function rolledTurn(before: GameFlow, after: GameFlow): TimedEvent[] {
  const roller = before.phase === 'awaiting-roll' ? before.state.toMove : null;
  if (after.phase === 'awaiting-roll') {
    const newTurn = roller === null || roller !== after.state.toMove;
    // The roller had no legal move: their dice, then the next turn.
    const last = after.lastTurn;
    const passed =
      roller !== null && last !== null && last.player === roller && last.moves.length === 0;
    return [...(passed ? [now('diceRoll')] : []), ...(newTurn ? [now('turnStart')] : [])];
  }
  if (after.phase !== 'moving' || after.state.dice === null || stateHasChosenDouble(after)) {
    return [];
  }
  // The roll of the turn that waited for it (#355).
  if (roller === after.state.toMove) return [now('diceRoll')];
  const newTurn = after.state.turnNumber !== before.state.turnNumber || !IN_TURN.has(before.phase);
  return newTurn ? [now('turnStart'), now('diceRoll')] : [];
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
  const steps = remoteSteps(before, after, me);
  const moves = (steps === null || steps.undo ? [] : steps.moves).map((move, i) => ({
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
    // A game ended. The board holds its end with the turn that ended it
    // (#299): the other player's winning turn plays, then your win.
    const won = games > gamesBefore && isHumanWin(after.match.games.at(-1)?.winner, humans);
    return won ? [...moves, now('gameWin')] : moves;
  }
  if (before.game.phase === 'opening-roll') return openingEvents(before.game, after.game, me);
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
