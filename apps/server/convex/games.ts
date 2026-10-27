/**
 * Online games (#126, ADR-0004): create a game, play a turn, answer a
 * question, resign, and watch a game.
 *
 * Each mutation is one Convex transaction: load the game, check the call,
 * run the engine (`model/online-game.ts`), roll the next dice on the
 * server, and save with a version bump. If anything throws, nothing is
 * saved.
 *
 * Auth comes later: for now the caller passes its player id
 * (`callerId`). Each call checks that the caller may act.
 */

import { ConvexError, v } from 'convex/values';
import type { Infer } from 'convex/values';

import type { GameTransportErrorData, OnlineGameView } from '@tavli/contracts';
import { serializeRules } from '@tavli/engine';
import type { FlowEvent, MatchFlow, MoveInput, PlayerId } from '@tavli/engine';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { createCryptoRng } from './model/crypto-rng';
import {
  OnlineGameError,
  answerPrompt,
  createOnlineMatch,
  loadFlow,
  playTurn,
  resign as resignMatch,
  sideOf,
  storeFlow,
  toView,
} from './model/online-game';
import { gameChoice } from './schema';

/** The `actor` of events the server plays itself. */
const SERVER_ACTOR = 'server';

const SERVER_EVENTS: ReadonlySet<FlowEvent['type']> = new Set([
  'start',
  'rollOpening',
  'roll',
  'nextGame',
]);

/** Throws a `ConvexError` with `GameTransportErrorData`, so clients get the code. */
function reject(error: OnlineGameError): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: GameTransportErrorData['code']; message: string } = {
    code: error.code,
    message: error.message,
  };
  throw new ConvexError(data);
}

/** Runs `step`; an `OnlineGameError` becomes a `ConvexError`. */
function guarded<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    if (error instanceof OnlineGameError) reject(error);
    throw error;
  }
}

function fail(code: GameTransportErrorData['code'], message: string): never {
  reject(new OnlineGameError(code, message));
}

/** Appends the new events of `flow.log` to `moves`. */
async function writeEvents(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  firstSeq: number,
  version: number,
  callerId: string,
  flow: MatchFlow,
): Promise<number> {
  let seq = firstSeq;
  for (const event of flow.log) {
    await ctx.db.insert('moves', {
      gameId,
      seq,
      version,
      actor: SERVER_EVENTS.has(event.type) ? SERVER_ACTOR : callerId,
      event: JSON.stringify(event),
    });
    seq += 1;
  }
  return seq;
}

function gameFields(flow: MatchFlow) {
  return {
    variant: flow.game.state.variant,
    flow: storeFlow(flow),
    status: flow.match.status === 'finished' ? ('finished' as const) : ('active' as const),
    winner: flow.match.winner,
  };
}

/** Loads a game for `callerId` and checks the version. */
async function loadForCaller(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  callerId: string,
  expectedVersion: number | null,
): Promise<{ game: Doc<'games'>; side: PlayerId; flow: MatchFlow }> {
  const game = await ctx.db.get(gameId);
  if (game === null) fail('NOT_FOUND', 'no such game');
  const side = sideOf(game.players, callerId);
  if (side === null) fail('NOT_A_PLAYER', 'you are not a player of this game');
  if (expectedVersion !== null && expectedVersion !== game.version) {
    fail('STALE_VERSION', `the game is at version ${game.version}, not ${expectedVersion}`);
  }
  return { game, side, flow: loadFlow(game.flow) };
}

/** Saves the flow after a step, with a version bump and its log rows. */
async function save(
  ctx: MutationCtx,
  game: Doc<'games'>,
  callerId: string,
  flow: MatchFlow,
): Promise<number> {
  const version = game.version + 1;
  const eventCount = await writeEvents(ctx, game._id, game.eventCount, version, callerId, flow);
  await ctx.db.patch(game._id, { ...gameFields(flow), version, eventCount });
  return version;
}

