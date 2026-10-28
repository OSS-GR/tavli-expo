// The Convex functions, run offline with convex-test. The dice come from
// the server's own RNG (Web Crypto); the tests read them from `getGame`.
// Each call is signed in with a convex-test identity (#131): `as(t, id)`
// calls as the user whose token subject is `id`.

import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { MAX_LISTED_GAMES, TURN_TIME_MS } from '@tavli/contracts';
import type {
  GameTransportErrorCode,
  OnlineGameChoice,
  OnlineGamePace,
  OnlineGameView,
} from '@tavli/contracts';
import { createBoard, createSeededRng, plakoto, replay } from '@tavli/engine';
import type { FlowEvent, GameFlow, GameState, PlayerId } from '@tavli/engine';
import { loadFlow, storeFlow } from '@tavli/online';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { createGame as createGameFunction } from './games';
import schema from './schema';
import { modules, pickTurn } from './test.setup';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };

type Tester = ReturnType<typeof setup>;

function setup() {
  return convexTest(schema, modules);
}

/** Calls as the signed-in user `id` (the token `subject`, the player id). */
function as(t: Tester, id: string) {
  return t.withIdentity({ subject: id });
}

// Every game schedules a turn timer. Fake timers keep those checks from
// firing on their own; the timer tests move the clock by hand.
const START = Date.UTC(2026, 9, 27, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

async function createGame(
  t: Tester,
  choice: OnlineGameChoice = 'portes',
  targetPoints = 1,
  pace: OnlineGamePace = 'live',
) {
  return await t.mutation(internal.games.createGame, {
    callerId: ALICE,
    players: PLAYERS,
    choice,
    targetPoints,
    pace,
  });
}

/** The game as White (Alice) sees it. */
async function view(t: Tester, gameId: Id<'games'>): Promise<OnlineGameView> {
  const game = await as(t, ALICE).query(api.games.getGame, { gameId });
  if (game === null) throw new Error('no game');
  return game;
}

function idOf(side: PlayerId): string {
  return PLAYERS[side];
}

function otherSide(side: PlayerId): PlayerId {
  return side === 'white' ? 'black' : 'white';
}

/** Expects a rejected call with this error code. */
async function rejectsWith(call: Promise<unknown>, code: GameTransportErrorCode) {
  await expect(call).rejects.toMatchObject({ data: { code } });
}

async function events(t: Tester, gameId: Id<'games'>): Promise<FlowEvent[]> {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query('moves')
      .withIndex('by_game', (q) => q.eq('gameId', gameId))
      .collect(),
  );
  return rows.map((row) => JSON.parse(row.event) as FlowEvent);
}

describe('createGame', () => {
  it('is internal: a client cannot call it (#274)', () => {
    // A game between two people starts only from an accepted invite.
    expectTypeOf(api.games).not.toHaveProperty('createGame');
    expectTypeOf(internal.games).toHaveProperty('createGame');
    expect(createGameFunction.isMutation).toBe(true);
    expect(createGameFunction.isInternal).toBe(true);
    expect(createGameFunction).not.toHaveProperty('isPublic');
  });

  it('starts a game: the server rolls the opening and the first roll', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const v = await view(t, gameId);
    expect(v.version).toBe(1);
    expect(v.status).toBe('active');
    expect(v.players).toEqual(PLAYERS);
    expect(v.game.phase).toBe('moving');
    expect(v.game.state.dice).not.toBeNull();
    expect(v.waitingFor).toBe(v.game.state.toMove);
    expect(v.prompt).toBeNull();
    expect(v.match.rules.match.rotation).toEqual(['portes']);
  });

  it('rejects a caller who is not a player, and the same player twice', async () => {
    const t = setup();
    await rejectsWith(
      t.mutation(internal.games.createGame, {
        callerId: 'eve',
        players: PLAYERS,
        choice: 'portes',
        targetPoints: 1,
        pace: 'live',
      }),
      'BAD_REQUEST',
    );
    await rejectsWith(
      t.mutation(internal.games.createGame, {
        callerId: ALICE,
        players: { white: ALICE, black: ALICE },
        choice: 'portes',
        targetPoints: 1,
        pace: 'live',
      }),
      'BAD_REQUEST',
    );
  });

  it('rejects the player id "server", which marks server events in the log', async () => {
    const t = setup();
    await rejectsWith(
      t.mutation(internal.games.createGame, {
        callerId: ALICE,
        players: { white: ALICE, black: 'server' },
        choice: 'portes',
        targetPoints: 1,
        pace: 'live',
      }),
      'BAD_REQUEST',
    );
  });

  it('stores no RNG state: the next dice do not exist before they are rolled', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const doc = await t.run(async (ctx) => ctx.db.get(gameId));
    expect(Object.keys(doc ?? {}).sort()).toEqual([
      '_creationTime',
      '_id',
      'choice',
      'eventCount',
      'flow',
      'pace',
      'players',
      'rules',
      'status',
      'targetPoints',
      'turnDeadline',
      'updatedAt',
      'variant',
      'version',
      'winner',
    ]);
    expect(doc?.flow).not.toMatch(/seed|rng/i);
  });
});

