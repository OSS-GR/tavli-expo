/**
 * The online game port (ADR-0004, #126).
 *
 * The app plays an online game only through `GameTransport`. The server
 * (`apps/server`, Convex) is the truth: it rolls the dice when a player
 * asks (`rollDice`, #355), checks every turn with `@tavli/engine` and
 * saves the game. The client adapter
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

import type { PlayerName } from './player-name';

/**
 * The games a player can start online: one game (Portes, Plakoto, Fevga or
 * Asodio), or `tavli`, the Portes → Plakoto → Fevga rotation.
 */
export const ONLINE_GAME_CHOICES = ['portes', 'plakoto', 'fevga', 'asodio', 'tavli'] as const;

export type OnlineGameChoice = (typeof ONLINE_GAME_CHOICES)[number];

export function isOnlineGameChoice(value: unknown): value is OnlineGameChoice {
  return typeof value === 'string' && (ONLINE_GAME_CHOICES as readonly string[]).includes(value);
}

/** The default turn time: 24 hours per turn, the async behaviour (#183). */
export const ASYNC_TURN_TIME_MS = 24 * 60 * 60 * 1000;

/**
 * The deadline for one turn, in milliseconds (owner answer Q15). `null`
 * is the default and gives the 24-hour async behaviour; a number gives
 * that many minutes. When it runs out, the player loses that game.
 */
export function turnDeadlineMs(turnTimeMinutes: number | null): number {
  return turnTimeMinutes === null ? ASYNC_TURN_TIME_MS : turnTimeMinutes * 60 * 1000;
}

/**
 * True when `turnTimeMinutes` is a valid per-turn limit: `null` (the
 * 24-hour default) or a whole number of minutes, 1 or more (#183). The
 * servers check this on create; a `0` or negative limit would time out
 * every turn at once.
 */
export function isTurnTimeMinutes(turnTimeMinutes: number | null): boolean {
  return (
    turnTimeMinutes === null || (Number.isSafeInteger(turnTimeMinutes) && turnTimeMinutes >= 1)
  );
}

/** `active` while the match runs, `finished` once it has a winner. */
export type OnlineGameStatus = 'active' | 'finished';

/**
 * What a client may see of one online game. It never holds dice that are
 * not rolled yet: the server rolls each roll when its player asks
 * (`rollDice`, #355).
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
  /**
   * A per-turn time limit in minutes, or `null` for the 24-hour default
   * (the async behaviour, #183).
   */
  readonly turnTimeMinutes: number | null;
  /**
   * When the turn of `waitingFor` runs out, in epoch milliseconds (server
   * clock). Then `waitingFor` loses the current game. `null` when finished.
   */
  readonly turnDeadline: number | null;
  /** The player id (account) on each side. */
  readonly players: PerPlayer<string>;
  /**
   * The name of each side (#400): "Guest 4821". `null` when the server
   * has none, for example after that player deleted their online data,
   * and for a player the caller blocks (#320).
   */
  readonly names: PerPlayer<PlayerName | null>;
  /** The match: rules, score, finished games and the winner. */
  readonly match: Match;
  /**
   * The current game (the last one once the match is over). In
   * `awaiting-roll` the server waits for `waitingFor` to roll (#355): no
   * dice yet. While a player moves, `game.state.dice` is their roll. A
   * roll with no legal move passes at once: the next view waits for the
   * other player's roll, and `game.lastTurn` is the pass (no moves, with
   * its dice). `game.played` is always empty: a turn is sent and saved as
   * a whole.
   */
  readonly game: GameFlow;
  /**
   * The game before `game`, as it ended (phase `game-over`, #299): its
   * `lastTurn` is the turn that ended it, and its board is the end
   * position. When a game ends and the match goes on, the server starts
   * the next game at once, so `game` no longer shows that turn. `null` in
   * the first game (and in games saved before #299, until their next game
   * starts).
   */
  readonly previousGame: GameFlow | null;
  /** The side the server waits for (to roll, to move, or to answer). `null` when finished. */
  readonly waitingFor: PlayerId | null;
  /** The question `waitingFor` must answer, else `null`. */
  readonly prompt: VariantPrompt | null;
  /**
   * The moves `waitingFor` has made so far in this turn, before Confirm
   * (#374): only to show them live on the other phone. It is never a
   * saved turn: only `sendTurn` ends a turn. `null` when there is no
   * draft. A server from before #374 leaves it out, so read it as
   * `view.draft ?? null`.
   */
  readonly draft?: TurnDraft | null;
}

