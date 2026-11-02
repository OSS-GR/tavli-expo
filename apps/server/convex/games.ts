/**
 * Online games (#126, ADR-0004): create a game, play a turn, answer a
 * question, resign, and watch a game. A game between two people starts
 * from an accepted invite (`invites.ts`); `createGame` is internal (#274).
 * Turn timers (#133): each turn has a deadline; when it passes, the player
 * the server waits for loses the game.
 *
 * Each mutation is one Convex transaction: load the game, check the call,
 * run the engine (`@tavli/online`), and save with a version bump. If
 * anything throws, nothing is saved.
 *
 * The server rolls a player's dice only when that player asks
 * (`rollDice`, #355), the opening die of a match's first game too (#379).
 * It starts the next game, and rolls its opening, by itself.
 *
 * The call checks are pure helpers in `@tavli/online` (#251). The
 * in-memory server uses them too. This file keeps the database and
 * scheduler parts.
 *
 * Timers: every save that leaves the match running sets a new
 * `turnDeadline` and schedules `checkTimeout` for that version. A later
 * change bumps the version, so an old check does nothing: no cancel is
 * needed. `makeMove`, `answer` and `rollDice` check the deadline too. A
 * roll keeps the deadline of the turn it starts (`rollDeadline`): the
 * turn time covers the wait before the roll.
 *
 * Push (#280): a save that moves the wait to the other player of an async
 * game, or starts the next game of the match, schedules a "your turn"
 * push (`scheduleTurnPush` in `push.ts`). A save that ends an async match
 * schedules a "game over" push instead (#316). It is sent after the save,
 * so it never fails a move.
 *
 * Drafts (#374): `setDraft` keeps the turn so far of the player the
 * server waits for in `drafts`, and `getGame` shows it to both players.
 * It is never a turn: only `makeMove` ends one, and every save deletes
 * the draft.
 *
 * The caller is the signed-in user (#131): every public function reads
 * the player id from `ctx.auth` (`signedInPlayer`), and no public call
 * takes a player id. Each call checks that the caller may act. `getGame` answers
 * only the two players, and `listMyGames` (#296) lists only the caller's games.
 */

import { ConvexError, v } from 'convex/values';
import type { Infer } from 'convex/values';

import { MAX_LISTED_GAMES } from '@tavli/contracts';
import type { GameSummary, GameTransportErrorData, OnlineGameView } from '@tavli/contracts';
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
  checkTurnTimeMinutes,
  checkViewer,
  createOnlineMatch,
  eventActor,
  latestGames,
  loadFlow,
  loadStored,
  matchStatus,
  nextDeadline,
  nextDraft,
  playTurn,
  resign as resignMatch,
  rollCallVersion,
  rollDeadline,
  rollDice as rollMatchDice,
  scheduledCheck,
  storeFlow,
  storeStep,
  summarizeGame,
  timeOut,
  toView,
} from '@tavli/online';
import type { LoadedFlow, SavedDraft, SteppedFlow } from '@tavli/online';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { signedInPlayer } from './caller';
import { createCryptoRng } from './model/cryptoRng';
import { NEW_MATCH_WAIT, turnWait } from './model/push';
import { scheduleTurnPush } from './push';
import { gameChoice, gameStatus, gameTurnTimeMinutes } from './schema';

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

/**
 * The fields of `flow`. `stored` is its text: `storeStep` after a step,
 * so the view keeps the game that ended (#299).
 */
function gameFields(flow: MatchFlow, stored: string) {
  return {
    variant: flow.game.state.variant,
    flow: stored,
    status: matchStatus(flow),
    winner: flow.match.winner,
  };
}

/**
 * Loads a game for `callerId` and checks the version (`checkCall`).
 * `expectedVersion` may be a function of the saved flow (a roll,
 * `rollCallVersion`).
 */
async function loadForCaller(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  callerId: string,
  expectedVersion: number | null | ((flow: MatchFlow) => number | null),
): Promise<{ game: Doc<'games'>; side: PlayerId; before: LoadedFlow }> {
  const loaded = await ctx.db.get(gameId);
  const before = loaded === null ? null : loadStored(loaded.flow);
  const version =
    typeof expectedVersion === 'function'
      ? before === null
        ? null
        : expectedVersion(before.flow)
      : expectedVersion;
  const { game, side } = guarded(() => checkCall(loaded, callerId, version));
  return { game, side, before: before ?? loadStored(game.flow) };
}

/**
 * Starts the clock for the turn that begins `now`: returns the deadline
 * and schedules `checkTimeout` for `version` at that time. `null` (and no
 * check) when the match is over. `deadline` keeps a deadline the step
 * worked out itself (a roll keeps the turn's deadline, `rollDeadline`).
 */
