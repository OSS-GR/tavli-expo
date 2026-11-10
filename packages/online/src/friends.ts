/**
 * Friends (#406): the checks both servers run. The Convex functions
 * (`apps/server/convex/friends.ts`) and the in-memory server use these,
 * so the rules are the same. The servers add only their storage: the
 * friends, the requests, the links, the search log, the blocks.
 *
 * Everything here is pure: `now` is an argument, and tokens come from
 * the `Rng` the caller passes (Convex: `createCryptoRng`).
 */

import {
  FRIEND_REQUEST_WAIT_MS,
  FRIEND_SEARCHES_PER_HOUR,
  FRIEND_SEARCH_WINDOW_MS,
  FRIEND_TOKEN_LENGTH,
  MAX_FRIENDS,
  MAX_INCOMING_FRIEND_REQUESTS,
  MAX_OPEN_FRIEND_REQUESTS,
} from '@tavli/contracts';
import type { FriendRecord, FriendStatus, FriendsErrorCode } from '@tavli/contracts';
import type { PerPlayer, PlayerId, Rng } from '@tavli/engine';

import { SERVER_ACTOR } from './calls';
import { MAX_CODE_TRIES, randomCode } from './invites';

/** A rejected friends call. The servers turn it into `FriendsErrorData`. */
export class FriendsError extends Error {
  constructor(
    readonly code: FriendsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FriendsError';
  }
}

function fail(code: FriendsErrorCode, message: string): never {
  throw new FriendsError(code, message);
}

/** Friends need a saved account (ADR-0008 item 5). */
export function checkSaved(saved: boolean): void {
  if (!saved) fail('NOT_SAVED', 'save your account to add friends');
}

/** The other player of a call: not empty, not the server. The caller's own id is `BAD_REQUEST`. */
export function checkFriendTarget(callerId: string, playerId: string): void {
  if (playerId.trim() === '' || playerId === SERVER_ACTOR) fail('NOT_FOUND', 'no such player');
  if (playerId === callerId) fail('BAD_REQUEST', 'you cannot add yourself');
}

// ---------------------------------------------------------------------------
// Friend link tokens

/** A new random token: `FRIEND_TOKEN_LENGTH` characters from `FRIEND_TOKEN_ALPHABET`. */
export function newFriendToken(rng: Rng): string {
  return randomCode(rng, FRIEND_TOKEN_LENGTH);
}

function* tokenTries(rng: Rng): Generator<string> {
  for (let i = 0; i < MAX_CODE_TRIES; i++) yield newFriendToken(rng);
}

function noFreeToken(): Error {
  return new Error(`no free friend token after ${MAX_CODE_TRIES} tries`);
}

/** A new token that `isTaken` says is free (the Convex server checks its table). */
export async function pickFriendToken(
  rng: Rng,
  isTaken: (token: string) => Promise<boolean>,
): Promise<string> {
  for (const token of tokenTries(rng)) if (!(await isTaken(token))) return token;
  throw noFreeToken();
}

/** `pickFriendToken` for a server that checks a token at once (the in-memory server). */
export function pickFriendTokenNow(rng: Rng, isTaken: (token: string) => boolean): string {
  for (const token of tokenTries(rng)) if (!isTaken(token)) return token;
  throw noFreeToken();
}

// ---------------------------------------------------------------------------
// Username search

/** The start of the window the search cap counts over. */
export function searchWindowStart(now: number): number {
  return now - FRIEND_SEARCH_WINDOW_MS;
}

/** `recent`: the caller's searches made after `searchWindowStart(now)`. */
export function checkSearchCap(recent: number): void {
  if (recent >= FRIEND_SEARCHES_PER_HOUR) {
    fail('TOO_MANY_SEARCHES', `you searched ${FRIEND_SEARCHES_PER_HOUR} times this hour`);
  }
}

// ---------------------------------------------------------------------------
// Requests

/** One friend request, as both servers store it. */
export interface FriendRequestRecord {
  readonly status: 'open' | 'declined';
  /** When it was sent (or sent again), epoch ms. */
  readonly createdAt: number;
  /** When it was declined, epoch ms. `null` while open. */
  readonly declinedAt: number | null;
}

/** Where the caller stands with the other player (`FriendStatus`), from what the server stored. */
export function friendStatusOf(input: {
  readonly self: boolean;
  readonly friends: boolean;
  /** The caller's request to the other player, if any. */
  readonly mine: FriendRequestRecord | null;
  /** The other player's request to the caller, if any. */
  readonly theirs: FriendRequestRecord | null;
}): FriendStatus {
  if (input.self) return 'self';
  if (input.friends) return 'friends';
  if (input.mine?.status === 'open') return 'sent';
  if (input.theirs?.status === 'open') return 'received';
  return 'none';
}

/** How the caller found the other player. */
export type RequestRoute = 'link' | 'username' | 'met';

/** What the server knows when the caller asks another player. */
export interface PlanRequestInput {
  readonly route: RequestRoute;
  /** The other player is the caller. */
  readonly self: boolean;
  /** The other player's account exists and is saved (a guest cannot be a friend). */
  readonly savedTarget: boolean;
  /** For `met`: the two met (a game, an answered invite, a request). Others pass `true`. */
  readonly met: boolean;
  readonly callerBlocks: boolean;
  readonly targetBlocks: boolean;
  readonly friends: boolean;
  readonly mine: FriendRequestRecord | null;
  readonly theirs: FriendRequestRecord | null;
  /** Open requests the caller sent. */
  readonly openSent: number;
  /** Open requests the other player has to answer. */
  readonly openReceived: number;
  readonly callerFriends: number;
  readonly targetFriends: number;
  readonly now: number;
}