describe('a full Portes game between two players', () => {
  it('plays to the end with server dice; the log replays to the saved game', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const picker = createSeededRng(42);
    let v = await view(t, gameId);
    let turns = 0;
    while (v.status === 'active') {
      const side = v.waitingFor;
      if (side === null) throw new Error('nobody to wait for');
      const result = await as(t, idOf(side)).mutation(api.games.makeMove, {
        gameId,
        expectedVersion: v.version,
        moves: pickTurn(v.game, picker),
      });
      expect(result).toEqual({ ok: true, version: v.version + 1 });
      v = await view(t, gameId);
      turns += 1;
      if (turns > 2000) throw new Error('the game does not end');
    }
    expect(v.match.status).toBe('finished');
    expect(v.match.winner).not.toBeNull();
    expect(v.match.score[v.match.winner as PlayerId]).toBeGreaterThanOrEqual(1);
    expect(v.waitingFor).toBeNull();

    const log = await events(t, gameId);
    expect(log[0]?.type).toBe('start');
    const again = replay(log);
    expect(again.match).toEqual(v.match);
    expect(again.game).toEqual(v.game);

    const doc = await t.run(async (ctx) => ctx.db.get(gameId));
    expect(doc?.status).toBe('finished');
    expect(doc?.winner).toBe(v.match.winner);
    expect(doc?.eventCount).toBe(log.length);
  });
});

describe('makeMove', () => {
  it('rejects an illegal move and keeps the game as it was', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const v = await view(t, gameId);
    await rejectsWith(
      as(t, idOf(v.game.state.toMove)).mutation(api.games.makeMove, {
        gameId,
        expectedVersion: v.version,
        moves: [{ from: 1, to: 'off', die: 1 }],
      }),
      'ILLEGAL_MOVE',
    );
    // A die the roll does not have, or no die at all.
    await rejectsWith(
      as(t, idOf(v.game.state.toMove)).mutation(api.games.makeMove, {
        gameId,
        expectedVersion: v.version,
        moves: [{ from: 24, to: 17, die: 7 }],
      }),
      'ILLEGAL_MOVE',
    );
    expect(await view(t, gameId)).toEqual(v);
  });

  it('rejects the player who is not to move, and a stranger', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const v = await view(t, gameId);
    const moves = pickTurn(v.game, createSeededRng(1));
    await rejectsWith(
      as(t, idOf(otherSide(v.game.state.toMove))).mutation(api.games.makeMove, {
        gameId,
        expectedVersion: v.version,
        moves,
      }),
      'NOT_YOUR_TURN',
    );
    await rejectsWith(
      as(t, 'eve').mutation(api.games.makeMove, {
        gameId,
        expectedVersion: v.version,
        moves,
      }),
      'NOT_A_PLAYER',
    );
    expect((await view(t, gameId)).version).toBe(v.version);
  });

  it('rejects an old version: two phones send the same turn at once', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const v = await view(t, gameId);
    const phone = as(t, idOf(v.game.state.toMove));
    const turn = {
      gameId,
      expectedVersion: v.version,
      moves: pickTurn(v.game, createSeededRng(1)),
    };
    const results = await Promise.allSettled([
      phone.mutation(api.games.makeMove, turn),
      phone.mutation(api.games.makeMove, turn),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.reason).toMatchObject({ data: { code: 'STALE_VERSION' } });
    // Sent again later, the old turn is still stale.
    await rejectsWith(phone.mutation(api.games.makeMove, turn), 'STALE_VERSION');
    expect((await view(t, gameId)).version).toBe(v.version + 1);
  });

  it('rejects a game that does not exist', async () => {
    const t = setup();
    const gameId = await createGame(t);
    await t.run(async (ctx) => ctx.db.delete(gameId));
    await rejectsWith(
      as(t, ALICE).mutation(api.games.makeMove, { gameId, expectedVersion: 1, moves: [] }),
      'NOT_FOUND',
    );
    expect(await as(t, ALICE).query(api.games.getGame, { gameId })).toBeNull();
    expect(await as(t, 'eve').query(api.games.getGame, { gameId })).toBeNull();
  });
});