/**
 * The turn so far of the player the server waits for (#374). A draft
 * belongs to one `version`: the next saved change drops it.
 */
export interface TurnDraft {
  /** The moves so far, in order, each one legal from the board before it. */
  readonly moves: readonly MoveInput[];
  /**
   * Goes up by one on each new draft of the same `version`, from 1. A
   * new draft does not change `version`, so a client tells drafts apart
   * by `seq`.
   */
  readonly seq: number;
}

/**
 * The most games one `listMyGames` call returns (#296). Older games are
 * left out.
 */
export const MAX_LISTED_GAMES = 50;

/**
 * One online game in the caller's list (#296): enough to show it on Home
 * and open it. It says nothing about the other player but their side and
 * their name. Open the game (`subscribe`) for the full view.
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
  /** A per-turn time limit in minutes, or `null` for the 24-hour default (#183). */
  readonly turnTimeMinutes: number | null;
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
  /** The other player's id, as in the view's `players`: the app reports or blocks them with it (#435). */
  readonly opponentId: string;
  /** The other player's name, as in the view's `names` (#400): `null` when the caller blocks them (#320). */
  readonly opponentName: PlayerName | null;
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
  /** The action is not allowed now (for example an answer with no question, or a roll in the middle of a turn). */
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

/** A roll of the dice for the caller's turn (#355). */
export interface RollDiceRequest {
  readonly gameId: string;
  /** `OnlineGameView.version` of the view that waits for the roll. */
  readonly expectedVersion: number;
}

/** One full turn: every move for the current roll, in order. */
export interface SendTurnRequest {
  readonly gameId: string;
  /** `OnlineGameView.version` of the view the turn was played on. */
  readonly expectedVersion: number;
  readonly moves: readonly MoveInput[];
}

/** The turn so far, sent after each move and each undo (#374). */
export interface SetDraftRequest {
  readonly gameId: string;
  /** `OnlineGameView.version` of the view the moves were played on. */
  readonly expectedVersion: number;
  /** Every move of the turn so far, in order. Empty after the last undo. */
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
   * Rolls the dice of the caller's turn (#355): the server rolls them with
   * its RNG, only now, and saves the roll. Only when the view waits for
   * the caller's roll (`game.phase` is `awaiting-roll`). The dice come
   * through `subscribe`: a roll to play (`moving`), or a pass when no
   * checker can move (`game.lastTurn` holds its dice, and the server waits
   * for the other side). The roll does not reset the turn deadline; a
   * pass gives the other side a new one. Rejects like `sendTurn`:
   * `NOT_YOUR_TURN`, `ILLEGAL_ACTION` when there is nothing to roll,
   * `STALE_VERSION`, `GAME_OVER`, or `TIMED_OUT` when the turn time ran
   * out first.
   */
  rollDice(request: RollDiceRequest): Promise<void>;
  /**
   * Sends one full turn. Resolves once the server saved it (the next view
   * waits for a roll and comes through `subscribe`). Rejects with
   * `GameTransportErrorData`; `TIMED_OUT` when the turn time ran out first.
   */
  sendTurn(request: SendTurnRequest): Promise<void>;
  /**
   * Shows the caller's turn so far to the other player (#374): the next
   * view has it in `draft`, with a new `seq` and the same `version`. It
   * saves no turn, starts no clock and sends no push. Only the side the
   * server waits for may send one, only while it moves (`game.phase` is
   * `moving`), and every move must be legal. Rejects like `sendTurn`
   * (`NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `ILLEGAL_MOVE`, `STALE_VERSION`,
   * `GAME_OVER`, `TIMED_OUT`); a rejected draft changes nothing. Best
   * effort: a client never waits for it before a move or `sendTurn`.
   */
  setDraft(request: SetDraftRequest): Promise<void>;
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