/**
 * What a request does:
 * - `status`: nothing to save; the call resolves with `status`.
 * - `send`: save an open request from the caller (a new row, or the old
 *   declined one sent again).
 * - `accept`: the other player asked first: they become friends.
 */
export type RequestPlan =
  | { readonly kind: 'status'; readonly status: FriendStatus }
  | { readonly kind: 'send' }
  | { readonly kind: 'accept' };

/** The friend cap: both players must have room. */
export function checkFriendCaps(callerFriends: number, targetFriends: number): void {
  if (callerFriends >= MAX_FRIENDS) fail('TOO_MANY_FRIENDS', `you have ${MAX_FRIENDS} friends`);
  if (targetFriends >= MAX_FRIENDS) {
    fail('TOO_MANY_FRIENDS', `this player has ${MAX_FRIENDS} friends`);
  }
}

/**
 * The checks of a request, in order. A player the caller found by link or
 * username who is gone, a guest, or blocked either way is `NOT_FOUND`, so
 * a block stays hidden. A player the caller met and blocks is `BLOCKED`.
 */
export function planRequest(input: PlanRequestInput): RequestPlan {
  if (input.self) fail('BAD_REQUEST', 'you cannot add yourself');
  if (!input.savedTarget || !input.met || input.targetBlocks) fail('NOT_FOUND', 'no such player');
  if (input.callerBlocks) {
    if (input.route === 'met') fail('BLOCKED', 'you block this player');
    fail('NOT_FOUND', 'no such player');
  }
  if (input.friends) return { kind: 'status', status: 'friends' };
  if (input.theirs?.status === 'open') {
    checkFriendCaps(input.callerFriends, input.targetFriends);
    return { kind: 'accept' };
  }
  if (input.mine?.status === 'open') return { kind: 'status', status: 'sent' };
  if (
    input.mine?.status === 'declined' &&
    input.mine.declinedAt !== null &&
    input.now < input.mine.declinedAt + FRIEND_REQUEST_WAIT_MS
  ) {
    fail('TRY_LATER', 'try again later');
  }
  if (input.openSent >= MAX_OPEN_FRIEND_REQUESTS) {
    fail('TOO_MANY_REQUESTS', `you have ${MAX_OPEN_FRIEND_REQUESTS} open requests`);
  }
  if (input.callerFriends >= MAX_FRIENDS) {
    fail('TOO_MANY_FRIENDS', `you have ${MAX_FRIENDS} friends`);
  }
  if (input.openReceived >= MAX_INCOMING_FRIEND_REQUESTS || input.targetFriends >= MAX_FRIENDS) {
    fail('TRY_LATER', 'try again later');
  }
  return { kind: 'send' };
}

/** The open request to accept: there must be one. */
export function checkOpenRequest(request: FriendRequestRecord | null): void {
  if (request?.status !== 'open') fail('NOT_FOUND', 'no request from this player');
}

/** A friend invite (#406) needs a friendship. */
export function checkFriends(friends: boolean): void {
  if (!friends) fail('NOT_FRIENDS', 'you are not friends');
}

// ---------------------------------------------------------------------------
// Records and recent players

/** An empty record: no match yet. */
export const NO_RECORD: FriendRecord = { wins: 0, losses: 0 };

/** The fields of a finished match the record reads. */
export interface RecordGame {
  readonly players: PerPlayer<string>;
  readonly status: 'active' | 'finished';
  readonly winner: PlayerId | null;
}

/** `me`'s record against `other` over `games` (any games: the others are skipped). */
export function recordOf(games: Iterable<RecordGame>, me: string, other: string): FriendRecord {
  let wins = 0;
  let losses = 0;
  for (const game of games) {
    if (game.status !== 'finished' || game.winner === null) continue;
    const { white, black } = game.players;
    if (!((white === me && black === other) || (white === other && black === me))) continue;
    if (game.players[game.winner] === me) wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

/** The record after one more match: `won` from the record holder's side. */
export function recordAfter(record: FriendRecord, won: boolean): FriendRecord {
  return won
    ? { wins: record.wins + 1, losses: record.losses }
    : { wins: record.wins, losses: record.losses + 1 };
}

/** The fields of a game `recentOpponents` reads. */
export interface RecentGame {
  readonly players: PerPlayer<string>;
  /** The game's last change, epoch ms. */
  readonly updatedAt: number;
}

/**
 * The other players of `me`'s games, newest game first, each once, with
 * the time of their latest game together. The server then drops guests,
 * deleted accounts and blocks, and keeps `MAX_RECENT_PLAYERS`.
 */
export function recentOpponents(
  games: Iterable<RecentGame>,
  me: string,
): { readonly playerId: string; readonly playedAt: number }[] {
  const latest = new Map<string, number>();
  for (const game of games) {
    const { white, black } = game.players;
    const other = white === me ? black : black === me ? white : null;
    if (other === null || other === me) continue;
    latest.set(other, Math.max(latest.get(other) ?? -Infinity, game.updatedAt));
  }
  return [...latest]
    .map(([playerId, playedAt]) => ({ playerId, playedAt }))
    .sort((a, b) => b.playedAt - a.playedAt);
}
