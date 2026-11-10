/**
 * Friends (#406, ADR-0008 item 8): a saved player adds friends and
 * invites them with one tap. The app never reads the contacts and never
 * uploads an address book; the server does no contact matching.
 *
 * Ways to add a friend:
 *
 * - **Friend link.** Each saved player has one random token
 *   (`FRIEND_TOKEN_LENGTH` characters, never the account id). The app
 *   shares it as a link, a QR code, or through the system contact picker
 *   and the share sheet. `resetFriendLink` makes a new token: the old
 *   link stops working.
 * - **Username search.** An exact match on the username key (case,
 *   accents and look-alike letters do not count), at most
 *   `FRIEND_SEARCHES_PER_HOUR` per hour. "No such player" and "a block
 *   between you" give the same answer: `null`, or `NOT_FOUND`.
 * - **Recent players.** The saved players of the caller's latest online
 *   games.
 *
 * A request must be accepted. A player has at most
 * `MAX_OPEN_FRIEND_REQUESTS` open requests sent and
 * `MAX_INCOMING_FRIEND_REQUESTS` open requests to answer, and
 * `MAX_FRIENDS` friends. After a decline, the same sender waits
 * `FRIEND_REQUEST_WAIT_MS` before a new request to that player. Two
 * players who ask each other become friends at once.
 *
 * Friends need a saved account (ADR-0008 item 5): a guest gets
 * `NOT_SAVED`, and nobody can ask a guest. A block (#320, `Safety`) ends
 * the friendship and deletes the requests between the two, and hides
 * each from the other in search, recent players and friend links.
 *
 * A friend invite (`inviteFriend`) is a game invite (`Invites`) for one
 * friend only: the server sends that friend a push, and the friend sees
 * it in `listFriendInvites`. Nobody else can read or answer it.
 *
 * Like the other ports, no call takes the caller's id: the server reads
 * the caller from the sign-in. The Convex adapter is
 * `createConvexFriends` (`@tavli/backend-convex`); the in-memory server
 * (`@tavli/online`) has `friendsFor(playerId)`. The contract checks are
 * `friendsContract` in `@tavli/contracts/testing`.
 */
import { INVITE_CODE_ALPHABET } from './invite';
import type { InviteView, NewInvite } from './invite';
import type { PlayerName } from './player-name';

/** The most friends one player may have. Each list stays far below Convex's read limits. */
export const MAX_FRIENDS = 200;

/** The most open requests one player may have sent. */
export const MAX_OPEN_FRIEND_REQUESTS = 20;

/** The most open requests one player may have to answer. A full inbox refuses new ones. */
export const MAX_INCOMING_FRIEND_REQUESTS = 100;

/** How long a sender waits after a decline before a new request to that player: 30 days. */
export const FRIEND_REQUEST_WAIT_MS = 30 * 24 * 60 * 60 * 1000;

/** The most username searches (`findPlayer`, `requestByUsername`) per `FRIEND_SEARCH_WINDOW_MS`. */
export const FRIEND_SEARCHES_PER_HOUR = 30;

/** The time `FRIEND_SEARCHES_PER_HOUR` counts over: one hour. */
export const FRIEND_SEARCH_WINDOW_MS = 60 * 60 * 1000;

/** The most players `recentPlayers` lists. */
export const MAX_RECENT_PLAYERS = 20;

/** The number of characters in a friend link token. 31^16 is about 7 × 10^23 tokens. */
export const FRIEND_TOKEN_LENGTH = 16;

/** The characters of a friend link token: the invite code alphabet (no look-alikes). */
export const FRIEND_TOKEN_ALPHABET = INVITE_CODE_ALPHABET;

/**
 * The token in its stored form (capital letters, no spaces at the ends),
 * or `null` when `text` cannot be a token. Tokens are not case sensitive.
 */
export function normalizeFriendToken(text: string): string | null {
  // Only ASCII letters change case, as in `normalizeInviteCode`.
  const token = text.trim().replace(/[a-z]/g, (char) => char.toUpperCase());
  if (token.length !== FRIEND_TOKEN_LENGTH) return null;
  for (const char of token) {
    if (!FRIEND_TOKEN_ALPHABET.includes(char)) return null;
  }
  return token;
}

/**
 * Where the caller stands with another player:
 * - `self`: it is the caller.
 * - `friends`: they are friends.
 * - `sent`: the caller asked, and the other has not answered.
 * - `received`: the other asked the caller.
 * - `none`: none of these (also after a decline).
 */
export const FRIEND_STATUSES = ['self', 'friends', 'sent', 'received', 'none'] as const;

export type FriendStatus = (typeof FRIEND_STATUSES)[number];

/** Matches between the caller and a friend: online matches that ended, a resign too. */
export interface FriendRecord {
  /** Matches the caller won. */
  readonly wins: number;
  /** Matches the friend won. */
  readonly losses: number;
}

/** One friend of the caller. */
export interface Friend {
  /** The friend's player id, as in `OnlineGameView.players`. */
  readonly playerId: string;
  /** Their name now. `null` when the server has none. */
  readonly name: PlayerName | null;
  /** When the two became friends, in epoch milliseconds (server clock). */
  readonly since: number;
  readonly record: FriendRecord;
}

/** One open friend request, sent or received. */
export interface FriendRequest {
  /** The other player's id. */
  readonly playerId: string;
  readonly name: PlayerName | null;
  /** When the request was sent, in epoch milliseconds (server clock). */
  readonly sentAt: number;
}

