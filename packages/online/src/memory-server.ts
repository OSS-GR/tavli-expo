/**
 * An online game server in memory (#251). It runs the same game logic and
 * the same call checks as the Convex functions (`apps/server/convex/
 * games.ts`), with no network and no account. It gives a `GameTransport`
 * per player, so the app and its tests can play online games before the
 * Convex project exists.
 *
 * It acts like a network:
 * - `subscribe` calls `onView` on a later microtask, never inside the call.
 * - Every view, request and event is a copy (a JSON round trip), so a
 *   client cannot change the server state, and the server cannot change a
 *   view a client holds.
 * - A rejected call rejects with plain `GameTransportErrorData`.
 *
 * Time comes from the `now` option. Nothing runs on a timer: call
 * `runDueTimeouts()` to apply the time outs whose deadline has passed (the
 * in-memory version of the Convex `checkTimeout`).
 */

import type {
  GameTransport,
  GameTransportErrorData,
  OnlineGameChoice,
  OnlineGamePace,
  OnlineGameView,
} from '@tavli/contracts';
import type { FlowEvent, MatchFlow, PerPlayer, PlayerId, Rng } from '@tavli/engine';

import {
  SERVER_ACTOR,
  TIMED_OUT_ERROR,
  callTimedOut,
  checkCall,
  checkNewGame,
  checkViewer,
  eventActor,
  matchStatus,
  nextDeadline,
  scheduledCheck,
} from './calls';
import type { SavedGame } from './calls';
import {
  OnlineGameError,
  answerPrompt,
  createOnlineMatch,
  loadFlow,
  playTurn,
  resign,
  storeFlow,
  timeOut,
  toView,
} from './online-game';

export interface MemoryGameServerOptions {
  /** The dice. Tests pass a seeded RNG; a dev game may pass any `Rng`. */
  readonly rng: Rng;
  /** The server clock, in epoch milliseconds. */
  readonly now: () => number;
}

/** One event of a game's log, like a row of the Convex `moves` table. */
export interface LoggedEvent {
  /** 0 for the `start` event, then +1 per event. */
  readonly seq: number;
  /** The game version the event led to. */
  readonly version: number;
  /** The player id who acted, or `SERVER_ACTOR` (rolls, time outs, the next game). */
  readonly actor: string;
  readonly event: FlowEvent;
}

export interface MemoryGameServer {
  /**
   * Creates a game between `players`, like the Convex `createGame`: the
   * server rolls the opening at once, and the first turn's clock runs.
   * Returns the game id. Throws an `OnlineGameError` (`BAD_REQUEST`,
   * `ILLEGAL_ACTION`) for bad arguments.
   */
  createGame(
    callerId: string,
    players: PerPlayer<string>,
    choice: OnlineGameChoice,
    targetPoints: number,
    pace: OnlineGamePace,
  ): string;
  /**
   * The transport of `playerId`: every call it makes comes from that
   * player, as if they were signed in (the Convex adapter gets the id from
   * the sign-in token). Only the two players may subscribe to a game.
   */
  transportFor(playerId: string): GameTransport;
  /** The game as a client sees it (a copy), or `null` when there is no such game. */
  getGame(gameId: string): OnlineGameView | null;
  /** The event log of the game, oldest first (copies). `replay` rebuilds the game from it. */
  events(gameId: string): LoggedEvent[];
  /**
   * Applies every time out whose deadline has passed at `now()`. Like the
   * Convex scheduler, it runs each check at its deadline: a game that
   * waited two turn times loses two games. Returns how many time outs it
   * applied.
   */
  runDueTimeouts(): number;
  /**
   * Tests only: replaces the stored flow of a game, like a Convex test
   * that patches `games.flow`. The version, the deadline and the log stay
   * as they are, and no view is sent. Call it before anyone subscribes.
   */
  setFlowForTest(gameId: string, flow: MatchFlow): void;
}

interface MemoryGame extends SavedGame {
  readonly gameId: string;
  readonly choice: OnlineGameChoice;
  readonly pace: OnlineGamePace;
  readonly targetPoints: number;
  /** `storeFlow` text. */
  readonly flow: string;
  /** `JSON.stringify(LoggedEvent)` per event. */
  readonly events: readonly string[];
}

