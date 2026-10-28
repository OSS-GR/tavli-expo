// The call checks that the Convex functions and the in-memory server share.

import { describe, expect, it } from 'vitest';

import { TURN_TIME_MS } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';

import {
  SERVER_ACTOR,
  TIMED_OUT_ERROR,
  callTimedOut,
  checkCall,
  checkNewGame,
  checkViewer,
  eventActor,
  matchStatus,
  nextDeadline,
  scheduledCheck,
} from './calls';
import { OnlineGameError, createOnlineMatch, resign } from './online-game';

const PLAYERS = { white: 'alice', black: 'bob' };
const GAME = { players: PLAYERS, version: 3, status: 'active', turnDeadline: 1000 } as const;

function code(step: () => unknown): string {
  try {
    step();
  } catch (error) {
    if (error instanceof OnlineGameError) return error.code;
    throw error;
  }
  throw new Error('no error');
}

describe('checkNewGame', () => {
  it('accepts a caller who is one of two players', () => {
    expect(() => checkNewGame('alice', PLAYERS)).not.toThrow();
    expect(() => checkNewGame('bob', PLAYERS)).not.toThrow();
  });

  it('rejects a caller who is not a player, and the id of the server', () => {
    expect(code(() => checkNewGame('eve', PLAYERS))).toBe('BAD_REQUEST');
    expect(code(() => checkNewGame('alice', { white: 'alice', black: SERVER_ACTOR }))).toBe(
      'BAD_REQUEST',
    );
  });
});

describe('checkCall', () => {
  it('returns the game and the side of the caller', () => {
    expect(checkCall(GAME, 'alice', 3)).toEqual({ game: GAME, side: 'white' });
    expect(checkCall(GAME, 'bob', null).side).toBe('black');
  });

  it('checks the game, then the caller, then the version', () => {
    expect(code(() => checkCall(null, 'alice', 3))).toBe('NOT_FOUND');
    expect(code(() => checkCall(GAME, 'eve', 2))).toBe('NOT_A_PLAYER');
    expect(code(() => checkCall(GAME, 'alice', 2))).toBe('STALE_VERSION');
    expect(code(() => checkCall(GAME, 'alice', 4))).toBe('STALE_VERSION');
  });
});

describe('checkViewer (#131)', () => {
  it('lets the two players watch, and gives null for a missing game', () => {
    expect(checkViewer(GAME, 'alice')).toBe(GAME);
    expect(checkViewer(GAME, 'bob')).toBe(GAME);
    expect(checkViewer(null, 'eve')).toBeNull();
  });

  it('rejects a stranger with NOT_A_PLAYER', () => {
    expect(code(() => checkViewer(GAME, 'eve'))).toBe('NOT_A_PLAYER');
    expect(code(() => checkViewer(GAME, SERVER_ACTOR))).toBe('NOT_A_PLAYER');
  });
});

describe('turn deadline checks', () => {
  it('callTimedOut: an active game at or after its deadline', () => {
    expect(callTimedOut(GAME, 999)).toBe(false);
    expect(callTimedOut(GAME, 1000)).toBe(true);
    expect(callTimedOut({ ...GAME, status: 'finished' }, 5000)).toBe(false);
    expect(callTimedOut({ ...GAME, turnDeadline: null }, 5000)).toBe(false);
    expect(TIMED_OUT_ERROR.code).toBe('TIMED_OUT');
  });

  it('scheduledCheck: skips a changed or finished game, waits when early', () => {
    expect(scheduledCheck(GAME, 3, 1000)).toBe('due');
    expect(scheduledCheck(GAME, 3, 999)).toBe('early');
    expect(scheduledCheck(GAME, 2, 1000)).toBe('skip');
    expect(scheduledCheck(null, 3, 1000)).toBe('skip');
    expect(scheduledCheck({ ...GAME, status: 'finished' }, 3, 1000)).toBe('skip');
    expect(scheduledCheck({ ...GAME, turnDeadline: null }, 3, 1000)).toBe('skip');
  });

  it('nextDeadline: a full turn time, or no clock once the match is over', () => {
    const rng = createSeededRng(1);
    const flow = createOnlineMatch({ choice: 'portes', targetPoints: 1, players: PLAYERS }, rng);
    expect(matchStatus(flow)).toBe('active');
    expect(nextDeadline('live', flow, 10)).toBe(10 + TURN_TIME_MS.live);
    expect(nextDeadline('async', flow, 10)).toBe(10 + TURN_TIME_MS.async);
    const done = resign(flow, 'white', rng);
    expect(matchStatus(done)).toBe('finished');
    expect(nextDeadline('live', done, 10)).toBeNull();
  });
});

describe('eventActor', () => {
  it('marks server steps with the server id, and player steps with the caller', () => {
    expect(eventActor({ type: 'roll', player: 'white' }, 'alice')).toBe(SERVER_ACTOR);
    expect(eventActor({ type: 'timeout', player: 'white' }, 'alice')).toBe(SERVER_ACTOR);
    expect(eventActor({ type: 'nextGame' }, 'alice')).toBe(SERVER_ACTOR);
    expect(eventActor({ type: 'confirm', player: 'white' }, 'alice')).toBe('alice');
    expect(eventActor({ type: 'resignMatch', player: 'black' }, 'bob')).toBe('bob');
  });
});