/** The caller's open requests, newest first. */
export interface FriendRequests {
  /** Requests to the caller, to accept or decline. */
  readonly incoming: readonly FriendRequest[];
  /** Requests the caller sent, to cancel. */
  readonly outgoing: readonly FriendRequest[];
}

/** One saved player of the caller's latest online games. */
export interface RecentPlayer {
  readonly playerId: string;
  readonly name: PlayerName | null;
  /** Never `self`. */
  readonly status: FriendStatus;
  /** The last change of their latest game together, in epoch milliseconds (server clock). */
  readonly playedAt: number;
}

/**
 * A player found by username or by friend link. It has no player id:
 * a link or a name the caller typed gives only what the screen shows.
 */
export interface FoundPlayer {
  readonly name: PlayerName | null;
  readonly status: FriendStatus;
}

export const FRIENDS_ERROR_CODES = [
  /** No valid sign-in, or the caller's account is gone. */
  'NOT_SIGNED_IN',
  /** The caller is a guest: friends need a saved account (ADR-0008). */
  'NOT_SAVED',
  /** Bad arguments, for example the caller's own id or link. */
  'BAD_REQUEST',
  /**
   * No such player, link or username; a guest; a deleted account; or the
   * other player blocks the caller. One code, so a block stays hidden.
   */
  'NOT_FOUND',
  /** The caller blocks this player (they know, so the server says it). */
  'BLOCKED',
  /** The two are not friends (`inviteFriend`, and remove has nothing to do: no error). */
  'NOT_FRIENDS',
  /** The caller or the other player has `MAX_FRIENDS` friends. */
  'TOO_MANY_FRIENDS',
  /** The caller has `MAX_OPEN_FRIEND_REQUESTS` open requests sent. */
  'TOO_MANY_REQUESTS',
  /**
   * Not now: the other player declined within `FRIEND_REQUEST_WAIT_MS`,
   * or has `MAX_INCOMING_FRIEND_REQUESTS` requests to answer.
   */
  'TRY_LATER',
  /** The caller searched `FRIEND_SEARCHES_PER_HOUR` times in the last hour. */
  'TOO_MANY_SEARCHES',
  /** `inviteFriend`: the caller has the most open invites (`MAX_OPEN_INVITES` in `@tavli/online`). */
  'TOO_MANY_INVITES',
] as const;

export type FriendsErrorCode = (typeof FRIENDS_ERROR_CODES)[number];

/** The data of a rejected call. */
export interface FriendsErrorData {
  readonly code: FriendsErrorCode;
  readonly message: string;
}

export function isFriendsErrorData(value: unknown): value is FriendsErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (FRIENDS_ERROR_CODES as readonly string[]).includes(code)
  );
}

/**
 * The friends port. Every call rejects with `FriendsErrorData`:
 * `NOT_SIGNED_IN` with nobody signed in, `NOT_SAVED` for a guest (except
 * `openFriendLink`, which any signed-in player may call).
 */
export interface Friends {
  /** The caller's friends, newest friendship first. */
  listFriends(): Promise<readonly Friend[]>;
  /** The caller's open requests, both ways. */
  listRequests(): Promise<FriendRequests>;
  /**
   * Up to `MAX_RECENT_PLAYERS` saved players of the caller's latest
   * online games, newest first. Leaves out guests, deleted accounts and
   * a block either way.
   */
  recentPlayers(): Promise<readonly RecentPlayer[]>;
  /**
   * The player with this exact username, or `null` (also for a block
   * either way). Counts as one search: `TOO_MANY_SEARCHES` past the cap.
   */
  findPlayer(username: string): Promise<FoundPlayer | null>;
  /** The caller's friend link token. Made on the first call, then the same. */
  myFriendLink(): Promise<string>;
  /** A new token for the caller's link. The old one stops working at once. */
  resetFriendLink(): Promise<string>;
  /**
   * The owner of the link with this token (any case), or `null`: no such
   * token, a deleted owner, or a block either way. A guest may call it.
   */
  openFriendLink(token: string): Promise<FoundPlayer | null>;
  /**
   * Asks the owner of the link. Resolves with the new status: `sent`, or
   * `friends` when the owner had asked the caller, or was a friend
   * already. `NOT_FOUND` where `openFriendLink` gives `null`.
   */
  requestByLink(token: string): Promise<FriendStatus>;
  /** Like `requestByLink`, by exact username. Counts as one search. */
  requestByUsername(username: string): Promise<FriendStatus>;
  /**
   * Asks a player the caller met: a game, an answered invite or a
   * request (for example from `recentPlayers`). `NOT_FOUND` for anyone
   * else, `BLOCKED` when the caller blocks them.
   */
  sendRequest(playerId: string): Promise<FriendStatus>;
  /** Accepts the open request from `playerId`. No such request: `NOT_FOUND`. */
  acceptRequest(playerId: string): Promise<void>;
  /** Declines the open request from `playerId`. They wait before they ask again. No request: no change. */
  declineRequest(playerId: string): Promise<void>;
  /** Takes back the caller's open request to `playerId`. No request: no change. */
  cancelRequest(playerId: string): Promise<void>;
  /** Ends the friendship, both ways. Not friends: no change. */
  removeFriend(playerId: string): Promise<void>;
  /**
   * Invites a friend to a game: an invite (`Invites`) only that friend
   * can read and answer, with a push to them. Resolves with its code.
   * `NOT_FRIENDS`, `TOO_MANY_INVITES` or `BAD_REQUEST` (the game).
   */
  inviteFriend(playerId: string, game: NewInvite): Promise<string>;
  /** The open friend invites to the caller, newest first. Answer one with `Invites.acceptInvite`. */
  listFriendInvites(): Promise<readonly InviteView[]>;
}
