/**
 * Block and report (#320): the checks both servers run. The Convex
 * functions (`apps/server/convex/safety.ts`) and the in-memory server use
 * these, so the rules are the same. The servers add only their storage:
 * whether the two players met, the blocks and the reports.
 *
 * Everything here is pure: `now` is an argument.
 */

import {
  MAX_BLOCKS,
  MAX_REPORTS_PER_DAY,
  REPORT_WINDOW_MS,
  isReportReason,
} from '@tavli/contracts';
import type { PlayerName, ReportReason, SafetyErrorCode } from '@tavli/contracts';
import type { PerPlayer } from '@tavli/engine';

import { SERVER_ACTOR } from './calls';

/** A rejected block or report call. The servers turn it into `SafetyErrorData`. */
export class SafetyError extends Error {
  constructor(
    readonly code: SafetyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SafetyError';
  }
}

function fail(code: SafetyErrorCode, message: string): never {
  throw new SafetyError(code, message);
}

/** The other player of a block or report: not empty, not the caller, not the server. */
export function checkTarget(callerId: string, playerId: string): void {
  if (playerId.trim() === '' || playerId === SERVER_ACTOR) fail('BAD_REQUEST', 'no such player');
  if (playerId === callerId) fail('BAD_REQUEST', 'you cannot block or report yourself');
}

/**
 * The two players met: a game between them, or an invite one answered
 * (accepted or declined) from the other. And the other account exists.
 * Ids are not secret once two players met, so this keeps a stranger from
 * blocking or reporting an id they found.
 */
export function checkMet(met: boolean): void {
  if (!met) fail('UNKNOWN_PLAYER', 'you have not played this player');
}

/** The caller may block one more player while they block fewer than `MAX_BLOCKS`. */
export function checkBlockCap(blocks: number): void {
  if (blocks >= MAX_BLOCKS) fail('TOO_MANY_BLOCKS', `you block ${MAX_BLOCKS} players already`);
}

/** A reason from `REPORT_REASONS`. */
export function checkReason(reason: unknown): ReportReason {
  if (!isReportReason(reason)) fail('BAD_REQUEST', 'not a report reason');
  return reason;
}

/** The start of the window the report cap counts over. */
export function reportWindowStart(now: number): number {
  return now - REPORT_WINDOW_MS;
}

/** `recent`: the caller's reports made after `reportWindowStart(now)`. */
export function checkReportCap(recent: number): void {
  if (recent >= MAX_REPORTS_PER_DAY) {
    fail('TOO_MANY_REPORTS', `you sent ${MAX_REPORTS_PER_DAY} reports today`);
  }
}

/** The names a viewer sees: `null` for a side the viewer blocks. */
export function namesSeenBy(
  names: PerPlayer<PlayerName | null>,
  players: PerPlayer<string>,
  blocks: (playerId: string) => boolean,
): PerPlayer<PlayerName | null> {
  return {
    white: blocks(players.white) ? null : names.white,
    black: blocks(players.black) ? null : names.black,
  };
}