async function startClock(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  version: number,
  turnTimeMinutes: number | null,
  flow: MatchFlow,
  now: number,
  deadline: number | null = nextDeadline(turnTimeMinutes, flow, now),
): Promise<number | null> {
  if (deadline === null) return null;
  await ctx.scheduler.runAt(deadline, internal.games.checkTimeout, { gameId, version });
  return deadline;
}

/** The `drafts` row of a game (#374), or `null`. */
async function draftRow(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'drafts'> | null> {
  return await ctx.db
    .query('drafts')
    .withIndex('by_game', (q) => q.eq('gameId', gameId))
    .unique();
}

/** A `drafts` row as `@tavli/online` reads it. */
function savedDraft(row: Doc<'drafts'> | null): SavedDraft | null {
  if (row === null) return null;
  return { version: row.version, seq: row.seq, moves: JSON.parse(row.moves) as MoveInput[] };
}

/**
 * Saves `flow` after a step from `before` (the saved flow): a version
 * bump, its log rows, a new turn deadline, and a "your turn" push when
 * the wait moved to the other player of an async game, or a new game
 * started (#280), or a "game over" push when the step ended an async
 * match (#316). `deadline` is passed to `startClock`. A step ends the
 * draft of the turn (#374): its row goes.
 */
async function save(
  ctx: MutationCtx,
  game: Doc<'games'>,
  callerId: string,
  before: LoadedFlow,
  flow: SteppedFlow,
  now: number,
  deadline?: number | null,
): Promise<number> {
  const version = game.version + 1;
  const eventCount = await writeEvents(ctx, game._id, game.eventCount, version, callerId, flow);
  const turnDeadline = await startClock(
    ctx,
    game._id,
    version,
    game.turnTimeMinutes,
    flow,
    now,
    deadline,
  );
  await ctx.db.patch(game._id, {
    ...gameFields(flow, storeStep(before, flow)),
    version,
    eventCount,
    turnDeadline,
    updatedAt: now,
  });
  const draft = await draftRow(ctx, game._id);
  if (draft !== null) await ctx.db.delete(draft._id);
  await scheduleTurnPush(ctx, game, version, turnWait(before.flow), turnWait(flow), callerId);
  return version;
}

/** The player the server waits for loses the current game. Saves it; returns the new version. */
async function applyTimeout(
  ctx: MutationCtx,
  game: Doc<'games'>,
  before: LoadedFlow,
  now: number,
): Promise<number> {
  const next = guarded(() => timeOut(before.flow, createCryptoRng()));
  return await save(ctx, game, SERVER_ACTOR, before, next, now);
}

/**
 * What `makeMove`, `answer` and `rollDice` return. `ok: false` means the
 * turn time ran out first. Then the server saved the time out (the late
 * player lost the game) instead of the call. It is a return value, not a thrown error,
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
  before: LoadedFlow,
  play: (now: number) => Promise<number>,
): Promise<WriteResult> {
  const now = Date.now();
  if (callTimedOut(game, now)) {
    const version = await applyTimeout(ctx, game, before, now);
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

export interface NewGame {
  /** Who starts the game: the signed-in caller, or `createGame`'s `callerId`. */
  readonly callerId: string;
  readonly players: { readonly white: string; readonly black: string };
  readonly choice: Infer<typeof gameChoice>;
  readonly targetPoints: number;
  readonly turnTimeMinutes: number | null;
}

/**
 * Creates a game between two players, in the caller's transaction.
 * `createGame` and `acceptInvite` (`invites.ts`) both use it. The game
 * starts in the opening roll (#379): each player rolls their own die with
 * `rollDice`, and the opening's clock runs. In an async game the side the
 * server waits for (White while nobody rolled) gets a "your turn" push
 * when it is not the caller (#280). Returns the id.
 */
export async function insertGame(ctx: MutationCtx, game: NewGame): Promise<Id<'games'>> {
  const { callerId, choice, targetPoints, turnTimeMinutes } = game;
  const players = { white: game.players.white, black: game.players.black };
  guarded(() => {
    checkNewGame(callerId, players);
    checkTurnTimeMinutes(turnTimeMinutes);
  });
  const flow = guarded(() =>
    createOnlineMatch({ choice, targetPoints, players }, createCryptoRng()),
  );
  const version = 1;
  const now = Date.now();
  const gameId = await ctx.db.insert('games', {
    players,
    choice,
    turnTimeMinutes,
    targetPoints,
    rules: serializeRules(flow.match.rules),
    // A new match: no game ended before it.
    ...gameFields(flow, storeFlow(flow, null)),
    version,
    eventCount: 0,
    turnDeadline: null,
    updatedAt: now,
  });
  const eventCount = await writeEvents(ctx, gameId, 0, version, callerId, flow);
  const turnDeadline = await startClock(ctx, gameId, version, turnTimeMinutes, flow, now);
  await ctx.db.patch(gameId, { eventCount, turnDeadline });
  // Nobody was waited for before. The caller started the game and is in
  // the app, so only the other player can get a push.
  await scheduleTurnPush(
    ctx,
    { _id: gameId, turnTimeMinutes, players },
    version,
    NEW_MATCH_WAIT,
    turnWait(flow),
    callerId,
  );
  return gameId;
}

