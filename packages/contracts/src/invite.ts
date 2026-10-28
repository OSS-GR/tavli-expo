/**
 * Game invites by code (#252, owner answer Q10).
 *
 * A player makes an invite on the server and shares its code (later as
 * the link `https://tavlaki.com/i/<code>`). A friend accepts it, and the
 * server starts the game. Every type here is plain JSON, so it can cross
 * the network as it is. See "Invites" in
 * `docs/architecture/online-game-service.md`.
 */

import type { OnlineGameChoice, OnlineGamePace } from './game-transport';

/**
 * How long an invite stays open, in milliseconds: 24 hours. Then it
 * expires. Open question Q31 asks the owner if 24 hours is right.
 */
export const INVITE_TIME_MS = 24 * 60 * 60 * 1000;

/** The number of characters in an invite code. */
export const INVITE_CODE_LENGTH = 8;

/**
 * The characters of an invite code: digits and capital letters, with no
 * look-alike characters (no `0`/`O`, no `1`/`I`/`L`). 31 characters, so
 * there are about 850 billion codes.
 */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * The code in its stored form (capital letters, no spaces at the ends),
 * or `null` when `text` cannot be a code. Codes are not case sensitive:
 * `abcd2345` and `ABCD2345` are the same code.
 */
export function normalizeInviteCode(text: string): string | null {
  // Only ASCII letters change case: `toUpperCase` would turn 'ſ' into 'S'
  // and 'ß' into 'SS', so text that is not a code could pass.
  const code = text.trim().replace(/[a-z]/g, (char) => char.toUpperCase());
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const char of code) {
    if (!INVITE_CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}

/**
 * - `open`: a friend can accept or decline it.
 * - `accepted`: a friend accepted it; `gameId` is the new game.
 * - `declined`: a friend said no.
 * - `cancelled`: the inviter took it back.
 * - `expired`: nobody answered within `INVITE_TIME_MS`.
 */
export const INVITE_STATUSES = ['open', 'accepted', 'declined', 'cancelled', 'expired'] as const;

export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** What a client may see of one invite. */
export interface InviteView {
  /** The code to share, in capital letters. */
  readonly code: string;
  /** The player id of the inviter. The inviter plays white. */
  readonly from: string;
  /** The game the inviter picked. */
  readonly choice: OnlineGameChoice;
  /** The match length in points. */
  readonly targetPoints: number;
  /** `live` (1 minute per turn) or `async` (24 hours per turn). */
  readonly pace: OnlineGamePace;
  /**
   * `expired` also when the time is up but the server has not marked
   * the invite yet.
   */
  readonly status: InviteStatus;
  /** When the invite expires, in epoch milliseconds (server clock). */
  readonly expiresAt: number;
  /** The game the invite started, once `status` is `accepted`. Else `null`. */
  readonly gameId: string | null;
}

/** Why the server rejected an invite call. */
export const INVITE_ERROR_CODES = [
  /** No invite has this code. */
  'INVITE_NOT_FOUND',
  /** The invite ran out of time (`INVITE_TIME_MS`). */
  'INVITE_EXPIRED',
  /** The invite is no longer open: it was accepted, declined or cancelled. */
  'INVITE_CLOSED',
  /** You cannot accept or decline your own invite. */
  'OWN_INVITE',
  /** Only the inviter can cancel an invite. */
  'NOT_YOUR_INVITE',
  /** Bad arguments (for example a code with a wrong length or character). */
  'BAD_REQUEST',
  /** The call has no signed-in user (the same code as in `GAME_TRANSPORT_ERROR_CODES`). */
  'NOT_SIGNED_IN',
] as const;

export type InviteErrorCode = (typeof INVITE_ERROR_CODES)[number];

/** The data of a rejected invite call. */
export interface InviteErrorData {
  readonly code: InviteErrorCode;
  readonly message: string;
}

export function isInviteErrorData(value: unknown): value is InviteErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (INVITE_ERROR_CODES as readonly string[]).includes(code)
  );
}
