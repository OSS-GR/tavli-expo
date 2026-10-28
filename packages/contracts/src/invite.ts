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
 * expires. The owner kept 24 hours (Q31, answered 2026-10-28).
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
  /**
   * The caller already has the most open invites a player may have
   * (`MAX_OPEN_INVITES` in `@tavli/online`: 10, #275). Only `createInvite` gives it.
   * One frees its place once it is accepted, declined, cancelled or expired.
   */
  'TOO_MANY_INVITES',
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

/** The game an invite offers: what the inviter picks. Plain JSON. */
export interface NewInvite {
  readonly choice: OnlineGameChoice;
  /** The match length in points (an integer of 1 or more). */
  readonly targetPoints: number;
  readonly pace: OnlineGamePace;
}

/**
 * The invite port (#256, #281): make an invite, watch it, and answer one.
 * The adapter knows who the caller is (the signed-in user), as in
 * `GameTransport`, so no call carries a player id. Each call that takes a
 * code takes it in any case.
 *
 * Adapters: the in-memory server (`createMemoryGameServer` in
 * `@tavli/online`) and the Convex client (`createConvexInvites` in
 * `@tavli/backend-convex`). The contract checks are `invitesContract` in
 * `@tavli/contracts/testing`.
 */
export interface Invites {
  /**
   * Makes an open invite from the caller. It expires `INVITE_TIME_MS`
   * later. Resolves with its code (capital letters). Rejects with
   * `InviteErrorData`: `TOO_MANY_INVITES` when the caller has the most
   * open invites a player may have (#275), `BAD_REQUEST` for a bad match
   * length, `NOT_SIGNED_IN` with no sign-in.
   */
  createInvite(game: NewInvite): Promise<string>;
  /**
   * The invite with this code, or `null` when no invite has it (also for
   * text that cannot be a code). An open invite whose time is up shows
   * `expired`.
   */
  getInvite(code: string): Promise<InviteView | null>;
  /**
   * Watches the invite: `onView` gets the invite now and after every
   * change (`null` when no invite has the code), until the returned
   * function is called. Like `GameTransport.subscribe`, it never calls
   * back inside `watchInvite` or after the stop function, and each view
   * is a copy. A failure goes to `onError` (`InviteErrorData` from the
   * server, or a network error as it is).
   *
   * The server marks an invite `expired` when its time is up, so a
   * watcher sees that too (the in-memory server does it in
   * `runDueTimeouts`).
   */
  watchInvite(
    code: string,
    onView: (view: InviteView | null) => void,
    onError?: (error: unknown) => void,
  ): () => void;
  /**
   * Accepts the invite and starts the game (the inviter plays white).
   * Resolves with the `gameId`. Rejects with `InviteErrorData`:
   * `INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_CLOSED`, `OWN_INVITE`
   * or `BAD_REQUEST`.
   */
  acceptInvite(code: string): Promise<string>;
  /** Says no to the invite. Rejects like `acceptInvite`. */
  declineInvite(code: string): Promise<void>;
  /**
   * The inviter takes the invite back. Rejects with `InviteErrorData`:
   * `INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_CLOSED`,
   * `NOT_YOUR_INVITE` or `BAD_REQUEST`.
   */
  cancelInvite(code: string): Promise<void>;
  /** The open invites the caller made, newest first. Invites whose time is up are left out. */
  listMyInvites(): Promise<InviteView[]>;
  /**
   * The live form of `listMyInvites` (#314): `onList` gets the list now
   * and after every change to it (a new invite, an accept, a decline, a
   * cancel, the expiry), until the returned function is called. Like
   * `watchInvite`, it never calls back inside `watchMyInvites` or after
   * the stop function, and each list is a copy. A failure goes to
   * `onError`: `InviteErrorData` from the server (`NOT_SIGNED_IN`), or a
   * network error as it is.
   *
   * The list changes when the server marks an invite `expired` (at
   * `expiresAt`), not when the time passes. A client keeps each invite
   * until the list drops it: the phone clock may be wrong, and the server
   * still counts an invite it lists as open.
   */
  watchMyInvites(
    onList: (invites: readonly InviteView[]) => void,
    onError?: (error: unknown) => void,
  ): () => void;
}