describe('sign-in (#131)', () => {
  it('the player id is the token subject, so a new session of the same user plays on', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const v = await view(t, gameId);
    // Another session (another issuer string, another token) of the same subject.
    const again = t.withIdentity({
      subject: idOf(v.game.state.toMove),
      issuer: 'https://example.test',
      sessionId: 'second-session',
    });
    const result = await again.mutation(api.games.makeMove, {
      gameId,
      expectedVersion: v.version,
      moves: pickTurn(v.game, createSeededRng(1)),
    });
    expect(result).toEqual({ ok: true, version: v.version + 1 });
  });

  it('refuses every call without a sign-in, and saves nothing', async () => {
    const t = setup();
    const gameId = await createGame(t);
    const v = await view(t, gameId);
    const moves = pickTurn(v.game, createSeededRng(1));
    await rejectsWith(
      t.mutation(api.games.makeMove, { gameId, expectedVersion: v.version, moves }),
      'NOT_SIGNED_IN',
    );
    await rejectsWith(
      t.mutation(api.games.answer, { gameId, expectedVersion: v.version, choice: 'playOn' }),
      'NOT_SIGNED_IN',
    );
    await rejectsWith(t.mutation(api.games.resign, { gameId }), 'NOT_SIGNED_IN');
    await rejectsWith(t.query(api.games.getGame, { gameId }), 'NOT_SIGNED_IN');
    await rejectsWith(t.query(api.games.listMyGames, { status: 'active' }), 'NOT_SIGNED_IN');
    // Also for a game that does not exist.
    await t.run(async (ctx) => ctx.db.delete(gameId));
    await rejectsWith(t.query(api.games.getGame, { gameId }), 'NOT_SIGNED_IN');
    const games = await t.run(async (ctx) => ctx.db.query('games').collect());
    expect(games).toHaveLength(0);
  });

  it('a stranger cannot read a game; both players can', async () => {
    const t = setup();
    const gameId = await createGame(t);
    await rejectsWith(as(t, 'eve').query(api.games.getGame, { gameId }), 'NOT_A_PLAYER');
    const white = await as(t, ALICE).query(api.games.getGame, { gameId });
    const black = await as(t, BOB).query(api.games.getGame, { gameId });
    expect(white).not.toBeNull();
    expect(black).toEqual(white);
  });

  it('rejects the token subject "server" and an empty one', async () => {
    const t = setup();
    const gameId = await createGame(t);
    for (const id of ['server', '', '  ']) {
      await rejectsWith(as(t, id).mutation(api.games.resign, { gameId }), 'BAD_REQUEST');
      await rejectsWith(as(t, id).query(api.games.getGame, { gameId }), 'BAD_REQUEST');
      await rejectsWith(
        as(t, id).query(api.games.listMyGames, { status: 'active' }),
        'BAD_REQUEST',
      );
    }
    expect((await view(t, gameId)).status).toBe('active');
  });
});

