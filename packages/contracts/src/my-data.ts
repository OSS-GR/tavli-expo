/**
 * Download my data (#445): a copy of what the server keeps about the
 * signed-in player, as plain JSON, for the GDPR rights of access and
 * portability. `OnlineData.exportMyData` gives it.
 *
 * It holds only the caller's own data, and of other players only what
 * the caller already sees in the app: the name on a game, a friend or a
 * block (`null` where the app shows none), never another player's id.
 * It never holds a token, a code or a secret: a push token is only its
 * phone system and date, a sign-in key only its kind (and the address of
 * an email key, which the caller sees in Settings → Account).
 *
 * All times are epoch milliseconds (server clock). A value the server
 * does not keep is `null`, never left out, so every copy has the same
 * keys. A new table or field that holds a player's data goes here too,
 * next to the account delete and the guest move.
 */
import type { PerPlayer, PlayerId, PresetId, VariantId } from '@tavli/engine';

import type { AuthKeyProvider } from './auth';
import type { OnlineGameChoice, OnlineGameStatus } from './game-transport';
import type { InviteStatus } from './invite';
import type { RankedGame } from './matchmaking';
import type { PlayerName } from './player-name';
import type { PushPlatform } from './push-notifications';
import type { ReportReason } from './safety';

/** The `format` of every copy, so a reader knows what the file is. */
export const MY_DATA_FORMAT = 'tavlaki-my-data';

/** The shape version. Raise it when a field changes its meaning. */
export const MY_DATA_VERSION = 1;

export interface MyData {
  readonly format: typeof MY_DATA_FORMAT;
  readonly version: typeof MY_DATA_VERSION;
  /** When the server made this copy. */
  readonly madeAt: number;
  readonly account: MyDataAccount;
  /** The rating of a saved account, or `null` before its first rated match. */
  readonly rating: MyDataRating | null;
  /** Friends of a saved account, newest friendship first. */
  readonly friends: readonly MyDataFriend[];
  /** Online games, newest change first. */
  readonly games: readonly MyDataGame[];
  /** The invites the caller sent, newest first. */
  readonly invites: readonly MyDataInvite[];
  /** The players the caller blocks, newest first. */
  readonly blocks: readonly MyDataBlock[];
  /** The reports the caller made that are still kept, newest first. */
  readonly reports: readonly MyDataReport[];
  /** The phones that get turn notifications: never the token itself. */
  readonly pushTokens: readonly MyDataPushToken[];
  /** A Play ranked search that is running now, or `null`. */
  readonly rankedSearch: MyDataRankedSearch | null;
}

export interface MyDataAccount {
  /** `saved`: the account has a sign-in key. */
  readonly kind: 'guest' | 'saved';
  readonly createdAt: number | null;
  /** The four digits of "Guest 4821", or `null` before the first invite or game. */
  readonly guestNumber: string | null;
  readonly username: string | null;
  /** The last username change after the first pick. */
  readonly usernameChangedAt: number | null;
  /** The ways to sign in. */
  readonly keys: readonly MyDataKey[];
  /** The terms of use version accepted, and when. */
  readonly termsVersion: string | null;
  readonly termsAcceptedAt: number | null;
  /** When the player said they are old enough. Never an age. */
  readonly ageCheckedAt: number | null;
}

export interface MyDataKey {
  readonly provider: AuthKeyProvider;
  /** The address of an email key; `null` for Apple. */
  readonly email: string | null;
  readonly addedAt: number | null;
}

export interface MyDataRating {
  /** The rating as kept (not rounded). */
  readonly rating: number;
  /** The points of the rated matches so far. */
  readonly experience: number;
  readonly matches: number;
  /** "Show me on the global board". */
  readonly shownOnBoard: boolean;
}

export interface MyDataFriend {
  readonly name: PlayerName | null;
  readonly since: number;
  /** Matches the caller won against this friend, and lost. */
  readonly wins: number;
  readonly losses: number;
}

export interface MyDataGame {
  readonly gameId: string;
  readonly status: OnlineGameStatus;
  readonly choice: OnlineGameChoice;
  readonly presetId: PresetId;
  /** The game being played now (the last one once the match is over). */
  readonly variant: VariantId;
  readonly targetPoints: number;
  readonly turnTimeMinutes: number | null;
  readonly ranked: boolean;
  readonly mySide: PlayerId;
  readonly score: PerPlayer<number>;
  /** The match winner once it is over. */
  readonly winner: PlayerId | null;
  readonly startedAt: number | null;
  readonly updatedAt: number;
  /** The other player's name as the caller sees it (`null`: blocked, or none kept). */
  readonly opponentName: PlayerName | null;
}

export interface MyDataInvite {
  readonly code: string;
  readonly choice: OnlineGameChoice;
  readonly targetPoints: number;
  readonly turnTimeMinutes: number | null;
  /** `expired` once its time is up, also before the server marks it. */
  readonly status: InviteStatus;
  /** An invite to one friend, not a code for anyone. */
  readonly toFriend: boolean;
  readonly createdAt: number | null;
  readonly expiresAt: number;
  /** The game it started, once accepted. */
  readonly gameId: string | null;
}

export interface MyDataBlock {
  readonly name: PlayerName | null;
  readonly blockedAt: number;
}

export interface MyDataReport {
  readonly reason: ReportReason;
  /** The reported player's username at that moment; `null` for a guest. */
  readonly username: string | null;
  readonly reportedAt: number;
}

export interface MyDataPushToken {
  readonly platform: PushPlatform;
  /** When the phone last registered it. */
  readonly updatedAt: number;
}

export interface MyDataRankedSearch {
  readonly game: RankedGame;
  readonly status: 'waiting' | 'matched';
  readonly since: number;
}