const moveInput = v.object({
  from: v.union(v.number(), v.literal('bar'), v.literal('outside')),
  to: v.union(v.number(), v.literal('off')),
  die: v.number(),
  capture: v.optional(v.union(v.literal('none'), v.literal('hit'), v.literal('pin'))),
});

/** The engine checks every field (the point range, the die), so a cast is enough. */
function toMoveInput(move: Infer<typeof moveInput>): MoveInput {
  const base = { from: move.from, to: move.to, die: move.die } as MoveInput;
  return move.capture === undefined ? base : { ...base, capture: move.capture };
}

/**
 * Creates a game between two players. The server rolls the opening at
 * once, so the game starts with the first player to move. Returns the id.
 */
export const createGame = mutation({
  args: {
    callerId: v.string(),
    players: v.object({ white: v.string(), black: v.string() }),
    choice: gameChoice,
    targetPoints: v.number(),
  },
  returns: v.id('games'),
  handler: async (ctx, { callerId, players, choice, targetPoints }) => {
    if (sideOf(players, callerId) === null) {
      fail('BAD_REQUEST', 'the caller must be one of the players');
    }
    const flow = guarded(() =>
      createOnlineMatch({ choice, targetPoints, players }, createCryptoRng()),
    );
    const version = 1;
    const gameId = await ctx.db.insert('games', {
      players,
      choice,
      targetPoints,
      rules: serializeRules(flow.match.rules),
      ...gameFields(flow),
      version,
      eventCount: 0,
    });
    const eventCount = await writeEvents(ctx, gameId, 0, version, callerId, flow);
    await ctx.db.patch(gameId, { eventCount });
    return gameId;
  },
});

/**
 * Plays one full turn for the caller: every move for the current roll.
 * Rejects a stale `expectedVersion`, a caller who is not to move, and an
 * illegal or incomplete turn. Then the server rolls the next dice.
 * Returns the new version.
 */
export const makeMove = mutation({
  args: {
    gameId: v.id('games'),
    callerId: v.string(),
    expectedVersion: v.number(),
    moves: v.array(moveInput),
  },
  returns: v.number(),
  handler: async (ctx, { gameId, callerId, expectedVersion, moves }) => {
    const { game, side, flow } = await loadForCaller(ctx, gameId, callerId, expectedVersion);
    const next = guarded(() => playTurn(flow, side, moves.map(toMoveInput), createCryptoRng()));
    return await save(ctx, game, callerId, next);
  },
});

/** Answers the current question (for example the Plakoto mother question). Returns the new version. */
export const answer = mutation({
  args: {
    gameId: v.id('games'),
    callerId: v.string(),
    expectedVersion: v.number(),
    choice: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, { gameId, callerId, expectedVersion, choice }) => {
    const { game, side, flow } = await loadForCaller(ctx, gameId, callerId, expectedVersion);
    const next = guarded(() => answerPrompt(flow, side, choice, createCryptoRng()));
    return await save(ctx, game, callerId, next);
  },
});

/**
 * The caller resigns the match; the opponent wins. Allowed at any time,
 * so it takes no version: a resign never fails only because the opponent
 * just moved. Returns the new version.
 */
export const resign = mutation({
  args: { gameId: v.id('games'), callerId: v.string() },
  returns: v.number(),
  handler: async (ctx, { gameId, callerId }) => {
    const { game, side, flow } = await loadForCaller(ctx, gameId, callerId, null);
    const next = guarded(() => resignMatch(flow, side, createCryptoRng()));
    return await save(ctx, game, callerId, next);
  },
});

/**
 * The game as a client may see it, or `null` when there is no such game.
 * It never holds dice that are not rolled yet. Both players watch this
 * query, so their screens update after every change.
 */
export const getGame = query({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }): Promise<OnlineGameView | null> => {
    const game = await ctx.db.get(gameId);
    if (game === null) return null;
    return toView({
      gameId: game._id,
      version: game.version,
      choice: game.choice,
      players: game.players,
      flow: loadFlow(game.flow),
    });
  },
});