describe('listMyGames (#296)', () => {
  /** The ids of the games `id` lists with `status`, in order. */
  async function listed(t: Tester, id: string, status: 'active' | 'finished' = 'active') {
    const games = await as(t, id).query(api.games.listMyGames, { status });
    return games.map((game) => game.gameId);
  }

  it('returns at most MAX_LISTED_GAMES games, the newest of both sides', async () => {
    const t = setup();
    const ids: Id<'games'>[] = [];
    // Alice plays White in the even games and Black in the odd ones.
    for (let i = 0; i < MAX_LISTED_GAMES + 3; i++) {
      const players = i % 2 === 0 ? PLAYERS : { white: BOB, black: ALICE };
      ids.push(
        await t.mutation(internal.games.createGame, {
          callerId: ALICE,
          players,
          choice: 'portes',
          targetPoints: 1,
          pace: 'async',
        }),
      );
      vi.advanceTimersByTime(1000);
    }
    expect(await listed(t, ALICE)).toEqual(ids.slice(3).reverse());
    expect(await listed(t, BOB)).toEqual(ids.slice(3).reverse());
    expect(await listed(t, 'eve')).toEqual([]);
  });

  it('a save sets updatedAt: the changed game comes first', async () => {
    const t = setup();
    const first = await createGame(t);
    vi.advanceTimersByTime(1000);
    const second = await createGame(t);
    vi.advanceTimersByTime(1000);
    expect(await listed(t, ALICE)).toEqual([second, first]);
    await as(t, BOB).mutation(api.games.resign, { gameId: second });
    expect(await listed(t, ALICE)).toEqual([first]);
    expect(await listed(t, ALICE, 'finished')).toEqual([second]);
    const [summary] = await as(t, ALICE).query(api.games.listMyGames, { status: 'finished' });
    expect(summary).toMatchObject({ updatedAt: START + 2000, winner: 'white', mySide: 'white' });
  });

  it('a game saved before #296 (no updatedAt) counts its creation time and comes last', async () => {
    const t = setup();
    const old = await createGame(t);
    await t.run(async (ctx) => ctx.db.patch(old, { updatedAt: undefined }));
    vi.advanceTimersByTime(1000);
    const next = await createGame(t);
    const games = await as(t, ALICE).query(api.games.listMyGames, { status: 'active' });
    expect(games.map((game) => game.gameId)).toEqual([next, old]);
    const created = await t.run(async (ctx) => (await ctx.db.get(old))?._creationTime);
    expect(games[1]?.updatedAt).toBe(created);
  });

  it('tells nothing about the other player but their side', async () => {
    const t = setup();
    await createGame(t);
    const games = await as(t, ALICE).query(api.games.listMyGames, { status: 'active' });
    expect(games).toHaveLength(1);
    expect(JSON.stringify(games)).not.toContain(BOB);
  });
});

describe('resign', () => {
  it('ends the match: the opponent wins, and no more moves are taken', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 5);
    const before = await view(t, gameId);
    // The player who is not to move may resign too.
    const resigner = otherSide(before.game.state.toMove);
    await as(t, idOf(resigner)).mutation(api.games.resign, { gameId });
    const v = await view(t, gameId);
    expect(v.status).toBe('finished');
    expect(v.match.winner).toBe(otherSide(resigner));
    expect(v.match.resignedBy).toBe(resigner);
    expect(v.waitingFor).toBeNull();
    await rejectsWith(
      as(t, idOf(before.game.state.toMove)).mutation(api.games.makeMove, {
        gameId,
        expectedVersion: v.version,
        moves: pickTurn(before.game, createSeededRng(1)),
      }),
      'GAME_OVER',
    );
    await rejectsWith(as(t, ALICE).mutation(api.games.resign, { gameId }), 'GAME_OVER');
    await rejectsWith(as(t, 'eve').mutation(api.games.resign, { gameId }), 'NOT_A_PLAYER');
  });
});