/**
 * Creates a game between two players (see `insertGame`). Internal (#274):
 * a client cannot call it, so a game between two people starts only from
 * an accepted invite (`acceptInvite`). Tests and the Convex dashboard use
 * it. An internal function has no signed-in caller, so `callerId` names
 * who starts the game; it must be one of the players (the same checks as
 * `createGame` of the in-memory server in `@tavli/online`). Returns the id.
 */
export const createGame = internalMutation({
  args: {
    callerId: v.string(),
    players: v.object({ white: v.string(), black: v.string() }),
    choice: gameChoice,
    targetPoints: v.number(),
    /** A per-turn time limit in minutes, or `null` for the 24-hour default (#183). */
    turnTimeMinutes: gameTurnTimeMinutes,
  },
  returns: v.id('games'),
  handler: async (ctx, args) => await insertGame(ctx, args),
});

/**
 * Plays one full turn for the caller: every move for the current roll.
 * Rejects a stale `expectedVersion`, a caller who is not to move, and an
 * illegal or incomplete turn. Then the server waits for the next roll.
 * Returns the new version, or `TIMED_OUT` when the turn time ran out
 * first (see `writeResult`).
 */
export const makeMove = mutation({
  args: {
    gameId: v.id('games'),
    expectedVersion: v.number(),
    moves: v.array(moveInput),
  },
  returns: writeResult,
  handler: async (ctx, { gameId, expectedVersion, moves }) => {
    const callerId = await signedInPlayer(ctx);
    const { game, side, before } = await loadForCaller(ctx, gameId, callerId, expectedVersion);
    return await onTime(ctx, game, before, async (now) => {
      const next = guarded(() =>
        playTurn(before.flow, side, moves.map(toMoveInput), createCryptoRng()),
      );
      return await save(ctx, game, callerId, before, next, now);
    });
  },
});

/**
 * Shows the caller's turn so far to the other player (#374): every move
 * since the roll, before Confirm (empty after the last undo). Only the
 * player the server waits for, while they move, at `expectedVersion` and
 * before the deadline; the engine checks each move (`nextDraft` in
 * `@tavli/online`). A refused draft throws and saves nothing; a late one
 * gets `TIMED_OUT`, and the scheduled `checkTimeout` ends the game. It
 * keeps the version, starts no clock, writes no log row and sends no
 * push. Both players watch `getGame`, so the other phone gets it at once.
 */
export const setDraft = mutation({
  args: {
    gameId: v.id('games'),
    expectedVersion: v.number(),
    moves: v.array(moveInput),
  },
  returns: v.null(),
  handler: async (ctx, { gameId, expectedVersion, moves }) => {
    const callerId = await signedInPlayer(ctx);
    const { game, side, before } = await loadForCaller(ctx, gameId, callerId, expectedVersion);
    const row = await draftRow(ctx, gameId);
    const draft = guarded(() =>
      nextDraft(game, before.flow, side, moves.map(toMoveInput), savedDraft(row), Date.now()),
    );
    const fields = { version: draft.version, seq: draft.seq, moves: JSON.stringify(draft.moves) };
    if (row === null) await ctx.db.insert('drafts', { gameId, ...fields });
    else await ctx.db.patch(row._id, fields);
    return null;
  },
});

/**
 * Rolls the dice for the caller, who must be the player the server waits
 * for in `awaiting-roll` (#355). The server rolls with its own dice. A
 * roll with no legal move passes at once, and the server then waits for
 * the other player's roll: both views show the pass in `game.lastTurn`.
 * The roll keeps the turn's deadline; a pass starts the other player's
 * turn time. Returns like `makeMove`.
 *
 * In the opening roll (#379) it rolls the caller's opening die, while it
 * is still to roll. Both players may roll at the same time, so the
 * version is not checked then (`rollCallVersion`).
 */
