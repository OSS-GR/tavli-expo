/**
 * An online game server in memory (#251). It runs the same game logic and
 * the same call checks as the Convex functions (`apps/server/convex/
 * games.ts` and `invites.ts`), with no network and no account. It gives a
 * `GameTransport` and an `Invites` per player, so the app and its tests
 * can play online games before the Convex project exists.
 *
 * It acts like a network:
 * - `subscribe` calls `onView` on a later microtask, never inside the call.
 * - `listMyGames` (#296) lists the caller's games with `summarizeGame`,
 *   like the Convex `listMyGames`.
 * - Every view, request and event is a copy (a JSON round trip), so a
 *   client cannot change the server state, and the server cannot change a
 *   view a client holds.
 * - A rejected call rejects with plain `GameTransportErrorData` (an
 *   invite call with plain `InviteErrorData`).
 *
 * Time comes from the `now` option. Nothing runs on a timer: call
 * `runDueTimeouts()` to apply the time outs whose deadline has passed (the
 * in-memory version of the Convex `checkTimeout`). Invites need no timer:
 * like on Convex, an open invite counts as expired once `now()` reaches
 * its `expiresAt`.
 */

import { normalizeInviteCode } from '@tavli/contracts';
import type {
  GameSummary,
  GameTransport,
  GameTransportErrorData,
  InviteErrorData,
  InviteView,
  Invites,
  OnlineGameChoice,
  OnlineGamePace,
  OnlineGameStatus,
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
  InviteError,
  checkAnswer,
  checkCancel,
  checkInviteCap,
  countOpenInvites,
  newInvite,
  pickInviteCodeNow,
  toInviteView,
} from './invites';
import type { InviteRecord } from './invites';
import {
  OnlineGameError,
  answerPrompt,
  createOnlineMatch,
  loadFlow,
  loadPreviousGame,
  playTurn,
  resign,
  storeFlow,
  storeStep,
  timeOut,
  sideOf,
  toView,
} from './online-game';
import { latestGames, summarizeGame } from './summaries';

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
  /**
   * Makes an open invite from `callerId`, like the Convex `createInvite`:
   * it expires `INVITE_TIME_MS` after `now()`. The code comes from the
   * server's `rng`. Returns the code. Throws an `InviteError`:
   * `TOO_MANY_INVITES` when `callerId` already has `MAX_OPEN_INVITES`
   * open invites at `now()`, `BAD_REQUEST` for a bad match length.
   */
  createInvite(
    callerId: string,
    choice: OnlineGameChoice,
    targetPoints: number,
    pace: OnlineGamePace,
  ): string;
  /**
   * The inviter takes back an open invite, like the Convex `cancelInvite`.
   * Throws an `InviteError` (`INVITE_NOT_FOUND`, `INVITE_EXPIRED`,
   * `INVITE_CLOSED`, `NOT_YOUR_INVITE`, `BAD_REQUEST`).
   */
  cancelInvite(callerId: string, code: string): void;
  /**
   * The invites of `playerId`: every call comes from that player, as with
   * `transportFor`. `acceptInvite` starts the game as the Convex
   * `acceptInvite` does (the inviter plays white).
   */
  invitesFor(playerId: string): Invites;
  /** The invite as a client sees it at `now()` (a copy), or `null` when no invite has the code. */
  getInvite(code: string): InviteView | null;
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
  /** The last saved change, epoch ms (server clock). */
  readonly updatedAt: number;
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

/**
 * An `OnlineGameError` becomes plain `GameTransportErrorData`, an
 * `InviteError` plain `InviteErrorData`; anything else is a bug.
 */
function toErrorData(error: unknown): unknown {
  if (error instanceof OnlineGameError) {
    const data: GameTransportErrorData = { code: error.code, message: error.message };
    return data;
  }
  if (error instanceof InviteError) {
    const data: InviteErrorData = { code: error.code, message: error.message };
    return data;
  }
  return error;
}

