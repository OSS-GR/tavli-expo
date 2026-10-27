// The Convex functions, run offline with convex-test. The dice come from
// the server's own RNG (Web Crypto); the tests read them from `getGame`.

import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';

import type { GameTransportErrorCode, OnlineGameChoice, OnlineGameView } from '@tavli/contracts';
import { createBoard, createSeededRng, plakoto, replay } from '@tavli/engine';
import type { FlowEvent, GameFlow, GameState, PlayerId } from '@tavli/engine';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { loadFlow, storeFlow } from './model/online-game';
import schema from './schema';
import { modules, pickTurn } from './test.setup';

const ALICE = 'alice';
const BOB = 'bob';
const PLAYERS = { white: ALICE, black: BOB };

type Tester = ReturnType<typeof setup>;

function setup() {
  return convexTest(schema, modules);
}

async function createGame(t: Tester, choice: OnlineGameChoice = 'portes', targetPoints = 1) {
  return await t.mutation(api.games.createGame, {
    callerId: ALICE,
    players: PLAYERS,
    choice,
    targetPoints,
  });
}

async function view(t: Tester, gameId: Id<'games'>): Promise<OnlineGameView> {
  const game = await t.query(api.games.getGame, { gameId });
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
      t.mutation(api.games.createGame, {
        callerId: 'eve',
        players: PLAYERS,
        choice: 'portes',
        targetPoints: 1,
      }),
      'BAD_REQUEST',
    );
    await rejectsWith(
      t.mutation(api.games.createGame, {
        callerId: ALICE,
        players: { white: ALICE, black: ALICE },
        choice: 'portes',
        targetPoints: 1,
      }),
      'BAD_REQUEST',
    );
  });

  it('rejects the player id "server", which marks server events in the log', async () => {
    const t = setup();
    await rejectsWith(
      t.mutation(api.games.createGame, {
        callerId: ALICE,
        players: { white: ALICE, black: 'server' },
        choice: 'portes',
        targetPoints: 1,
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
      'players',
      'rules',
      'status',
      'targetPoints',
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
      const version = await t.mutation(api.games.makeMove, {
        gameId,
        callerId: idOf(side),
        expectedVersion: v.version,
        moves: pickTurn(v.game, picker),
      });
      expect(version).toBe(v.version + 1);
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
      t.mutation(api.games.makeMove, {
        gameId,
        callerId: idOf(v.game.state.toMove),
        expectedVersion: v.version,
        moves: [{ from: 1, to: 'off', die: 1 }],
      }),
      'ILLEGAL_MOVE',
    );
    // A die the roll does not have, or no die at all.
    await rejectsWith(
      t.mutation(api.games.makeMove, {
        gameId,
        callerId: idOf(v.game.state.toMove),
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
      t.mutation(api.games.makeMove, {
        gameId,
        callerId: idOf(otherSide(v.game.state.toMove)),
        expectedVersion: v.version,
        moves,
      }),
      'NOT_YOUR_TURN',
    );
    await rejectsWith(
      t.mutation(api.games.makeMove, {
        gameId,
        callerId: 'eve',
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
    const turn = {
      gameId,
      callerId: idOf(v.game.state.toMove),
      expectedVersion: v.version,
      moves: pickTurn(v.game, createSeededRng(1)),
    };
    const results = await Promise.allSettled([
      t.mutation(api.games.makeMove, turn),
      t.mutation(api.games.makeMove, turn),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.reason).toMatchObject({ data: { code: 'STALE_VERSION' } });
    // Sent again later, the old turn is still stale.
    await rejectsWith(t.mutation(api.games.makeMove, turn), 'STALE_VERSION');
    expect((await view(t, gameId)).version).toBe(v.version + 1);
  });

  it('rejects a game that does not exist', async () => {
    const t = setup();
    const gameId = await createGame(t);
    await t.run(async (ctx) => ctx.db.delete(gameId));
    await rejectsWith(
      t.mutation(api.games.makeMove, { gameId, callerId: ALICE, expectedVersion: 1, moves: [] }),
      'NOT_FOUND',
    );
    expect(await t.query(api.games.getGame, { gameId })).toBeNull();
  });
});

describe('resign', () => {
  it('ends the match: the opponent wins, and no more moves are taken', async () => {
    const t = setup();
    const gameId = await createGame(t, 'portes', 5);
    const before = await view(t, gameId);
    // The player who is not to move may resign too.
    const resigner = otherSide(before.game.state.toMove);
    await t.mutation(api.games.resign, { gameId, callerId: idOf(resigner) });
    const v = await view(t, gameId);
    expect(v.status).toBe('finished');
    expect(v.match.winner).toBe(otherSide(resigner));
    expect(v.match.resignedBy).toBe(resigner);
    expect(v.waitingFor).toBeNull();
    await rejectsWith(
      t.mutation(api.games.makeMove, {
        gameId,
        callerId: idOf(before.game.state.toMove),
        expectedVersion: v.version,
        moves: pickTurn(before.game, createSeededRng(1)),
      }),
      'GAME_OVER',
    );
    await rejectsWith(t.mutation(api.games.resign, { gameId, callerId: ALICE }), 'GAME_OVER');
    await rejectsWith(t.mutation(api.games.resign, { gameId, callerId: 'eve' }), 'NOT_A_PLAYER');
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
    await t.mutation(api.games.makeMove, {
      gameId,
      callerId: BOB,
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
      t.mutation(api.games.answer, { ...call, callerId: BOB, choice: 'playOn' }),
      'NOT_YOUR_TURN',
    );
    await rejectsWith(
      t.mutation(api.games.answer, { ...call, callerId: ALICE, choice: 'maybe' }),
      'ILLEGAL_ACTION',
    );
    await rejectsWith(
      t.mutation(api.games.makeMove, { ...call, callerId: ALICE, moves: [] }),
      'ILLEGAL_ACTION',
    );

    await t.mutation(api.games.answer, { ...call, callerId: ALICE, choice: 'playOn' });
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
      t.mutation(api.games.answer, { ...call, callerId: ALICE, choice: 'playOn' }),
      'STALE_VERSION',
    );
  });

  it('"resign" gives the game to the opponent (double, 2 points)', async () => {
    const t = setup();
    const gameId = await pinTheMother(t);
    const v = await view(t, gameId);
    await t.mutation(api.games.answer, {
      gameId,
      callerId: ALICE,
      expectedVersion: v.version,
      choice: 'resign',
    });
    const after = await view(t, gameId);
    expect(after.status).toBe('finished');
    expect(after.match.winner).toBe('black');
    expect(after.match.score).toEqual({ white: 0, black: 2 });
  });
});