describe('the Plakoto mother question', () => {
  /**
   * Black to move with 5-2. Black's 3/1* pins White's mother (White's lone
   * checker on its start point). Same position as the engine test
   * `plakoto-mother.test.ts`: `w: 24 6x14 ; b: 10x14 3`.
   */
  async function pinTheMother(t: Tester): Promise<Id<'games'>> {
    const gameId = await createGame(t, 'plakoto');
    await t.run(async (ctx) => {
      const doc = await ctx.db.get(gameId);
      if (doc === null) throw new Error('no game');
      const flow = loadFlow(doc.flow);
      const board = createBoard(
        { white: { points: { 24: 1, 6: 14 } }, black: { points: { 10: 14, 3: 1 } } },
        'contrary',
      );
      const state: GameState = {
        ...flow.game.state,
        board,
        toMove: 'black',
        dice: [5, 2],
        turnNumber: 9,
        variantData: null,
      };
      const game: GameFlow = {
        ...flow.game,
        phase: 'moving',
        state,
        starter: 'black',
        played: [],
        lastTurn: null,
        result: null,
      };
      await ctx.db.patch(gameId, { flow: storeFlow({ ...flow, game }) });
    });
    const v = await view(t, gameId);
    const state = v.game.state;
    const pin = plakoto
      .legalTurns(state, [5, 2])
      .find((turn) => turn.moves.some((m) => m.capture === 'pin'));
    if (pin === undefined) throw new Error('no pinning turn');
    await as(t, BOB).mutation(api.games.makeMove, {
      gameId,
      expectedVersion: v.version,
      moves: [...pin.moves],
    });
    return gameId;
  }

  it('asks the pinned player; only they may answer, through `answer`', async () => {
    const t = setup();
    const gameId = await pinTheMother(t);
    const v = await view(t, gameId);
    expect(v.game.phase).toBe('awaiting-answer');
    expect(v.prompt).toEqual({
      player: 'white',
      kind: 'motherPinned',
      choices: ['resign', 'playOn'],
    });
    expect(v.waitingFor).toBe('white');
    // No dice for White before the answer.
    expect(v.game.state.dice).toBeNull();

    const call = { gameId, expectedVersion: v.version };
    await rejectsWith(
      as(t, BOB).mutation(api.games.answer, { ...call, choice: 'playOn' }),
      'NOT_YOUR_TURN',
    );
    await rejectsWith(
      as(t, ALICE).mutation(api.games.answer, { ...call, choice: 'maybe' }),
      'ILLEGAL_ACTION',
    );
    await rejectsWith(
      as(t, ALICE).mutation(api.games.makeMove, { ...call, moves: [] }),
      'ILLEGAL_ACTION',
    );

    await as(t, ALICE).mutation(api.games.answer, { ...call, choice: 'playOn' });
    const after = await view(t, gameId);
    expect(after.version).toBe(v.version + 1);
    expect(after.status).toBe('active');
    expect(after.prompt).toBeNull();
    // The server rolled for White right after the answer (with 6-6 White
    // has no move and passes, so then it is Black's roll).
    const rolledForWhite =
      after.game.state.toMove === 'white'
        ? after.game.state.dice !== null
        : after.game.lastTurn?.player === 'white';
    expect(rolledForWhite).toBe(true);
    await rejectsWith(
      as(t, ALICE).mutation(api.games.answer, { ...call, choice: 'playOn' }),
      'STALE_VERSION',
    );
  });

  it('"resign" gives the game to the opponent (double, 2 points)', async () => {
    const t = setup();
    const gameId = await pinTheMother(t);
    const v = await view(t, gameId);
    await as(t, ALICE).mutation(api.games.answer, {
      gameId,
      expectedVersion: v.version,
      choice: 'resign',
    });
    const after = await view(t, gameId);
    expect(after.status).toBe('finished');
    expect(after.match.winner).toBe('black');
    expect(after.match.score).toEqual({ white: 0, black: 2 });
  });

  it('a late answer gets TIMED_OUT: the pinned player loses the game on time', async () => {
    const t = setup();
    const gameId = await pinTheMother(t);
    const v = await view(t, gameId);
    expect(v.turnDeadline).toBe(START + TURN_TIME_MS.live);
    vi.setSystemTime(START + TURN_TIME_MS.live);
    const result = await as(t, ALICE).mutation(api.games.answer, {
      gameId,
      expectedVersion: v.version,
      choice: 'playOn',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'TIMED_OUT' } });
    const after = await view(t, gameId);
    expect(after.status).toBe('finished');
    expect(after.match.games[0]).toMatchObject({ winner: 'black', points: 2, reason: 'timeout' });
    expect(after.turnDeadline).toBeNull();
  });
});

