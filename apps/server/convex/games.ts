/**
 * Online games (#126, ADR-0004): create a game, play a turn, answer a
 * question, resign, and watch a game. Turn timers (#133): each turn has a
 * deadline; when it passes, the player the server waits for loses the game.
 *
 * Each mutation is one Convex transaction: load the game, check the call,
 * run the engine (`@tavli/online`), roll the next dice on the server, and
 * save with a version bump. If anything throws, nothing is saved. The
 * call checks are pure helpers in `@tavli/online` too (#251), shared with
 * the in-memory server; this file keeps the database and scheduler parts.
 *
 * Timers: every save that leaves the match running sets a new
 * `turnDeadline` and schedules `checkTimeout` for that version. A later
 * change bumps the version, so an old check does nothing: no cancel is
 * needed. `makeMove` and `answer` check the deadline too.
 *
 * Auth comes later: for now the caller passes its player id
 * (`callerId`). Each call checks that the caller may act.
 */

import { ConvexError, v } from 'convex/values';
import type { Infer } from 'convex/values';

import type { GameTransportErrorData, OnlineGamePace, OnlineGameView } from '@tavli/contracts';
import { serializeRules } from '@tavli/engine';
import type { MatchFlow, MoveInput, PlayerId } from '@tavli/engine';
import {
  OnlineGameError,
  SERVER_ACTOR,
  TIMED_OUT_ERROR,
  answerPrompt,
  callTimedOut,
  checkCall,
  checkNewGame,
  createOnlineMatch,
  eventActor,
  loadFlow,
  matchStatus,
  nextDeadline,
  playTurn,
  resign as resignMatch,
  scheduledCheck,
  storeFlow,
  timeOut,
  toView,
} from '@tavli/online';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { createCryptoRng } from './model/crypto-rng';
import { gameChoice, gamePace } from './schema';

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
      actor: eventActor(event, callerId),
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
    status: matchStatus(flow),
    winner: flow.match.winner,
  };
}

/** Loads a game for `callerId` and checks the version (`checkCall`). */
async function loadForCaller(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  callerId: string,
  expectedVersion: number | null,
): Promise<{ game: Doc<'games'>; side: PlayerId; flow: MatchFlow }> {
  const loaded = await ctx.db.get(gameId);
  const { game, side } = guarded(() => checkCall(loaded, callerId, expectedVersion));
  return { game, side, flow: loadFlow(game.flow) };
}

/**
 * Starts the clock for the turn that begins `now`: returns the deadline
 * and schedules `checkTimeout` for `version` at that time. `null` (and no
 * check) when the match is over.
 */
async function startClock(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  version: number,
  pace: OnlineGamePace,
  flow: MatchFlow,
  now: number,
): Promise<number | null> {
  const deadline = nextDeadline(pace, flow, now);
  if (deadline === null) return null;
  await ctx.scheduler.runAt(deadline, internal.games.checkTimeout, { gameId, version });
  return deadline;
}

/**
 * Saves the flow after a step: a version bump, its log rows and a new
 * turn deadline.
 */
async function save(
  ctx: MutationCtx,
  game: Doc<'games'>,
  callerId: string,
  flow: MatchFlow,
  now: number,
): Promise<number> {
  const version = game.version + 1;
  const eventCount = await writeEvents(ctx, game._id, game.eventCount, version, callerId, flow);
  const turnDeadline = await startClock(ctx, game._id, version, game.pace, flow, now);
  await ctx.db.patch(game._id, { ...gameFields(flow), version, eventCount, turnDeadline });
  return version;
}

/** The player the server waits for loses the current game. Saves it; returns the new version. */
async function applyTimeout(
  ctx: MutationCtx,
  game: Doc<'games'>,
  flow: MatchFlow,
  now: number,
): Promise<number> {
  const next = guarded(() => timeOut(flow, createCryptoRng()));
  return await save(ctx, game, SERVER_ACTOR, next, now);
}

/**
 * What `makeMove` and `answer` return. `ok: false` means the turn time ran
 * out first: the server saved the time out (the late player lost the
 * game) instead of the call. It is a return value, not a thrown error,
 * because a thrown error would roll the time out back too. A client
 * adapter turns it into a `TIMED_OUT` rejection.
 */
const writeResult = v.union(
  v.object({ ok: v.literal(true), version: v.number() }),
  v.object({
    ok: v.literal(false),
    version: v.number(),
    error: v.object({ code: v.literal('TIMED_OUT'), message: v.string() }),
  }),
);

type WriteResult = Infer<typeof writeResult>;

/**
 * Runs a player's call with `play`, unless the turn time has run out:
 * then the time out is saved instead, and the call gets `TIMED_OUT`.
 */
