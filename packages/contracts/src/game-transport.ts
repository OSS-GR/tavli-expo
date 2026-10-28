/**
 * The online game port (ADR-0004, #126).
 *
 * The app plays an online game only through `GameTransport`. The server
 * (`apps/server`, Convex) is the truth: it rolls the dice, checks every
 * turn with `@tavli/engine` and saves the game. The client adapter
 * `@tavli/backend-convex` (`packages/adapters/backend-convex`) implements
 * this port. The in-memory
 * server in `@tavli/online` implements it too, with no network.
 *
 * Every type here is plain JSON, so it can cross the network as it is.
 * See `docs/architecture/online-game-service.md`.
 */

import type {
  GameFlow,
  Match,
  MoveInput,
  PerPlayer,
  PlayerId,
  PresetId,
  VariantId,
  VariantPrompt,
} from '@tavli/engine';

/**
 * The games a player can start online: one game (Portes, Plakoto, Fevga or
 * Asodio), or `tavli`, the Portes → Plakoto → Fevga rotation.
 */
export const ONLINE_GAME_CHOICES = ['portes', 'plakoto', 'fevga', 'asodio', 'tavli'] as const;

export type OnlineGameChoice = (typeof ONLINE_GAME_CHOICES)[number];

export function isOnlineGameChoice(value: unknown): value is OnlineGameChoice {
  return typeof value === 'string' && (ONLINE_GAME_CHOICES as readonly string[]).includes(value);
}

/**
 * How fast an online game is played (owner answers Q3 and Q15): `live`
 * (both players at the board) or `async` (slow, a turn now and then).
 */
export const ONLINE_GAME_PACES = ['live', 'async'] as const;

export type OnlineGamePace = (typeof ONLINE_GAME_PACES)[number];

export function isOnlineGamePace(value: unknown): value is OnlineGamePace {
  return typeof value === 'string' && (ONLINE_GAME_PACES as readonly string[]).includes(value);
}

/**
 * The time for one turn, in milliseconds (owner answer Q15): 1 minute
 * live, 24 hours async. When it runs out, the player loses that game.
 */
export const TURN_TIME_MS: { readonly [P in OnlineGamePace]: number } = {
  live: 60 * 1000,
  async: 24 * 60 * 60 * 1000,
};

/** `active` while the match runs, `finished` once it has a winner. */
export type OnlineGameStatus = 'active' | 'finished';

/**
 * What a client may see of one online game. It never holds dice that are
 * not rolled yet: the server rolls each roll when that turn starts.
 */
export interface OnlineGameView {
  readonly gameId: string;
  /**
   * Goes up by one on every saved change. Send it back as
   * `expectedVersion`: the server rejects a turn made on an old view.
   */
  readonly version: number;
  readonly status: OnlineGameStatus;
  readonly choice: OnlineGameChoice;
  /** Live (1 minute per turn) or async (24 hours per turn). */
  readonly pace: OnlineGamePace;
  /**
   * When the turn of `waitingFor` runs out, in epoch milliseconds (server
   * clock). Then `waitingFor` loses the current game. `null` when finished.
   */
  readonly turnDeadline: number | null;
  /** The player id (account) on each side. */
  readonly players: PerPlayer<string>;
  /** The match: rules, score, finished games and the winner. */
  readonly match: Match;
  /**
   * The current game (the last one once the match is over). While a
   * player moves, `game.state.dice` is their roll. `game.played` is always
   * empty: a turn is sent and saved as a whole.
   */
  readonly game: GameFlow;
  /** The side the server waits for (to move, or to answer). `null` when finished. */
  readonly waitingFor: PlayerId | null;
  /** The question `waitingFor` must answer, else `null`. */
  readonly prompt: VariantPrompt | null;
}

/**
 * The most games one `listMyGames` call returns (#296). Older games are
 * left out.
 */
export const MAX_LISTED_GAMES = 50;

/**
 * One online game in the caller's list (#296): enough to show it on Home
 * and open it. It says nothing about the other player but their side.
 * Open the game (`subscribe`) for the full view.
 */
export interface GameSummary {
  readonly gameId: string;
  readonly status: OnlineGameStatus;
  readonly choice: OnlineGameChoice;
  /** The preset of the match rules (`match.rules.presetId`). */
  readonly presetId: PresetId;
  /** The game being played now (the last one once the match is over). */
  readonly variant: VariantId;
  /** The match length in points. */
  readonly targetPoints: number;
  readonly pace: OnlineGamePace;
  /** The caller's side. The other player has the other side. */
  readonly mySide: PlayerId;
  /** The side the server waits for, as in the view. `null` when finished. */
  readonly waitingFor: PlayerId | null;
  /** True when the server waits for the caller. */
  readonly myTurn: boolean;
  /** Points so far. */
  readonly score: PerPlayer<number>;
  /** The match winner once `status` is `finished`, else `null`. */
  readonly winner: PlayerId | null;
  /** The last saved change, in epoch milliseconds (server clock). */
  readonly updatedAt: number;
  /** As in the view: when the turn of `waitingFor` runs out. `null` when finished. */
  readonly turnDeadline: number | null;
}

