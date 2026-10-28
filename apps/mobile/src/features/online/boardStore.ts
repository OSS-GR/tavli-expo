/**
 * The board screen's view of an online store (#255).
 *
 * `GameScreen` reads a `BoardStore`: a flow that is never `null`, a match
 * key, the last error and `dispatch`. This wraps an `OnlineStore` that has
 * its first view. Its `lastError` is only a move this phone refused. The
 * snapshot is cached, so a change of another field (`sending`, `notice`,
 * …) does not render the board again.
 *
 * The match key names the game (`online:<gameId>`), not the store: a new
 * store for the same game (the screen opened again) does not read the
 * same events again (#216).
 *
 * Between games (#286). When a game ends but the match goes on, the
 * server's view already holds the next game and its first roll. A local
 * game starts the next game only when its game-end sheet closes, so the
 * board holds the end of the game: the last flow the board showed of that
 * game, marked over (`gameEnd`), with the match of the newest view (the
 * new record and score). The screen draws it as a local game end: the
 * sheet, no dice, no buttons. `release()` (the sheet's button) shows the
 * newest flow: only then do the next game's dice tumble and sound, and its
 * turn is read. Only the board waits: the online store takes every view
 * at once, so the moves, the deadlines and the time left go on. When the
 * match ends, the board lets go by itself (match end shows the last game).
 * Games that ended before the board was made are not held.
 */
import { currentBoard, type MatchFlow } from '@tavli/engine';

import type { BoardStore, BoardStoreState } from '@/features/game/gameStore';

import type { OnlineStore, OnlineStoreState } from './onlineStore';

export interface OnlineBoardStore extends BoardStore {
  /** The game-end sheet closes: the board shows the newest view. */
  release: () => void;
}

/**
 * The end of a game as a local game shows it: `from` (the board's last
 * flow of that game) marked over with the result of the newest record of
 * `next`, and the match of `next`. `from` may be a held end too: a game
 * that ends under the sheet keeps the board it shows. It only draws: no
 * rule is judged. The moves of a timed-out turn never counted, so they go.
 */
export function gameEnd(from: MatchFlow, next: MatchFlow): MatchFlow {
  const record = next.match.games.at(-1);
  if (record === undefined) return from;
  const { game } = from;
  const board = record.reason === 'timeout' ? game.state.board : currentBoard(game);
  return {
    ...from,
    match: next.match,
    game: {
      ...game,
      phase: 'game-over',
      state: { ...game.state, board },
      played: [],
      result: { winner: record.winner, points: record.points, reason: record.reason },
    },
    // An empty log: the feedback reads it as a view (`onlineStoreEvents`).
    log: [],
  };
}

/** `null` until the store has its first view. */
export function onlineBoardStore(store: OnlineStore, gameId: string): OnlineBoardStore | null {
  const first = store.getState().flow;
  if (first === null) return null;
  const matchKey = `online:${gameId}`;
  const dispatch = store.getState().dispatch;
  /** The newest flow of the store. */
  let latest: MatchFlow = first;
  let refusals = store.getState().refusals;
  /** The game end the board shows (`gameEnd`), or `null`. */
  let held: MatchFlow | null = null;
  let snapshot: BoardStoreState = { flow: first, matchKey, lastError: null, dispatch };
  /** One per listener: it reads the store again (after `release`). */
  const checks = new Set<() => void>();

  const read = (state: OnlineStoreState): BoardStoreState => {
    // A store keeps its flow once it has one; keep the last one just in case.
    const next = state.flow ?? latest;
    if (next !== latest) {
      latest = next;
      if (next.match.status === 'finished') {
        // Match end: the last game stays on the board, nothing waits.
        held = null;
      } else if (held !== null) {
        // Another game ended while the sheet was open: the sheet shows it.
        // The board keeps the end it shows: the moves that ended the first
        // game stay, also when the next game ends by a time out.
        if (next.match.games.length > held.match.games.length) held = gameEnd(held, next);
      } else if (next.match.games.length > snapshot.flow.match.games.length) {
        held = gameEnd(snapshot.flow, next);
      }
    }
    const shown = held ?? latest;
    // The board buzzes on `lastError` (an unchanged flow with an error):
    // only a move this phone refused gives one. A turn that did not go
    // through, or a lost connection, sets `lastError` too, but the notice
    // tells about it. A new refusal is a new snapshot even with the same
    // text, like a `set` of the local store.
    const refused = state.refusals !== refusals;
    if (shown !== snapshot.flow || refused) {
      refusals = state.refusals;
      snapshot = { flow: shown, matchKey, lastError: refused ? state.lastError : null, dispatch };
    }
    return snapshot;
  };

  return {
    getState: () => read(store.getState()),
    getInitialState: () => read(store.getState()),
    // Each listener keeps the snapshot it saw last: another listener may
    // have read the new one first.
    subscribe: (listener) => {
      let seen = read(store.getState());
      const check = () => {
        const next = read(store.getState());
        if (next === seen) return;
        const before = seen;
        seen = next;
        listener(next, before);
      };
      checks.add(check);
      const stop = store.subscribe(check);
      return () => {
        checks.delete(check);
        stop();
      };
    },
    release: () => {
      if (held === null) return;
      held = null;
      for (const check of [...checks]) check();
    },
  };
}
