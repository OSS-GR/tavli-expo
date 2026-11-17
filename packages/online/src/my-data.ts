/**
 * Download my data (#445): the pure parts of the copy (`MyData`), so the
 * Convex `exportMyData` and the in-memory server give the same shape.
 * The servers read their rows; these turn the rows into the copy and
 * put each list in order. Never copy them into `convex/myData.ts`.
 */
import { MY_DATA_FORMAT, MY_DATA_VERSION } from '@tavli/contracts';
import type {
  GameSummary,
  MyData,
  MyDataAccount,
  MyDataGame,
  MyDataInvite,
  MyDataKey,
  MyDataRating,
} from '@tavli/contracts';

import { inviteStatus } from './invites';
import type { InviteRecord } from './invites';
import type { NameRecord } from './names';
import type { RatingRecord } from './ratings';
import type { UsernameRecord } from './usernames';

/**
 * A game of the copy, from the caller's summary: everything but the
 * other player's id (`opponentId`) and the turn state of the moment.
 */
export function myDataGame(summary: GameSummary, startedAt: number | null): MyDataGame {
  return {
    gameId: summary.gameId,
    status: summary.status,
    choice: summary.choice,
    presetId: summary.presetId,
    variant: summary.variant,
    targetPoints: summary.targetPoints,
    turnTimeMinutes: summary.turnTimeMinutes,
    ranked: summary.ranked,
    mySide: summary.mySide,
    score: summary.score,
    winner: summary.winner,
    startedAt,
    updatedAt: summary.updatedAt,
    opponentName: summary.opponentName,
  };
}

/** An invite the caller sent, at `now`: an open one whose time is up says `expired`. */
export function myDataInvite(
  invite: InviteRecord,
  createdAt: number | null,
  now: number,
): MyDataInvite {
  return {
    code: invite.code,
    choice: invite.choice,
    targetPoints: invite.targetPoints,
    turnTimeMinutes: invite.turnTimeMinutes,
    status: inviteStatus(invite, now),
    // Never the friend's id: only that it went to one friend.
    toFriend: invite.to !== undefined,
    createdAt,
    expiresAt: invite.expiresAt,
    gameId: invite.gameId,
  };
}

/** The account part, from the name row (`playerNames`) and the keys. */
export function myDataAccount(input: {
  readonly saved: boolean;
  readonly createdAt: number | null;
  readonly names: (NameRecord & UsernameRecord) | null;
  readonly keys: readonly MyDataKey[];
}): MyDataAccount {
  const { names } = input;
  return {
    kind: input.saved ? 'saved' : 'guest',
    createdAt: input.createdAt,
    guestNumber: names?.guestNumber ?? null,
    username: names?.username ?? null,
    usernameChangedAt: names?.usernameChangedAt ?? null,
    keys: [...input.keys].sort((a, b) => a.provider.localeCompare(b.provider)),
    termsVersion: names?.termsVersion ?? null,
    termsAcceptedAt: names?.termsAcceptedAt ?? null,
    ageCheckedAt: names?.ageCheckedAt ?? null,
  };
}

/** The rating part: `null` with no row (no rated match, no "Show me" change). */
export function myDataRating(
  row: (RatingRecord & { readonly shown: boolean }) | null,
): MyDataRating | null {
  if (row === null) return null;
  return {
    rating: row.rating,
    experience: row.experience,
    matches: row.matches,
    shownOnBoard: row.shown,
  };
}

/** Newest first by `key`; a `null` time goes last. */
function newestFirst<T>(items: readonly T[], key: (item: T) => number | null): T[] {
  return [...items].sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity));
}

/** The whole copy, made at `madeAt`, with each list newest first. */
export function makeMyData(parts: Omit<MyData, 'format' | 'version'>): MyData {
  return {
    format: MY_DATA_FORMAT,
    version: MY_DATA_VERSION,
    madeAt: parts.madeAt,
    account: parts.account,
    rating: parts.rating,
    friends: newestFirst(parts.friends, (friend) => friend.since),
    games: newestFirst(parts.games, (game) => game.updatedAt),
    invites: newestFirst(parts.invites, (invite) => invite.createdAt ?? invite.expiresAt),
    blocks: newestFirst(parts.blocks, (block) => block.blockedAt),
    reports: newestFirst(parts.reports, (report) => report.reportedAt),
    pushTokens: newestFirst(parts.pushTokens, (token) => token.updatedAt),
    rankedSearch: parts.rankedSearch,
  };
}
