import { describe, expect, it } from 'vitest';

import { createSeededRng, replay } from '@tavli/engine';
import type { FlowEvent, PlayerId } from '@tavli/engine';

import { gameRecordLog } from './game-record';
import { createMemoryGameServer } from './memory-server';
import type { MemoryGameServer } from './memory-server';
import { OnlineGameError } from './online-game';
import { openMemoryGame, pickChoice, pickTurn } from './testing';

const START = {
  type: 'start',
  rules: {},
  targetPoints: 3,
  players: { white: 'alice', black: 'bob' },
  starter: null,
} as unknown as FlowEvent;
const ROLL = { type: 'roll', player: 'white', dice: [3, 1] } as unknown as FlowEvent;
const CONFIRM: FlowEvent = { type: 'confirm', player: 'white' };
const NEXT: FlowEvent = { type: 'nextGame' };
/** Two games played, the third under way. */
const LOG: FlowEvent[] = [START, ROLL, CONFIRM, NEXT, ROLL, NEXT, ROLL];

function codeOf(work: () => unknown): string | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof OnlineGameError) return error.code;
    throw error;
  }
}

describe('gameRecordLog (#604)', () => {
  it('keeps the log up to the end of the game, with the sides in place of the player ids', () => {
    expect(gameRecordLog(LOG, 1, false)).toEqual([
      { ...START, players: { white: 'white', black: 'black' } },
      ROLL,
      CONFIRM,
    ]);
    expect(gameRecordLog(LOG, 2, false)).toHaveLength(5);
    // The log may stop at the event that ended the game.
    expect(gameRecordLog(LOG.slice(0, 4), 1, false)).toHaveLength(3);
  });

  it('never changes the log it reads', () => {
    gameRecordLog(LOG, 1, false);
    expect(LOG[0]).toMatchObject({ players: { white: 'alice', black: 'bob' } });
  });

  it('refuses the game in play and a game not played yet', () => {
    expect(codeOf(() => gameRecordLog(LOG, 3, false))).toBe('ILLEGAL_ACTION');
    expect(codeOf(() => gameRecordLog(LOG, 4, false))).toBe('ILLEGAL_ACTION');
    expect(codeOf(() => gameRecordLog(LOG, 4, true))).toBe('ILLEGAL_ACTION');
  });

  it('gives the last game once the match is over', () => {
    expect(gameRecordLog(LOG, 3, true)).toHaveLength(LOG.length);
  });

  it('refuses a game number that is not a whole number from 1', () => {
    for (const number of [0, -1, 1.5, Number.NaN]) {
      expect(codeOf(() => gameRecordLog(LOG, number, true))).toBe('BAD_REQUEST');
    }
  });
});

/** Plays the game the server waits for until the match is over, with random turns. */
async function playOut(server: MemoryGameServer, gameId: string, seed: number): Promise<void> {
  const rng = createSeededRng(seed);
  for (let i = 0; i < 5000; i++) {
    const view = server.getGame(gameId);
    if (view === null) throw new Error('no game');
    if (view.status === 'finished') return;
    const side: PlayerId | null = view.waitingFor;
    if (side === null) throw new Error('the server waits for nobody');
    const transport = server.transportFor(view.players[side]);
    const request = { gameId, expectedVersion: view.version };
    if (view.prompt !== null) {
      await transport.sendAnswer({ ...request, choice: pickChoice(view.prompt.choices, rng) });
    } else if (view.game.phase === 'moving') {
      await transport.sendTurn({ ...request, moves: pickTurn(view.game, rng) });
    } else {
      await transport.rollDice(request);
    }
  }
  throw new Error('the match did not end');
}

describe('the record on the in-memory server (#604)', () => {
  it('replays each game of a finished match to its end', async () => {
    const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => 0 });
    const players = { white: 'alice', black: 'bob' };
    const gameId = server.createGame('alice', players, 'tavli', 3, null);
    await openMemoryGame(server, gameId);
    await playOut(server, gameId, 9);
    const view = server.getGame(gameId);
    if (view === null) throw new Error('no game');
    const games = view.match.games;
    expect(games.length).toBeGreaterThan(1);
    for (const [i, ended] of games.entries()) {
      const record = await server.transportFor('bob').gameRecord({ gameId, gameNumber: i + 1 });
      expect(record.side).toBe('black');
      expect(record.choice).toBe('tavli');
      const flow = replay(record.log);
      // The match as it stood when that game ended.
      expect(flow.game.phase).toBe('game-over');
      expect(flow.match.games).toEqual(games.slice(0, i + 1));
      expect(flow.game.result?.winner).toBe(ended.winner);
      // No player id in it.
      expect(JSON.stringify(record)).not.toMatch(/alice|bob/);
    }
  });
});
