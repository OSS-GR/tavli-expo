/**
 * Block and report (#320, App Store guideline 1.2). Usernames (#405) are
 * content that players write, so a player must be able to block and to
 * report another player.
 *
 * - **Block.** The blocker no longer sees the other player's name (game
 *   views, the games list and invites say `null`), and no new game starts
 *   between the two from an invite. The blocker's own accept gets
 *   `BLOCKED`. The blocked player is never told: the blocker's open
 *   invites look expired to them (`getInvite`, `watchInvite`), and
 *   accepting or declining one gets `INVITE_EXPIRED`. Games that already
 *   run go on: the blocker may resign.
 * - **Report.** A reason from `REPORT_REASONS`, no free text. The server
 *   keeps the reported player's username at that moment, so the owner
 *   sees the name even after a change. Reporting also blocks. The owner
 *   reads the reports in the Convex dashboard and deletes each one there
 *   after the review; the account delete deletes them too.
 * - A player may block or report only someone they played or answered an
 *   invite with (`UNKNOWN_PLAYER` otherwise), and only while that account
 *   exists.
 *
 * Like the other ports, no call takes the caller's id: the server reads
 * the caller from the sign-in. The Convex adapter is `createConvexSafety`
 * (`@tavli/backend-convex`); the in-memory server (`@tavli/online`) has
 * `safetyFor(playerId)`. The contract checks are `safetyContract` in
 * `@tavli/contracts/testing`.
 */
import type { PlayerName } from './player-name';

/** Why a player reports another player. */
export const REPORT_REASONS = [
  /** The username is offensive or breaks the terms. */
  'name',
  /** Cheating or abusing the game. */
  'cheating',
  /** Harassment. */
  'harassment',
  /** Something else. */
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

/** The most players one player may block. */
export const MAX_BLOCKS = 200;

/** The most reports one player may send in `REPORT_WINDOW_MS`. */
export const MAX_REPORTS_PER_DAY = 10;

/** The time `MAX_REPORTS_PER_DAY` counts over: 24 hours. */
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One player the caller blocked. */
export interface BlockedPlayer {
  /** The blocked player's id, as in `OnlineGameView.players`. */
  readonly playerId: string;
  /**
   * Their name now, so the blocker can tell who it is. `null` when the
   * server has none. Only this list shows it: views hide it.
   */
  readonly name: PlayerName | null;
  /** When the block was made, in epoch milliseconds (server clock). */
  readonly blockedAt: number;
}

/** A report of another player. */
export interface ReportRequest {
  /** The reported player's id, as in `OnlineGameView.players` or `InviteView.from`. */
  readonly playerId: string;
  readonly reason: ReportReason;
}

export const SAFETY_ERROR_CODES = [
  /** No valid sign-in, or the caller's account is gone. */
  'NOT_SIGNED_IN',
  /** Bad arguments: an empty id, the caller's own id, or a reason not in `REPORT_REASONS`. */
  'BAD_REQUEST',
  /** No game or answered invite links the two players, or that account is gone. */
  'UNKNOWN_PLAYER',
  /** The caller already blocks `MAX_BLOCKS` players. */
  'TOO_MANY_BLOCKS',
  /** The caller sent `MAX_REPORTS_PER_DAY` reports in the last 24 hours. */
  'TOO_MANY_REPORTS',
] as const;

export type SafetyErrorCode = (typeof SAFETY_ERROR_CODES)[number];

/** The data of a rejected call. */
export interface SafetyErrorData {
  readonly code: SafetyErrorCode;
  readonly message: string;
}

export function isSafetyErrorData(value: unknown): value is SafetyErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (SAFETY_ERROR_CODES as readonly string[]).includes(code)
  );
}

export interface Safety {
  /**
   * Blocks `playerId` (see the top of this file). Blocking a player who is
   * blocked already changes nothing. Rejects with `SafetyErrorData`.
   */
  block(playerId: string): Promise<void>;
  /** Ends the caller's block of `playerId`. No block: no change. Rejects with `NOT_SIGNED_IN`. */
  unblock(playerId: string): Promise<void>;
  /** The players the caller blocks, newest block first. Rejects with `NOT_SIGNED_IN`. */
  listBlocked(): Promise<readonly BlockedPlayer[]>;
  /**
   * Reports a player, and blocks them. While the owner has not deleted
   * the caller's report of that player, a second report adds none and
   * still resolves. Rejects with `SafetyErrorData`.
   */
  report(request: ReportRequest): Promise<void>;
}
