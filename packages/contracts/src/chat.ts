/**
 * Chat in online games (ADR-0011, epic #692): the two players of an
 * online game write short text messages to each other, in friend games
 * and in Play ranked.
 *
 * - **Who may chat.** A saved account with a username that accepted the
 *   current terms. The chat of a game is `open` only when both players
 *   may chat; else nobody sees a chat (`ChatView.status` says why, for
 *   the caller only).
 * - **A message.** Text only, at most `CHAT_MAX_LENGTH` characters, no
 *   web or email address. Swearing is allowed; the server refuses only
 *   a short list of slurs. One player sends at most
 *   `CHAT_MESSAGES_PER_MINUTE` in a minute. There is no cap per game.
 * - **Mute and the switch.** `setMuted` hides the chat of one game for
 *   the caller; `setEnabled(false)` turns chat off in all the caller's
 *   games. The other player is never told. While a chat is hidden its
 *   view holds no messages.
 * - **Block.** A player who blocks the other (`Safety`) sees no chat with
 *   them (`unavailable`). The blocked player is never told: their chat
 *   stays `open`, and what they send shows only to them.
 * - The text of a message never goes to analytics, crash reports or
 *   logs.
 *
 * Like the other ports, no call takes the caller's id: the server reads
 * the caller from the sign-in. The in-memory server (`@tavli/online`) has
 * `chatFor(playerId)`. The contract checks are `chatContract` in
 * `@tavli/contracts/testing`.
 */
import type { PlayerId } from '@tavli/engine';

/** The most characters of one message, after the trim. */
export const CHAT_MAX_LENGTH = 200;

/** The most messages one player sends in one game in `CHAT_RATE_WINDOW_MS`. */
export const CHAT_MESSAGES_PER_MINUTE = 10;

/** The time `CHAT_MESSAGES_PER_MINUTE` counts over: one minute. */
export const CHAT_RATE_WINDOW_MS = 60 * 1000;

/**
 * A view holds at most this many messages: the newest ones. A game has
 * no cap, so a long chat does not make every view larger.
 */
export const CHAT_VIEW_MESSAGES = 200;

/** Messages are deleted this many days after the match ends. The chat is closed from then on. */
export const CHAT_KEEP_DAYS = 30;

/** Why the caller sees a chat or not. Only `open` has messages and takes a send. */
export const CHAT_STATUSES = [
  /** Both players may chat, and the caller did not hide it. */
  'open',
  /** The caller is a guest: chat needs a saved account. */
  'needs-account',
  /** The caller has a saved account with no username. */
  'needs-username',
  /** The caller did not accept the current terms (the chat rules are in them). */
  'needs-terms',
  /** The owner stopped the caller's chat after a report (a ban). */
  'banned',
  /** The caller turned chat off for all games (`setEnabled(false)`). */
  'turned-off',
  /** The caller muted this game (`setMuted`). */
  'muted',
  /**
   * No chat in this game for a reason on the other side (a guest, no
   * username, chat turned off, a ban, or the caller blocks them), or the match
   * ended `CHAT_KEEP_DAYS` ago and its chat is deleted. The view never
   * says which.
   */
  'unavailable',
] as const;

export type ChatStatus = (typeof CHAT_STATUSES)[number];

/** One message, as a player of the game sees it. */
export interface ChatMessage {
  /** Unique in its game. Opaque. */
  readonly id: string;
  /** The side that wrote it, as in `OnlineGameView.players`. */
  readonly from: PlayerId;
  readonly text: string;
  /** When the server took it, in epoch milliseconds (server clock). */
  readonly sentAt: number;
  /**
   * The number of the game of the match it was sent in, from 1 (#709):
   * the app draws a line where a new game starts. A message from before
   * the server kept this has 1.
   */
  readonly game: number;
}

/** The chat of one game, for the caller. */
export interface ChatView {
  readonly gameId: string;
  readonly status: ChatStatus;
  /** The newest `CHAT_VIEW_MESSAGES`, oldest first. Empty unless `status` is `open`. */
  readonly messages: readonly ChatMessage[];
}

/** The caller's chat settings, for all games. */
export interface ChatSettings {
  /** False after `setEnabled(false)`. A new account has `true`. */
  readonly enabled: boolean;
}

export interface SendChatRequest {
  readonly gameId: string;
  /** The text as typed. The server trims it and joins its lines. */
  readonly text: string;
}

export const CHAT_ERROR_CODES = [
  /** No valid sign-in, or the caller's account is gone. */
  'NOT_SIGNED_IN',
  /** No game with this id. */
  'GAME_NOT_FOUND',
  /** The caller is not a player of the game. */
  'NOT_A_PLAYER',
  /** The chat is not `open` for the caller. Read `ChatView.status` for the reason. */
  'CHAT_CLOSED',
  /** No text is left after the trim. */
  'EMPTY',
  /** More than `CHAT_MAX_LENGTH` characters. */
  'TOO_LONG',
  /** The text holds a web address or an email address. */
  'LINK',
  /** The text holds a slur from the chat block list. */
  'BAD_WORDS',
  /** `CHAT_MESSAGES_PER_MINUTE` in the last minute: wait. */
  'TOO_FAST',
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

/** The data of a rejected call. */
export interface ChatErrorData {
  readonly code: ChatErrorCode;
  readonly message: string;
}

export function isChatErrorData(value: unknown): value is ChatErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (CHAT_ERROR_CODES as readonly string[]).includes(code)
  );
}

export interface Chat {
  /**
   * Follows the chat of a game: `onChat` gets the view now and after each
   * change (a new message, a mute, a block, a setting). Returns the stop
   * function. `onError` gets `ChatErrorData` (`NOT_SIGNED_IN`,
   * `GAME_NOT_FOUND`, `NOT_A_PLAYER`); then no more views come.
   */
  watch(
    gameId: string,
    onChat: (view: ChatView) => void,
    onError?: (error: ChatErrorData) => void,
  ): () => void;
  /** Sends one message. Resolves with it as kept. Rejects with `ChatErrorData`. */
  send(request: SendChatRequest): Promise<ChatMessage>;
  /**
   * Hides (`true`) or shows the chat of one game for the caller. Rejects
   * with `NOT_SIGNED_IN`, `GAME_NOT_FOUND` or `NOT_A_PLAYER`.
   */
  setMuted(gameId: string, muted: boolean): Promise<void>;
  /** The caller's chat settings. Rejects with `NOT_SIGNED_IN`. */
  settings(): Promise<ChatSettings>;
  /** Turns chat on or off in all the caller's games. Rejects with `NOT_SIGNED_IN`. */
  setEnabled(enabled: boolean): Promise<void>;
}