/** What `listMyGames` lists. */
export interface ListMyGamesRequest {
  /** `active` games, or `finished` ones. */
  readonly status: OnlineGameStatus;
}

/** Why the server rejected a call. */
export const GAME_TRANSPORT_ERROR_CODES = [
  /** No game with this id. */
  'NOT_FOUND',
  /** The caller is not one of the two players. Only the players may watch a game too. */
  'NOT_A_PLAYER',
  /** The server waits for the other player. */
  'NOT_YOUR_TURN',
  /** `expectedVersion` is old: the game changed. Load it again. */
  'STALE_VERSION',
  /** A move of the turn is not legal, or the turn is not complete. */
  'ILLEGAL_MOVE',
  /** The action is not allowed now (for example an answer with no question). */
  'ILLEGAL_ACTION',
  /** The match is over. */
  'GAME_OVER',
  /**
   * The turn time ran out before the call. The server has ended the game
   * for the player it waited for (they lose it). Load the game again.
   */
  'TIMED_OUT',
  /** Bad arguments (for example the same player on both sides). */
  'BAD_REQUEST',
  /** The call has no signed-in user. Sign in (a guest account is enough), then try again. */
  'NOT_SIGNED_IN',
] as const;

export type GameTransportErrorCode = (typeof GAME_TRANSPORT_ERROR_CODES)[number];

/** The data of a rejected call. */
export interface GameTransportErrorData {
  readonly code: GameTransportErrorCode;
  readonly message: string;
}

export function isGameTransportErrorData(value: unknown): value is GameTransportErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (GAME_TRANSPORT_ERROR_CODES as readonly string[]).includes(code)
  );
}

/** One full turn: every move for the current roll, in order. */
export interface SendTurnRequest {
  readonly gameId: string;
  /** `OnlineGameView.version` of the view the turn was played on. */
  readonly expectedVersion: number;
  readonly moves: readonly MoveInput[];
}

/** The answer to `OnlineGameView.prompt`. */
export interface SendAnswerRequest {
  readonly gameId: string;
  readonly expectedVersion: number;
  /** One of `prompt.choices`. */
  readonly choice: string;
}

/**
 * The port. The adapter knows who the caller is: the signed-in user
 * (`AuthProvider`). The calls do not carry a player id; the server reads
 * it from the sign-in token.
 */
export interface GameTransport {
  /**
   * Calls `onView` with the game now and after every change. Returns a
   * function that stops the updates. `onError` gets load errors:
   * `NOT_FOUND`, or `NOT_A_PLAYER` when the caller is not one of the two
   * players. Both are called later, never inside `subscribe`
   * itself. The contract checks are `gameTransportContract` in
   * `@tavli/contracts/testing`.
   */
  subscribe(
    gameId: string,
    onView: (view: OnlineGameView) => void,
    onError?: (error: unknown) => void,
  ): () => void;
  /**
   * Sends one full turn. Resolves once the server saved it (the next roll
   * comes through `subscribe`). Rejects with `GameTransportErrorData`;
   * `TIMED_OUT` when the turn time ran out first.
   */
  sendTurn(request: SendTurnRequest): Promise<void>;
  /** Answers the current question. Rejects like `sendTurn`. */
  sendAnswer(request: SendAnswerRequest): Promise<void>;
  /** Resigns the whole match: the opponent wins. Allowed at any time. */
  resign(gameId: string): Promise<void>;
  /**
   * The caller's games with this `status` (#296), newest change first, at
   * most `MAX_LISTED_GAMES`. Never another player's game. A call, not a
   * live list: `watchMyGames` follows the changes. Rejects with
   * `GameTransportErrorData` (`NOT_SIGNED_IN`).
   */
  listMyGames(request: ListMyGamesRequest): Promise<readonly GameSummary[]>;
  /**
   * The live form of `listMyGames` (#297): `onList` gets the list now and
   * after every change to it (a move, a new game, a game that ends),
   * until the returned function is called. Like `subscribe`, it never
   * calls back inside `watchMyGames` or after the stop function, and each
   * list is a copy. A failure goes to `onError`: `GameTransportErrorData`
   * from the server (`NOT_SIGNED_IN`), or a network error as it is.
   */
  watchMyGames(
    request: ListMyGamesRequest,
    onList: (games: readonly GameSummary[]) => void,
    onError?: (error: unknown) => void,
  ): () => void;
}