interface Listener {
  readonly gameId: string;
  readonly onView: (view: OnlineGameView) => void;
  active: boolean;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Runs `task` on a later microtask, like a reply from the network. */
function later(task: () => void): void {
  void Promise.resolve().then(task);
}

/** Waits one microtask, so a call never changes the server inside the caller's own code. */
function nextTick(): Promise<void> {
  return Promise.resolve();
}

/** An `OnlineGameError` becomes plain `GameTransportErrorData`; anything else is a bug. */
function toErrorData(error: unknown): unknown {
  if (error instanceof OnlineGameError) {
    const data: GameTransportErrorData = { code: error.code, message: error.message };
    return data;
  }
  return error;
}

export function createMemoryGameServer(options: MemoryGameServerOptions): MemoryGameServer {
  const { rng, now } = options;
  const games = new Map<string, MemoryGame>();
  const listeners = new Set<Listener>();
  let nextId = 1;

  function viewOf(game: MemoryGame): OnlineGameView {
    return toView({
      gameId: game.gameId,
      version: game.version,
      choice: game.choice,
      pace: game.pace,
      turnDeadline: game.turnDeadline,
      players: game.players,
      flow: loadFlow(game.flow),
    });
  }

  /** Sends a view (JSON text) to `listener` on a later microtask, unless it stops first. */
  function send(listener: Listener, text: string): void {
    later(() => {
      if (listener.active) listener.onView(JSON.parse(text) as OnlineGameView);
    });
  }

  /** Sends the view of `game` as it is now to each listener of the game. */
  function notify(game: MemoryGame): void {
    const text = JSON.stringify(viewOf(game));
    for (const listener of listeners) {
      if (listener.gameId === game.gameId) send(listener, text);
    }
  }

  function logRows(firstSeq: number, version: number, callerId: string, flow: MatchFlow) {
    return flow.log.map((event, i) => {
      const row: LoggedEvent = {
        seq: firstSeq + i,
        version,
        actor: eventActor(event, callerId),
        event,
      };
      return JSON.stringify(row);
    });
  }

  /** Saves the flow after a step: a version bump, its log rows and a new turn deadline. */
  function save(game: MemoryGame, callerId: string, flow: MatchFlow, at: number): void {
    const version = game.version + 1;
    const saved: MemoryGame = {
      ...game,
      flow: storeFlow(flow),
      status: matchStatus(flow),
      version,
      turnDeadline: nextDeadline(game.pace, flow, at),
      events: [...game.events, ...logRows(game.events.length, version, callerId, flow)],
    };
    games.set(game.gameId, saved);
    notify(saved);
  }

  /** The player the server waits for loses the current game. */
  function applyTimeout(game: MemoryGame, at: number): void {
    save(game, SERVER_ACTOR, timeOut(loadFlow(game.flow), rng), at);
  }

  /**
   * A player's call: the checks of `checkCall`, then (for a move or an
   * answer) the turn deadline, then `step`. Like the Convex `onTime`, a
   * late call saves the time out and gets `TIMED_OUT`.
   */
  async function playerCall(
    callerId: string,
    gameId: string,
    expectedVersion: number | null,
    timed: boolean,
    step: (flow: MatchFlow, side: PlayerId) => MatchFlow,
  ): Promise<void> {
    await nextTick();
    try {
      const { game, side } = checkCall(games.get(gameId) ?? null, callerId, expectedVersion);
      const at = now();
      if (timed && callTimedOut(game, at)) {
        applyTimeout(game, at);
        throw new OnlineGameError(TIMED_OUT_ERROR.code, TIMED_OUT_ERROR.message);
      }
      save(game, callerId, step(loadFlow(game.flow), side), at);
    } catch (error) {
      throw toErrorData(error);
    }
  }

  function transportFor(playerId: string): GameTransport {
    return {
      subscribe(gameId, onView, onError) {
        const listener: Listener = { gameId, onView, active: true };
        const fail = (error: GameTransportErrorData) =>
          later(() => {
            if (listener.active) onError?.(error);
          });
        let game: MemoryGame | null;
        try {
          // Only the two players may watch (#131), like the Convex `getGame`.
          game = checkViewer(games.get(gameId) ?? null, playerId);
        } catch (error) {
          fail(toErrorData(error) as GameTransportErrorData);
          return () => {
            listener.active = false;
          };
        }
        if (game === null) {
          fail({ code: 'NOT_FOUND', message: 'no such game' });
        } else {
          listeners.add(listener);
          send(listener, JSON.stringify(viewOf(game)));
        }
        return () => {
          listener.active = false;
          listeners.delete(listener);
        };
      },
      sendTurn(request) {
        const { gameId, expectedVersion, moves } = copy(request);
        return playerCall(playerId, gameId, expectedVersion, true, (flow, side) =>
          playTurn(flow, side, moves, rng),
        );
      },
      sendAnswer(request) {
        const { gameId, expectedVersion, choice } = copy(request);
        return playerCall(playerId, gameId, expectedVersion, true, (flow, side) =>
          answerPrompt(flow, side, choice, rng),
        );
      },
      resign(gameId) {
        return playerCall(playerId, gameId, null, false, (flow, side) => resign(flow, side, rng));
      },
    };
  }

  return {
    createGame(callerId, players, choice, targetPoints, pace) {
      checkNewGame(callerId, players);
      const flow = createOnlineMatch({ choice, targetPoints, players: copy(players) }, rng);
      const gameId = `game-${nextId}`;
      nextId += 1;
      const version = 1;
      const game: MemoryGame = {
        gameId,
        players: copy(players),
        choice,
        pace,
        targetPoints,
        flow: storeFlow(flow),
        status: matchStatus(flow),
        version,
        turnDeadline: nextDeadline(pace, flow, now()),
        events: logRows(0, version, callerId, flow),
      };
      games.set(gameId, game);
      return gameId;
    },

    transportFor,

    getGame(gameId) {
      const game = games.get(gameId);
      return game === undefined ? null : copy(viewOf(game));
    },

    events(gameId) {
      return (games.get(gameId)?.events ?? []).map((row) => JSON.parse(row) as LoggedEvent);
    },

    runDueTimeouts() {
      const at = now();
      let applied = 0;
      for (const gameId of games.keys()) {
        let game = games.get(gameId);
        while (game !== undefined && scheduledCheck(game, game.version, at) === 'due') {
          // The Convex scheduler runs the check at the deadline, so the
          // next turn's clock starts there.
          applyTimeout(game, game.turnDeadline ?? at);
          applied += 1;
          game = games.get(gameId);
        }
      }
      return applied;
    },

    setFlowForTest(gameId, flow) {
      const game = games.get(gameId);
      if (game === undefined) throw new Error(`no game ${gameId}`);
      games.set(gameId, { ...game, flow: storeFlow(flow), status: matchStatus(flow) });
    },
  };
}