export function createMemoryGameServer(options: MemoryGameServerOptions): MemoryGameServer {
  const { rng, now } = options;
  const games = new Map<string, MemoryGame>();
  const listeners = new Set<Listener>();
  /** By code (capital letters). */
  const invites = new Map<string, InviteRecord>();
  let nextId = 1;

  function viewInput(game: MemoryGame) {
    return {
      gameId: game.gameId,
      version: game.version,
      choice: game.choice,
      pace: game.pace,
      turnDeadline: game.turnDeadline,
      players: game.players,
      flow: loadFlow(game.flow),
      previousGame: loadPreviousGame(game.flow),
    };
  }

  function viewOf(game: MemoryGame): OnlineGameView {
    return toView(viewInput(game));
  }

  /** The games of `playerId` with `status`, like the Convex `listMyGames`. */
  function myGames(playerId: string, status: OnlineGameStatus): GameSummary[] {
    const summaries: GameSummary[] = [];
    for (const game of games.values()) {
      if (game.status !== status || sideOf(game.players, playerId) === null) continue;
      summaries.push(summarizeGame({ ...viewInput(game), updatedAt: game.updatedAt }, playerId));
    }
    return latestGames(summaries);
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
      flow: storeStep(game.flow, flow),
      status: matchStatus(flow),
      version,
      turnDeadline: nextDeadline(game.pace, flow, at),
      events: [...game.events, ...logRows(game.events.length, version, callerId, flow)],
      updatedAt: at,
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
      async listMyGames(request) {
        const { status } = copy(request);
        await nextTick();
        return copy(myGames(playerId, status));
      },
    };
  }

  function createGame(
    callerId: string,
    players: PerPlayer<string>,
    choice: OnlineGameChoice,
    targetPoints: number,
    pace: OnlineGamePace,
  ): string {
    checkNewGame(callerId, players);
    const flow = createOnlineMatch({ choice, targetPoints, players: copy(players) }, rng);
    const gameId = `game-${nextId}`;
    nextId += 1;
    const version = 1;
    const at = now();
    const game: MemoryGame = {
      gameId,
      players: copy(players),
      choice,
      pace,
      targetPoints,
      flow: storeFlow(flow),
      status: matchStatus(flow),
      version,
      turnDeadline: nextDeadline(pace, flow, at),
      events: logRows(0, version, callerId, flow),
      updatedAt: at,
    };
    games.set(gameId, game);
    return gameId;
  }

  /** The invite of `text` (any case). Rejects a malformed or unknown code, like the Convex `load`. */
  function loadInvite(text: string): InviteRecord {
    const code = normalizeInviteCode(text);
    if (code === null)
      throw new InviteError('BAD_REQUEST', 'an invite code has 8 letters and digits');
    const invite = invites.get(code);
    if (invite === undefined) throw new InviteError('INVITE_NOT_FOUND', 'no invite has this code');
    return invite;
  }

  /** The view of the invite of `text` (any case) at `now()`, or `null`, like the Convex `getInvite`. */
  function inviteView(text: string): InviteView | null {
    const code = normalizeInviteCode(text);
    const invite = code === null ? undefined : invites.get(code);
    return invite === undefined ? null : toInviteView(invite, now());
  }

  /** Runs `step` on a later microtask; errors reject as plain data. */
  async function inviteCall<T>(step: () => T): Promise<T> {
    await nextTick();
    try {
      return step();
    } catch (error) {
      throw toErrorData(error);
    }
  }

  function invitesFor(playerId: string): Invites {
    return {
      getInvite(text) {
        return inviteCall(() => inviteView(text));
      },
      acceptInvite(text) {
        return inviteCall(() => {
          const invite = loadInvite(text);
          checkAnswer(invite, playerId, now());
          // If the game cannot start, the invite stays open (the Convex
          // transaction rolls back too).
          const gameId = createGame(
            playerId,
            { white: invite.from, black: playerId },
            invite.choice,
            invite.targetPoints,
            invite.pace,
          );
          invites.set(invite.code, { ...invite, status: 'accepted', gameId });
          return gameId;
        });
      },
      declineInvite(text) {
        return inviteCall(() => {
          const invite = loadInvite(text);
          checkAnswer(invite, playerId, now());
          invites.set(invite.code, { ...invite, status: 'declined' });
        });
      },
    };
  }

  return {
    createGame,

    createInvite(callerId, choice, targetPoints, pace) {
      checkInviteCap(countOpenInvites(invites.values(), callerId, now()));
      const code = pickInviteCodeNow(rng, (taken) => invites.has(taken));
      const options = { from: callerId, choice, targetPoints, pace };
      invites.set(code, newInvite(options, code, now()));
      return code;
    },

    cancelInvite(callerId, text) {
      const invite = loadInvite(text);
      checkCancel(invite, callerId, now());
      invites.set(invite.code, { ...invite, status: 'cancelled' });
    },

    invitesFor,

    getInvite: (text) => copy(inviteView(text)),

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
