// The call checks that the Convex functions and the in-memory server share.

import { describe, expect, it } from 'vitest';

import { ASYNC_TURN_TIME_MS } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';

import {
  SERVER_ACTOR,
  TIMED_OUT_ERROR,
  callTimedOut,
  checkCall,
  checkNewGame,
  checkTurnTimeMinutes,
  checkViewer,
  eventActor,
  matchStatus,
  nextDeadline,
  nextDraft,
  rollCallVersion,
  rollDeadline,
  scheduledCheck,
} from './calls';
import { OnlineGameError, createOnlineMatch, resign, rollDice } from './online-game';
import { closedOut, openFlow, pickTurn } from './testing';

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

/** A new Portes match, and the same with its opening rolled (as stored: no log). */
function opened() {
  const rng = createSeededRng(1);
  const created = createOnlineMatch({ choice: 'portes', targetPoints: 1, players: PLAYERS }, rng);
  return { match: { ...openFlow(created, rng), log: [] }, created, rng };
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

describe('checkTurnTimeMinutes', () => {
  it('accepts null (the 24-hour default) and whole minutes of 1 or more', () => {
    expect(() => checkTurnTimeMinutes(null)).not.toThrow();
    expect(() => checkTurnTimeMinutes(1)).not.toThrow();
    expect(() => checkTurnTimeMinutes(60)).not.toThrow();
  });

  it('rejects 0, negative and fractional minutes', () => {
    expect(code(() => checkTurnTimeMinutes(0))).toBe('BAD_REQUEST');
    expect(code(() => checkTurnTimeMinutes(-5))).toBe('BAD_REQUEST');
    expect(code(() => checkTurnTimeMinutes(1.5))).toBe('BAD_REQUEST');
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
    expect(nextDeadline(1, flow, 10)).toBe(10 + 60_000);
    expect(nextDeadline(null, flow, 10)).toBe(10 + ASYNC_TURN_TIME_MS);
    const done = resign(flow, 'white', rng);
    expect(matchStatus(done)).toBe('finished');
    expect(nextDeadline(1, done, 10)).toBeNull();
  });

  it('rollDeadline: a roll keeps the turn deadline; a pass starts a new turn time (#355)', () => {
    const { match, rng } = opened();
    // The server still waits for the roller (a roll they can play).
    const roller = match.game.state.toMove;
    expect(rollDeadline(GAME, 1, roller, match, 10)).toBe(1000);
    // A roll with no legal move: the wait moves to Black, who gets a full turn.
    const passed = rollDice(closedOut(match), 'white', rng);
    expect(rollDeadline(GAME, 1, 'white', passed, 10)).toBe(10 + 60_000);
    expect(rollDeadline(GAME, null, 'white', passed, 10)).toBe(10 + ASYNC_TURN_TIME_MS);
    // No deadline saved before: a full turn time.
    expect(rollDeadline({ ...GAME, turnDeadline: null }, 1, roller, match, 10)).toBe(10 + 60_000);
  });

  it('rollDeadline in the opening (#379): the first die keeps it; a tie or the start gets a new one', () => {
    const { created } = opened();
    const die = (value: number) => ({ nextUint32: () => value - 1 });
    const first = rollDice(created, 'white', die(3));
    expect(rollDeadline(GAME, 1, 'white', first, 10)).toBe(1000);
    const tie = rollDice({ ...first, log: [] }, 'black', die(3));
    expect(tie.game.phase).toBe('opening-roll');
    expect(rollDeadline(GAME, 1, 'black', tie, 10)).toBe(10 + 60_000);
    const started = rollDice({ ...first, log: [] }, 'black', die(5));
    expect(started.game.phase).toBe('moving');
    expect(rollDeadline(GAME, 1, 'black', started, 10)).toBe(10 + 60_000);
  });

  it('rollCallVersion (#379): no version check in the opening of a running match', () => {
    const { match, created } = opened();
    expect(rollCallVersion(created, 4)).toBeNull();
    expect(rollCallVersion(match, 4)).toBe(4);
    expect(rollCallVersion(resign(created, 'white', createSeededRng(2)), 4)).toBe(4);
  });
});

describe('eventActor', () => {
  it('marks server steps with the server id, and player steps with the caller', () => {
    expect(eventActor({ type: 'rollOpening', player: 'white' }, 'alice')).toBe(SERVER_ACTOR);
    expect(eventActor({ type: 'timeout', player: 'white' }, 'alice')).toBe(SERVER_ACTOR);
    // The player asks for each roll (#355), so the roll is the player's step.
    expect(eventActor({ type: 'roll', player: 'white' }, 'alice')).toBe('alice');
    expect(eventActor({ type: 'nextGame' }, 'alice')).toBe(SERVER_ACTOR);
    expect(eventActor({ type: 'confirm', player: 'white' }, 'alice')).toBe('alice');
    expect(eventActor({ type: 'resignMatch', player: 'black' }, 'bob')).toBe('bob');
  });
});

describe('nextDraft (#374)', () => {
  function moving() {
    const flow = opened().match;
    const side = flow.game.state.toMove;
    const moves = pickTurn(flow.game, createSeededRng(9));
    return { flow, side, moves };
  }

  it('numbers the drafts of one version from 1, and starts again at a new version', () => {
    const { flow, side, moves } = moving();
    const first = nextDraft(GAME, flow, side, moves.slice(0, 1), null, 0);
    expect(first).toEqual({ version: 3, seq: 1, moves: moves.slice(0, 1) });
    const second = nextDraft(GAME, flow, side, [], first, 0);
    expect(second).toEqual({ version: 3, seq: 2, moves: [] });
    expect(nextDraft({ ...GAME, version: 4 }, flow, side, [], second, 0).seq).toBe(1);
  });

  it('rejects a late draft with TIMED_OUT, and checks the moves', () => {
    const { flow, side, moves } = moving();
    expect(code(() => nextDraft(GAME, flow, side, [], null, 1000))).toBe('TIMED_OUT');
    expect(code(() => nextDraft(GAME, flow, side, [...moves, ...moves], null, 0))).toBe(
      'ILLEGAL_MOVE',
    );
  });
});