export const rollDice = mutation({
  args: {
    gameId: v.id('games'),
    expectedVersion: v.number(),
  },
  returns: writeResult,
  handler: async (ctx, { gameId, expectedVersion }) => {
    const callerId = await signedInPlayer(ctx);
    const { game, side, before } = await loadForCaller(ctx, gameId, callerId, (flow) =>
      rollCallVersion(flow, expectedVersion),
    );
    return await onTime(ctx, game, before, async (now) => {
      const next = guarded(() => rollMatchDice(before.flow, side, createCryptoRng()));
      const deadline = rollDeadline(game, game.turnTimeMinutes, side, next, now);
      return await save(ctx, game, callerId, before, next, now, deadline);
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
    expectedVersion: v.number(),
    choice: v.string(),
  },
  returns: writeResult,
  handler: async (ctx, { gameId, expectedVersion, choice }) => {
    const callerId = await signedInPlayer(ctx);
    const { game, side, before } = await loadForCaller(ctx, gameId, callerId, expectedVersion);
    return await onTime(ctx, game, before, async (now) => {
      const next = guarded(() => answerPrompt(before.flow, side, choice, createCryptoRng()));
      return await save(ctx, game, callerId, before, next, now);
    });
  },
});

/**
 * The caller resigns the match; the opponent wins. Allowed at any time,
 * so it takes no version: a resign never fails only because the opponent
 * just moved. It does not look at the turn timer. Returns the new version.
 */
export const resign = mutation({
  args: { gameId: v.id('games') },
  returns: v.number(),
  handler: async (ctx, { gameId }) => {
    const callerId = await signedInPlayer(ctx);
    return await resignAs(ctx, gameId, callerId);
  },
});

/**
 * `callerId` resigns the match in the caller's transaction: the same
 * checks and the same save as `resign`, so the opponent gets the result
 * and the push rules hold. `resign` and `deleteMyAccount` (`account.ts`,
 * #302) both use it. Returns the new version.
 */
export async function resignAs(
  ctx: MutationCtx,
  gameId: Id<'games'>,
  callerId: string,
): Promise<number> {
  const { game, side, before } = await loadForCaller(ctx, gameId, callerId, null);
  const next = guarded(() => resignMatch(before.flow, side, createCryptoRng()));
  return await save(ctx, game, callerId, before, next, Date.now());
}

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
    await applyTimeout(ctx, game, loadStored(game.flow), now);
    return null;
  },
});

/** The view input of a stored game, without its flow (`toView`, `summarizeGame`). */
function gameInput(game: Doc<'games'>) {
  return {
    gameId: game._id,
    version: game.version,
    choice: game.choice,
    turnTimeMinutes: game.turnTimeMinutes,
    turnDeadline: game.turnDeadline,
    players: game.players,
  };
}

/**
 * The game as a client may see it, or `null` when there is no such game.
 * It never holds dice that are not rolled yet. Both players watch this
 * query, so their screens update after every change, and after each
 * draft (#374). Only the two players may read it: anyone else gets
 * `NOT_A_PLAYER` (#131).
 */
export const getGame = query({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }): Promise<OnlineGameView | null> => {
    const callerId = await signedInPlayer(ctx);
    const loaded = await ctx.db.get(gameId);
    const game = guarded(() => checkViewer(loaded, callerId));
    if (game === null) return null;
    const { flow, previousGame } = loadStored(game.flow);
    const draft = savedDraft(await draftRow(ctx, game._id));
    return toView({ ...gameInput(game), flow, previousGame, draft });
  },
});

/**
 * The newest `MAX_LISTED_GAMES` games of `callerId` on one side with
 * `status`, from that side's index, newest change first.
 */
async function gamesOnSide(
  ctx: QueryCtx,
  index: 'by_white' | 'by_black',
  callerId: string,
  status: Doc<'games'>['status'],
): Promise<Doc<'games'>[]> {
  const field = index === 'by_white' ? 'players.white' : 'players.black';
  return await ctx.db
    .query('games')
    .withIndex(index, (q) => q.eq(field, callerId).eq('status', status))
    .order('desc')
    .take(MAX_LISTED_GAMES);
}

/**
 * The caller's games with `status` (#296), newest change first, at most
 * `MAX_LISTED_GAMES`. It reads the newest of each side's index
 * (`by_white`, `by_black`) and keeps the newest of both. A summary tells
 * nothing about the other player but their side (`summarizeGame`).
 */
export const listMyGames = query({
  args: { status: gameStatus },
  handler: async (ctx, { status }): Promise<GameSummary[]> => {
    const callerId = await signedInPlayer(ctx);
    const [asWhite, asBlack] = await Promise.all([
      gamesOnSide(ctx, 'by_white', callerId, status),
      gamesOnSide(ctx, 'by_black', callerId, status),
    ]);
    return latestGames(
      [...asWhite, ...asBlack].map((game) =>
        summarizeGame(
          {
            ...gameInput(game),
            flow: loadFlow(game.flow),
            updatedAt: game.updatedAt ?? game._creationTime,
          },
          callerId,
        ),
      ),
    );
  },
});
