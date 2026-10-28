/**
 * The invite logic, with no Convex code (#252, moved here in #256).
 *
 * Two servers use it: the Convex functions in `apps/server/convex/
 * invites.ts` load an invite, call one check here, and save the result;
 * the in-memory server (`memory-server.ts`) does the same with a `Map`.
 * Everything here is pure: the clock is an argument (`now`, epoch
 * milliseconds) and random values come from the `Rng` the caller passes
 * in. The Convex server passes its secure RNG (`cryptoRng.ts`); tests may
 * pass a seeded one.
 */

import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, INVITE_TIME_MS } from '@tavli/contracts';
import type {
  InviteErrorCode,
  InviteStatus,
  InviteView,
  OnlineGameChoice,
  OnlineGamePace,
} from '@tavli/contracts';
import type { Rng } from '@tavli/engine';

/**
 * A rejected call. The Convex layer turns it into a `ConvexError`; the
 * in-memory server into plain `InviteErrorData`.
 */
export class InviteError extends Error {
  constructor(
    readonly code: InviteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InviteError';
  }
}

function fail(code: InviteErrorCode, message: string): never {
  throw new InviteError(code, message);
}

// ---------------------------------------------------------------------------
// Codes

const ALPHABET_SIZE = INVITE_CODE_ALPHABET.length;

/**
 * The uint32 values below this limit map to each character the same
 * number of times. The few values above it are drawn again, so no
 * character comes up more often than another.
 */
const FAIR_LIMIT = 2 ** 32 - (2 ** 32 % ALPHABET_SIZE);

function randomChar(rng: Rng): string {
  for (;;) {
    const value = rng.nextUint32();
    if (value < FAIR_LIMIT) return INVITE_CODE_ALPHABET[value % ALPHABET_SIZE] as string;
  }
}

/** A new random code: `INVITE_CODE_LENGTH` characters from `INVITE_CODE_ALPHABET`. */
export function newInviteCode(rng: Rng): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += randomChar(rng);
  return code;
}

/**
 * More clashes than this in a row means a bug (for example an RNG that
 * gives the same values again). With 31^8 codes, a clash is very rare.
 */
export const MAX_CODE_TRIES = 10;

/** The codes to try, one per clash: at most `MAX_CODE_TRIES`. */
function* codeTries(rng: Rng): Generator<string> {
  for (let i = 0; i < MAX_CODE_TRIES; i++) yield newInviteCode(rng);
}

function noFreeCode(): Error {
  return new Error(`no free invite code after ${MAX_CODE_TRIES} tries`);
}

/**
 * A new code that `isTaken` says is free. On a clash it tries again with
 * a new code, up to `MAX_CODE_TRIES` times. The Convex server checks its
 * table here.
 */
export async function pickInviteCode(
  rng: Rng,
  isTaken: (code: string) => Promise<boolean>,
): Promise<string> {
  for (const code of codeTries(rng)) if (!(await isTaken(code))) return code;
  throw noFreeCode();
}

/**
 * `pickInviteCode` for a server that can check a code at once, such as
 * the in-memory server (its `createInvite` answers at once).
 */
export function pickInviteCodeNow(rng: Rng, isTaken: (code: string) => boolean): string {
  for (const code of codeTries(rng)) if (!isTaken(code)) return code;
  throw noFreeCode();
}

// ---------------------------------------------------------------------------
// Invites

/** The fields of an invite that the checks read. A Convex row has these and more. */
export interface InviteRecord {
  readonly code: string;
  /** The player id of the inviter. */
  readonly from: string;
  readonly choice: OnlineGameChoice;
  readonly targetPoints: number;
  readonly pace: OnlineGamePace;
  readonly status: InviteStatus;
  readonly expiresAt: number;
  readonly gameId: string | null;
}

export interface NewInviteOptions {
  readonly from: string;
  readonly choice: OnlineGameChoice;
  readonly targetPoints: number;
  readonly pace: OnlineGamePace;
}

/** When an invite made at `now` expires. */
export function inviteExpiresAt(now: number): number {
  return now + INVITE_TIME_MS;
}