describe('turn timers (#133)', () => {
  const LIVE = TURN_TIME_MS.live;
  const ASYNC = TURN_TIME_MS.async;

  /** Moves the clock and runs the checks that are due. */
  async function wait(t: Tester, ms: number) {
    vi.advanceTimersByTime(ms);
    await t.finishInProgressScheduledFunctions();
  }

  /** The side the server waits for. */
  function waiting(v: OnlineGameView): PlayerId {
    if (v.waitingFor === null) throw new Error('nobody to wait for');
    return v.waitingFor;
  }

  async function playOneTurn(t: Tester, gameId: Id<'games'>) {
    const v = await view(t, gameId);
    return await as(t, idOf(waiting(v))).mutation(api.games.makeMove, {
      gameId,
      expectedVersion: v.version,
      moves: pickTurn(v.game, createSeededRng(v.version)),
    });
  }

  it('createGame sets the pace and the first deadline (live: 1 minute)', async () => {
    const t = setup();
    const v = await view(t, await createGame(t));
    expect(v.pace).toBe('live');
    expect(v.turnDeadline).toBe(START + LIVE);
  });

  it('a live time out loses the game, and the next game starts with a new deadline', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 5);
    const before = await view(t, gameId);
    const late = waiting(before);
    await wait(t, LIVE);
    const v = await view(t, gameId);
    expect(v.version).toBe(before.version + 1);
    expect(v.status).toBe('active');
    expect(v.match.games).toHaveLength(1);
    expect(v.match.games[0]).toMatchObject({ winner: otherSide(late), reason: 'timeout' });
    expect(v.match.score[otherSide(late)]).toBeGreaterThanOrEqual(1);
    // The next game runs, and its first turn has its own minute.
    expect(v.game.phase).toBe('moving');
    expect(v.game.result).toBeNull();
    expect(v.turnDeadline).toBe(START + 2 * LIVE);

    // The server played the time out, and the log still replays.
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query('moves')
        .withIndex('by_game', (q) => q.eq('gameId', gameId))
        .collect(),
    );
    const timeout = rows.find((row) => row.event.includes('"timeout"'));
    expect(timeout?.actor).toBe('server');
    expect(JSON.parse(timeout?.event ?? 'null')).toEqual({ type: 'timeout', player: late });
    const again = replay(await events(t, gameId));
    expect(again.match).toEqual(v.match);
    expect(again.game).toEqual(v.game);
  });

  it('the match ends when the time out gives the last point; no clock runs then', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 1);
    const late = waiting(await view(t, gameId));
    await wait(t, LIVE);
    const v = await view(t, gameId);
    expect(v.status).toBe('finished');
    expect(v.match.winner).toBe(otherSide(late));
    expect(v.turnDeadline).toBeNull();
    expect(v.waitingFor).toBeNull();
    const doc = await t.run(async (ctx) => ctx.db.get(gameId));
    expect(doc?.turnDeadline).toBeNull();
    // Nothing is scheduled any more.
    await wait(t, 10 * ASYNC);
    expect((await view(t, gameId)).version).toBe(v.version);
  });

  it('a move just in time is fine, and the old check after it does nothing', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 5);
    await wait(t, LIVE - 1);
    const result = await playOneTurn(t, gameId);
    expect(result).toEqual({ ok: true, version: 2 });
    // The check for version 1 runs now, at the first deadline: it does nothing.
    await wait(t, 1);
    const v = await view(t, gameId);
    expect(v.version).toBe(2);
    expect(v.match.games).toHaveLength(0);
    expect(v.turnDeadline).toBe(START + LIVE - 1 + LIVE);
    // The new deadline holds for the next player.
    const late = waiting(v);
    await wait(t, LIVE - 1);
    const after = await view(t, gameId);
    expect(after.version).toBe(3);
    expect(after.match.games[0]).toMatchObject({ winner: otherSide(late), reason: 'timeout' });
  });

  it('a move after the deadline gets TIMED_OUT, and the time out is saved', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 5);
    const before = await view(t, gameId);
    const late = waiting(before);
    // The clock reaches the deadline before the scheduled check runs.
    vi.setSystemTime(START + LIVE);
    const result = await as(t, idOf(late)).mutation(api.games.makeMove, {
      gameId,
      expectedVersion: before.version,
      moves: pickTurn(before.game, createSeededRng(1)),
    });
    expect(result).toEqual({
      ok: false,
      version: before.version + 1,
      error: { code: 'TIMED_OUT', message: expect.any(String) },
    });
    const v = await view(t, gameId);
    expect(v.version).toBe(before.version + 1);
    expect(v.match.games[0]).toMatchObject({ winner: otherSide(late), reason: 'timeout' });
    // The scheduled check for the old version runs later and does nothing.
    await wait(t, 0);
    expect((await view(t, gameId)).version).toBe(v.version);
  });

  it('async games have 24 hours per turn', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 5, 'async');
    const before = await view(t, gameId);
    expect(before.pace).toBe('async');
    expect(before.turnDeadline).toBe(START + ASYNC);
    await wait(t, ASYNC - 1);
    expect((await view(t, gameId)).version).toBe(before.version);
    await wait(t, 1);
    const v = await view(t, gameId);
    expect(v.version).toBe(before.version + 1);
    expect(v.match.games[0]).toMatchObject({
      winner: otherSide(waiting(before)),
      reason: 'timeout',
    });
    expect(v.turnDeadline).toBe(START + 2 * ASYNC);
  });

  it('resign stops the clock: the check at the deadline does nothing', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 5);
    await as(t, BOB).mutation(api.games.resign, { gameId });
    const v = await view(t, gameId);
    expect(v.turnDeadline).toBeNull();
    await wait(t, LIVE);
    const after = await view(t, gameId);
    expect(after.version).toBe(v.version);
    expect(after.match).toEqual(v.match);
  });
});
