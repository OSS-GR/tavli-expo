/**
 * The database of the online game service (#126).
 * See `docs/architecture/online-game-service.md`.
 *
 * Engine data (rules, the flow, log events) is stored as JSON text. Convex
 * field rules then never limit the engine shapes, and the engine stays the
 * one owner of those shapes. Players are plain id strings for now; users
 * and friends come in later issues.
 */

import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { INVITE_STATUSES, ONLINE_GAME_CHOICES, REPORT_REASONS } from '@tavli/contracts';

export const gameChoice = v.union(...ONLINE_GAME_CHOICES.map((choice) => v.literal(choice)));

/** A per-turn time limit in minutes, or `null` for the 24-hour default (#183). */
export const gameTurnTimeMinutes = v.union(v.number(), v.null());

export const side = v.union(v.literal('white'), v.literal('black'));

export const gameStatus = v.union(v.literal('active'), v.literal('finished'));

/** The phone system of a push token. */
export const pushPlatform = v.union(v.literal('ios'), v.literal('android'));

const inviteStatus = v.union(...INVITE_STATUSES.map((status) => v.literal(status)));

/** Why a player reported another (#320). */
export const reportReason = v.union(...REPORT_REASONS.map((reason) => v.literal(reason)));

export default defineSchema({
  games: defineTable({
    /** The player id on each side. */
    players: v.object({ white: v.string(), black: v.string() }),
    /** The game the players picked (one game, or `tavli` for the rotation). */
    choice: gameChoice,
    /**
     * A per-turn time limit in minutes, or `null` for the 24-hour default
     * (#183).
     */
    turnTimeMinutes: gameTurnTimeMinutes,
    /** Match length in points. */
    targetPoints: v.number(),
    /** The match `RuleSet`, JSON text (`serializeRules`). */
    rules: v.string(),
    /** The variant of the current game. */
    variant: v.string(),
    /**
     * The engine `MatchFlow` without its log, and the game before the
     * current one as it ended (#299): `StoredFlow` of `@tavli/online`,
     * JSON text. The log is in `moves`.
     */
    flow: v.string(),
    status: gameStatus,
    /** The match winner once `status` is `finished`. */
    winner: v.union(side, v.null()),
    /** Goes up by one on every change. Calls send it back as `expectedVersion`. */
    version: v.number(),
    /** Rows in `moves` for this game. The next row gets this `seq`. */
    eventCount: v.number(),
    /**
     * When the current turn runs out, epoch ms (server clock). `null` once
     * the match is finished. `checkTimeout` runs at this time.
     */
    turnDeadline: v.union(v.number(), v.null()),
    /**
     * The last saved change, epoch ms (server clock), for "my games"
     * (#296). Optional only because games saved before #296 have none:
     * they count their `_creationTime`, and the index puts them last.
     */
    updatedAt: v.optional(v.number()),
  })
    // "My games" (#296): one player's games with one status, newest change first.
    .index('by_white', ['players.white', 'status', 'updatedAt'])
    .index('by_black', ['players.black', 'status', 'updatedAt'])
    // "Did these two meet?" (#320, `safety.ts`): a game with these sides.
    .index('by_pair', ['players.white', 'players.black']),

  /** The event log of each game: one engine `FlowEvent` per row, in order. */
  moves: defineTable({
    gameId: v.id('games'),
    /** 0 for the `start` event, then 1, 2, … */
    seq: v.number(),
    /** The game version this event led to. */
    version: v.number(),
    /** The player id who acted, or `server` (rolls, passes, next game). */
    actor: v.string(),
    /** The `FlowEvent`, JSON text. */
    event: v.string(),
  }).index('by_game', ['gameId', 'seq']),

  /**
   * The turn so far of the player the server waits for (#374): shown live
   * on the other phone, never a saved turn. At most one row per game. It
   * belongs to one game `version`: `save` in `games.ts` deletes it, and
   * `getGame` shows it only at that version. Its own table, so a draft
   * does not run the "my games" lists again. It holds no player id.
   */
  drafts: defineTable({
    gameId: v.id('games'),
    /** The game version the draft was made on. */
    version: v.number(),
    /** 1 for the first draft of `version`, then +1 per draft. */
    seq: v.number(),
    /** The moves so far, `MoveInput[]` as JSON text. */
    moves: v.string(),
  }).index('by_game', ['gameId']),

  /** Game invites by code (#252). See "Invites" in the service doc. */
  invites: defineTable({
    /** The code to share: 8 capital letters and digits (`INVITE_CODE_ALPHABET`). Unique. */
    code: v.string(),
    /** The player id of the inviter. The inviter plays white. */
    from: v.string(),
    choice: gameChoice,
    targetPoints: v.number(),
    turnTimeMinutes: gameTurnTimeMinutes,
    status: inviteStatus,
    /** When the invite expires, epoch ms (server clock). `expireInvite` runs at this time. */
    expiresAt: v.number(),
    /** The game the invite started, once `status` is `accepted`. */
    gameId: v.union(v.id('games'), v.null()),
    /** The player who accepted or declined the invite. */
    answeredBy: v.union(v.string(), v.null()),
  })
    .index('by_code', ['code'])
    // "My open invites" and the cap on them (#275): the open invites of
    // one player whose time is not up are one range (`expiresAt > now`).
    .index('by_from', ['from', 'status', 'expiresAt'])
    // "Did these two meet?" (#320, `safety.ts`): an invite one answered from the other.
    .index('by_answer', ['from', 'answeredBy'])
    // Moving a guest into an account (#403, `guestMove.ts`): the invites one answered.
    .index('by_answered', ['answeredBy']),

  /**
   * The Expo push tokens of each player's phones (#280), for "your turn"
   * pushes. See "Push" in the service doc. A token belongs to one player
   * at a time; a player keeps at most `MAX_PUSH_TOKENS_PER_PLAYER`.
   */
  pushTokens: defineTable({
    playerId: v.string(),
    /** `ExponentPushToken[…]` or `ExpoPushToken[…]` (`isExpoPushToken`). */
    token: v.string(),
    platform: pushPlatform,
    /** When the phone last registered the token, epoch ms (server clock). */
    updatedAt: v.number(),
  })
    .index('by_player', ['playerId', 'updatedAt'])
    .index('by_token', ['token']),

  /**
   * Each player's name: the guest number (#400, four digits, shown to the
   * other player as "Guest 4821") and the username of a saved account
   * (#405, `usernames.ts`), with the answers of the username step. One row
   * per player, made once (`ensureGuestNumber` in `playerNames.ts`, or the
   * first `setMyUsername`), deleted with the account.
   */
  playerNames: defineTable({
    playerId: v.string(),
    /** `1000` to `9999` (`pickGuestNumber`). Not unique. */
    guestNumber: v.string(),
    /** The username as typed (NFC). Absent: none, or the owner cleared it. */
    username: v.optional(v.string()),
    /** `usernameKey(username)`. Unique: `setMyUsername` checks `by_username_key`. */
    usernameKey: v.optional(v.string()),
    /** The last change after the first pick (ms). The next one waits 30 days. */
    usernameChangedAt: v.optional(v.number()),
    /** When the player said they are old enough (ms). Never an age. */
    ageCheckedAt: v.optional(v.number()),
    /** The terms of use version the player accepted (`TERMS_VERSION`), and when. */
    termsVersion: v.optional(v.string()),
    termsAcceptedAt: v.optional(v.number()),
  })
    .index('by_player', ['playerId'])
    .index('by_username_key', ['usernameKey']),

  /**
   * Blocks (#320, `safety.ts`): `blockerId` no longer sees the name of
   * `blockedId`, and no game starts between the two from an invite. At
   * most `MAX_BLOCKS` rows per blocker. Deleted with either account.
   */
  blocks: defineTable({
    blockerId: v.string(),
    blockedId: v.string(),
    /** When the block was made, epoch ms (server clock). */
    createdAt: v.number(),
  })
    .index('by_blocker', ['blockerId', 'blockedId'])
    .index('by_blocked', ['blockedId']),

  /**
   * Reports (#320, `safety.ts`) for the owner to review in the Convex
   * dashboard. One row per reporter and reported player while it is
   * kept. The owner deletes a row after the review; the account delete of
   * either player deletes it too. There is no end date.
   */
  reports: defineTable({
    reporterId: v.string(),
    reportedId: v.string(),
    reason: reportReason,
    /** The reported player's username at that moment. Absent: a guest. */
    username: v.optional(v.string()),
    /** When the report was made, epoch ms (server clock). */
    createdAt: v.number(),
  })
    .index('by_reporter', ['reporterId', 'createdAt'])
    .index('by_pair', ['reporterId', 'reportedId'])
    .index('by_reported', ['reportedId']),

  /**
   * Who owns each sign-in key (#397): one row per Apple id (later Google).
   * Better Auth's `account` table has no unique index, so two users could
   * get the same key. Every new key goes through `claimKey`
   * (`authKeys.ts`) first, in one transaction, so a key has one owner.
   * Better Auth still signs in with its own `account` row.
   */
  authKeys: defineTable({
    /** The Better Auth provider id, for example `apple`. */
    providerId: v.string(),
    /** The provider's user id: Apple's `sub`, or the address of an `email` key (#399). */
    accountId: v.string(),
    /** The Better Auth user id: the player id. */
    userId: v.string(),
    /** When this user claimed it, epoch ms (server clock): the start of `CLAIM_GRACE_MS`. */
    claimedAt: v.number(),
  })
    .index('by_key', ['providerId', 'accountId'])
    .index('by_user', ['userId']),

  /**
   * Apple's refresh token for an Apple key (#398), so the server can
   * revoke it when the key or the account goes. The app sends the Apple
   * sheet's code once (`/key/apple-code`); the server trades it at Apple
   * and keeps the token, encrypted with the Better Auth secret. Deleted
   * with the key (`appleTokens.ts`).
   */
  appleTokens: defineTable({
    /** The Better Auth user id: the player id. */
    userId: v.string(),
    /** Apple's `sub`: the key's `accountId`. */
    accountId: v.string(),
    /** The app (bundle id) or the Services ID the code was for: Apple's `client_id`. */
    clientId: v.string(),
    /** Encrypted (Better Auth's `encryptOAuthTokens` format). */
    refreshToken: v.string(),
    savedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_account', ['accountId']),

  /**
   * Apple tokens waiting for their revoke (#398). A row holds no user id:
   * the key or the account is gone already. `revokeAppleToken` deletes it
   * after the revoke, or after its last try.
   */
  appleRevokes: defineTable({
    clientId: v.string(),
    /** Encrypted, as in `appleTokens`. */
    refreshToken: v.string(),
    /** Tries so far. */
    attempts: v.number(),
  }),

  /**
   * Sign-in nonces that were used (#397), so each works once. A row stays
   * until its nonce runs out (`expiresAt`, epoch ms); `useKeyNonce`
   * deletes a few old rows each time.
   */
  usedKeyNonces: defineTable({
    nonce: v.string(),
    expiresAt: v.number(),
  })
    .index('by_nonce', ['nonce'])
    .index('by_expires', ['expiresAt']),

  /**
   * Live email sign-in codes (#399, `emailCodes.ts`): one per address,
   * for `EMAIL_CODE_TTL_MS`. Holds HMACs only (`model/emailCode.ts`):
   * never the address and never the code.
   */
  emailCodes: defineTable({
    /** `addressKey` of the address. */
    address: v.string(),
    /** `codeKey` of the address and the code. */
    codeHash: v.string(),
    expiresAt: v.number(),
    /** Wrong tries so far. */
    tries: v.number(),
  })
    .index('by_address', ['address'])
    .index('by_expires', ['expiresAt']),

  /**
   * The email code send log (#399), for the send limits: one row per
   * bucket and send, kept `SEND_LOG_MS`. A bucket is an HMAC of the
   * address or the caller, or `all` for the day cap.
   */
  emailCodeSends: defineTable({
    bucket: v.string(),
    at: v.number(),
  })
    .index('by_bucket', ['bucket', 'at'])
    .index('by_at', ['at']),
});