/**
 * A new open invite with `code`, made at `now`. Rejects a bad match
 * length here, as the engine would, so a friend's accept does not fail on it.
 */
export function newInvite(options: NewInviteOptions, code: string, now: number): InviteRecord {
  const { from, choice, targetPoints, pace } = options;
  if (from === '') fail('BAD_REQUEST', 'the player id is empty');
  if (!Number.isSafeInteger(targetPoints) || targetPoints < 1) {
    fail('BAD_REQUEST', 'target points must be an integer of 1 or more');
  }
  return {
    code,
    from,
    choice,
    targetPoints,
    pace,
    status: 'open',
    expiresAt: inviteExpiresAt(now),
    gameId: null,
  };
}

/** True when the invite is open but its time is up at `now`. At `expiresAt` itself it is up. */
export function isInviteExpired(invite: InviteRecord, now: number): boolean {
  return invite.status === 'open' && now >= invite.expiresAt;
}

/**
 * The status a client sees: `expired` as soon as the time is up, also
 * before the scheduled `expireInvite` has marked the row.
 */
export function inviteStatus(invite: InviteRecord, now: number): InviteStatus {
  return isInviteExpired(invite, now) ? 'expired' : invite.status;
}

// ---------------------------------------------------------------------------
// The cap on open invites (#275)

/**
 * One player may have at most this many open invites at a time. Each one
 * is a database row and a scheduled `expireInvite`, and a guest account
 * is free, so the cap keeps one user from filling the table. An invite
 * frees its place once it is accepted, declined, cancelled or expired.
 */
export const MAX_OPEN_INVITES = 10;

/**
 * How many of `invites` are open invites from `from` at `now`: status
 * `open` and time not up. An invite counts as expired at `expiresAt`, also
 * before the server has marked it. The other invites in the list are
 * skipped, so a server may pass more than the player's open ones.
 */
export function countOpenInvites(
  invites: Iterable<InviteRecord>,
  from: string,
  now: number,
): number {
  let count = 0;
  for (const invite of invites) {
    if (invite.from === from && inviteStatus(invite, now) === 'open') count += 1;
  }
  return count;
}

/**
 * Rejects a new invite from a player who already has `openCount` open
 * invites (from `countOpenInvites`), when that is `MAX_OPEN_INVITES` or more.
 */
export function checkInviteCap(openCount: number): void {
  if (openCount >= MAX_OPEN_INVITES) {
    fail(
      'TOO_MANY_INVITES',
      `you have ${MAX_OPEN_INVITES} open invites: cancel one or wait until one closes`,
    );
  }
}

/** Rejects an invite that is not open at `now`. */
function checkOpen(invite: InviteRecord, now: number): void {
  const status = inviteStatus(invite, now);
  if (status === 'expired') fail('INVITE_EXPIRED', 'the invite has expired');
  if (status !== 'open') fail('INVITE_CLOSED', `the invite is ${status}`);
}

/**
 * `callerId` may accept or decline the invite: it is open, its time is
 * not up, and the caller is not the inviter.
 */
export function checkAnswer(invite: InviteRecord, callerId: string, now: number): void {
  checkOpen(invite, now);
  if (invite.from === callerId) fail('OWN_INVITE', 'you cannot answer your own invite');
}

/** `callerId` may cancel the invite: it is open, its time is not up, and the caller made it. */
export function checkCancel(invite: InviteRecord, callerId: string, now: number): void {
  checkOpen(invite, now);
  if (invite.from !== callerId) fail('NOT_YOUR_INVITE', 'only the inviter can cancel an invite');
}

/** What a client may see of the invite at `now`. */
export function toInviteView(invite: InviteRecord, now: number): InviteView {
  return {
    code: invite.code,
    from: invite.from,
    choice: invite.choice,
    targetPoints: invite.targetPoints,
    pace: invite.pace,
    status: inviteStatus(invite, now),
    expiresAt: invite.expiresAt,
    gameId: invite.gameId,
  };
}
