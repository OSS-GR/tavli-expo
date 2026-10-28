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

import { INVITE_STATUSES, ONLINE_GAME_CHOICES, ONLINE_GAME_PACES } from '@tavli/contracts';

export const gameChoice = v.union(...ONLINE_GAME_CHOICES.map((choice) => v.literal(choice)));

export const gamePace = v.union(...ONLINE_GAME_PACES.map((pace) => v.literal(pace)));

export const side = v.union(v.literal('white'), v.literal('black'));

const inviteStatus = v.union(...INVITE_STATUSES.map((status) => v.literal(status)));

export default defineSchema({
  games: defineTable({
    /** The player id on each side. */
    players: v.object({ white: v.string(), black: v.string() }),
    /** The game the players picked (one game, or `tavli` for the rotation). */
    choice: gameChoice,
    /** `live` (1 minute per turn) or `async` (24 hours per turn). */
    pace: gamePace,
    /** Match length in points. */
    targetPoints: v.number(),
    /** The match `RuleSet`, JSON text (`serializeRules`). */
    rules: v.string(),
    /** The variant of the current game. */
    variant: v.string(),
    /** The engine `MatchFlow` without its log, JSON text. The log is in `moves`. */
    flow: v.string(),
    status: v.union(v.literal('active'), v.literal('finished')),
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
  })
    .index('by_white', ['players.white'])
    .index('by_black', ['players.black']),

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

  /** Game invites by code (#252). See "Invites" in the service doc. */
  invites: defineTable({
    /** The code to share: 8 capital letters and digits (`INVITE_CODE_ALPHABET`). Unique. */
    code: v.string(),
    /** The player id of the inviter. The inviter plays white. */
    from: v.string(),
    choice: gameChoice,
    targetPoints: v.number(),
    pace: gamePace,
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
    .index('by_from', ['from', 'status', 'expiresAt']),
});