async function onTime(
  ctx: MutationCtx,
  game: Doc<'games'>,
  flow: MatchFlow,
  play: (now: number) => Promise<number>,
): Promise<WriteResult> {
  const now = Date.now();
  if (callTimedOut(game, now)) {
    const version = await applyTimeout(ctx, game, flow, now);
    return { ok: false, version, error: { ...TIMED_OUT_ERROR } };
  }
  return { ok: true, version: await play(now) };
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
 * once, so the game starts with the first player to move, and that
 * player's clock runs. Returns the id.
 */
export const createGame = mutation({
  args: {
    callerId: v.string(),
    players: v.object({ white: v.string(), black: v.string() }),
    choice: gameChoice,
    targetPoints: v.number(),
    /** `live` (1 minute per turn) or `async` (24 hours per turn). */
    pace: gamePace,
  },
  returns: v.id('games'),
  handler: async (ctx, { callerId, players, choice, targetPoints, pace }) => {
    guarded(() => checkNewGame(callerId, players));
    const flow = guarded(() =>
      createOnlineMatch({ choice, targetPoints, players }, createCryptoRng()),
    );
    const version = 1;
    const gameId = await ctx.db.insert('games', {
      players,
      choice,
      pace,
      targetPoints,
      rules: serializeRules(flow.match.rules),
      ...gameFields(flow),
      version,
      eventCount: 0,
      turnDeadline: null,
    });
    const eventCount = await writeEvents(ctx, gameId, 0, version, callerId, flow);
    const turnDeadline = await startClock(ctx, gameId, version, pace, flow, Date.now());
    await ctx.db.patch(gameId, { eventCount, turnDeadline });
    return gameId;
  },
});

/**
 * Plays one full turn for the caller: every move for the current roll.
 * Rejects a stale `expectedVersion`, a caller who is not to move, and an
 * illegal or incomplete turn. Then the server rolls the next dice.
 * Returns the new version, or `TIMED_OUT` when the turn time ran out
 * first (see `writeResult`).
 */
export const makeMove = mutation({
  args: {
    gameId: v.id('games'),
    callerId: v.string(),
    expectedVersion: v.number(),
    moves: v.array(moveInput),
  },
  returns: writeResult,
  handler: async (ctx, { gameId, callerId, expectedVersion, moves }) => {
    const { game, side, flow } = await loadForCaller(ctx, gameId, callerId, expectedVersion);
    return await onTime(ctx, game, flow, async (now) => {
      const next = guarded(() => playTurn(flow, side, moves.map(toMoveInput), createCryptoRng()));
      return await save(ctx, game, callerId, next, now);
    });
  },
});

/**
 * Answers the current question (for example the Plakoto mother question).
 * Returns like `makeMove`.
 */
export const answer = mutation({
  args: {
    gameId: v.id('games'),
    callerId: v.string(),
    expectedVersion: v.number(),
    choice: v.string(),
  },
  returns: writeResult,
  handler: async (ctx, { gameId, callerId, expectedVersion, choice }) => {
    const { game, side, flow } = await loadForCaller(ctx, gameId, callerId, expectedVersion);
    return await onTime(ctx, game, flow, async (now) => {
      const next = guarded(() => answerPrompt(flow, side, choice, createCryptoRng()));
      return await save(ctx, game, callerId, next, now);
    });
  },
});

/**
 * The caller resigns the match; the opponent wins. Allowed at any time,
 * so it takes no version: a resign never fails only because the opponent
 * just moved. It does not look at the turn timer. Returns the new version.
 */
export const resign = mutation({
  args: { gameId: v.id('games'), callerId: v.string() },
  returns: v.number(),
  handler: async (ctx, { gameId, callerId }) => {
    const { game, side, flow } = await loadForCaller(ctx, gameId, callerId, null);
    const next = guarded(() => resignMatch(flow, side, createCryptoRng()));
    return await save(ctx, game, callerId, next, Date.now());
  },
});

/**
 * Runs at each turn deadline (scheduled by `startClock`). If the game is
 * still at `version` and the time is up, the player the server waits for
 * loses the current game. If the game changed since (a move, an answer, a
 * resign), it does nothing.
 */
export const checkTimeout = internalMutation({
  args: { gameId: v.id('games'), version: v.number() },
  returns: v.null(),
  handler: async (ctx, { gameId, version }) => {
    const game = await ctx.db.get(gameId);
    const now = Date.now();
    const check = scheduledCheck(game, version, now);
    if (game === null || game.turnDeadline === null || check === 'skip') return null;
    if (check === 'early') {
      // Too early (the scheduler ran before the deadline): check again then.
      await ctx.scheduler.runAt(game.turnDeadline, internal.games.checkTimeout, {
        gameId,
        version,
      });
      return null;
    }
    await applyTimeout(ctx, game, loadFlow(game.flow), now);
    return null;
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
      pace: game.pace,
      turnDeadline: game.turnDeadline,
      players: game.players,
      flow: loadFlow(game.flow),
    });
  },
});
