// The pure online game logic, with a seeded RNG (tests only; the Convex
// server always uses `createCryptoRng`).

import { describe, expect, it } from 'vitest';

import { ONLINE_GAME_CHOICES } from '@tavli/contracts';
import type { OnlineGameChoice } from '@tavli/contracts';
import { createSeededRng, getPreset, matchPhase, replay } from '@tavli/engine';
import type { FlowEvent, MatchFlow, Rng } from '@tavli/engine';

import {
  OnlineGameError,
  answerPrompt,
  createOnlineMatch,
  deadlineAfter,
  isTimedOut,
  loadFlow,
  loadStored,
  onlineGameRules,
  playTurn,
  resign,
  sideOf,
  storeFlow,
  storeStep,
  timeOut,
  toView,
  waitingFor,
} from './online-game';
import { lastBearOff, pickChoice, pickTurn } from './testing';

const PLAYERS = { white: 'alice', black: 'bob' };

/** The view fields these tests do not care about. */
const VIEW = {
  gameId: 'g',
  version: 1,
  pace: 'live',
  turnDeadline: 1000,
  players: PLAYERS,
  previousGame: null,
} as const;

function create(choice: OnlineGameChoice = 'portes', seed = 1, targetPoints = 1) {
  const rng = createSeededRng(seed);
  const flow = createOnlineMatch({ choice, targetPoints, players: PLAYERS }, rng);
  return { flow, rng };
}

/** Like the server: start from the stored flow with an empty log. */
function stored(flow: MatchFlow): MatchFlow {
  return loadFlow(storeFlow(flow, null));
}

function code(step: () => unknown): string {
  try {
    step();
  } catch (error) {
    if (error instanceof OnlineGameError) return error.code;
    throw error;
  }
  throw new Error('no error');
}

/** Plays a whole match with random legal turns and answers. Returns every event. */
function playMatch(choice: OnlineGameChoice, seed: number, targetPoints: number) {
  const { flow: first, rng } = create(choice, seed, targetPoints);
  const picker = createSeededRng(seed + 1000);
  const events: FlowEvent[] = [...first.log];
  let flow = first;
  for (let i = 0; i < 5000 && flow.match.status !== 'finished'; i++) {
    const side = waitingFor(flow);
    if (side === null) throw new Error('nobody to wait for');
    const view = toView({ ...VIEW, version: i, choice, flow });
    flow =
      view.prompt === null
        ? playTurn(stored(flow), side, pickTurn(flow.game, picker), rng)
        : answerPrompt(stored(flow), side, pickChoice(view.prompt.choices, picker), rng);
    events.push(...flow.log);
  }
  return { flow, events };
}

describe('onlineGameRules', () => {
  it('a single game plays only that game', () => {
    for (const choice of ['portes', 'plakoto', 'fevga', 'asodio'] as const) {
      expect(onlineGameRules(choice).match.rotation).toEqual([choice]);
    }
  });

  it('tavli keeps the Portes → Plakoto → Fevga rotation', () => {
    expect(onlineGameRules('tavli').match.rotation).toEqual(getPreset('tavli').match.rotation);
    expect(onlineGameRules('tavli').match.rotation).toEqual(['portes', 'plakoto', 'fevga']);
  });

  it('every choice has an opening roll (no chosen starter)', () => {
    for (const choice of ONLINE_GAME_CHOICES) {
      expect(onlineGameRules(choice).match.openingRoll).not.toBe('chosenStarterRolls');
    }
  });
});

describe('createOnlineMatch', () => {
  it('rolls the opening on the server and waits for the first player', () => {
    const { flow } = create();
    expect(flow.game.phase).toBe('moving');
    expect(flow.game.starter).not.toBeNull();
    expect(flow.log[0]?.type).toBe('start');
    expect(flow.log.filter((e) => e.type === 'rollOpening').length).toBeGreaterThanOrEqual(2);
    expect(waitingFor(flow)).toBe(flow.game.state.toMove);
    expect(flow.match.players).toEqual(PLAYERS);
  });

  it('rejects the same player on both sides', () => {
    const rng = createSeededRng(1);
    expect(
      code(() =>
        createOnlineMatch(
          { choice: 'portes', targetPoints: 1, players: { white: 'x', black: 'x' } },
          rng,
        ),
      ),
    ).toBe('BAD_REQUEST');
  });

  it('rejects a bad match length', () => {
    const rng = createSeededRng(1);
    const options = { choice: 'portes' as const, targetPoints: 0, players: PLAYERS };
    expect(code(() => createOnlineMatch(options, rng))).toBe('ILLEGAL_ACTION');
  });

  it('draws random numbers only for dice it rolls now (no dice ahead)', () => {
    const seeded = createSeededRng(3);
    let calls = 0;
    const counting: Rng = {
      nextUint32() {
        calls += 1;
        return seeded.nextUint32();
      },
    };
    const flow = createOnlineMatch(
      { choice: 'portes', targetPoints: 1, players: PLAYERS },
      counting,
    );
    const dice = flow.log.reduce(
      (n, e) => n + (e.type === 'rollOpening' ? 1 : e.type === 'roll' ? 2 : 0),
      0,
    );
    expect(calls).toBe(dice);
  });
});

describe('playTurn', () => {
  it('plays a full turn, then the server rolls for the other player', () => {
    const { flow, rng } = create();
    const side = flow.game.state.toMove;
    const moves = pickTurn(flow.game, createSeededRng(9));
    const next = playTurn(stored(flow), side, moves, rng);
    const types = next.log.map((e) => e.type);
    expect(types.slice(0, moves.length + 1)).toEqual([...moves.map(() => 'move'), 'confirm']);
    expect(types).toContain('roll');
    expect(next.game.lastTurn?.player).toBe(side);
    expect(next.game.played).toEqual([]);
  });

  it('rejects the player who is not to move', () => {
    const { flow, rng } = create();
    const other = flow.game.state.toMove === 'white' ? 'black' : 'white';
    const moves = pickTurn(flow.game, createSeededRng(9));
    expect(code(() => playTurn(flow, other, moves, rng))).toBe('NOT_YOUR_TURN');
  });

  it('rejects an illegal move and an incomplete turn', () => {
    const { flow, rng } = create();
    const side = flow.game.state.toMove;
    const moves = pickTurn(flow.game, createSeededRng(9));
    // Point 1 is empty at the start of Portes for the mover.
    expect(code(() => playTurn(flow, side, [{ from: 1, to: 'off', die: 1 }], rng))).toBe(
      'ILLEGAL_MOVE',
    );
    expect(code(() => playTurn(flow, side, moves.slice(0, 1), rng))).toBe('ILLEGAL_MOVE');
    expect(code(() => playTurn(flow, side, [], rng))).toBe('ILLEGAL_MOVE');
    expect(code(() => playTurn(flow, side, [...moves, ...moves], rng))).toBe('ILLEGAL_ACTION');
  });
});

describe('resign', () => {
  it('ends the match; the opponent wins', () => {
    const { flow, rng } = create('portes', 1, 5);
    const done = resign(stored(flow), 'white', rng);
    expect(matchPhase(done)).toBe('match-over');
    expect(done.match.winner).toBe('black');
    expect(waitingFor(done)).toBeNull();
    expect(done.log).toEqual([{ type: 'resignMatch', player: 'white' }]);
    expect(code(() => resign(done, 'black', rng))).toBe('GAME_OVER');
    expect(code(() => playTurn(done, 'black', [], rng))).toBe('GAME_OVER');
  });
});

describe('turn timers (#133)', () => {
  it('a turn lasts 1 minute live and 24 hours async; at the deadline the time is up', () => {
    expect(deadlineAfter('live', 5000)).toBe(5000 + 60_000);
    expect(deadlineAfter('async', 5000)).toBe(5000 + 24 * 60 * 60 * 1000);
    expect(isTimedOut(10_000, 9_999)).toBe(false);
    expect(isTimedOut(10_000, 10_000)).toBe(true);
    expect(isTimedOut(null, 10_000)).toBe(false);
  });

  it('timeOut: the player to move loses the game; the next game starts', () => {
    const { flow, rng } = create('portes', 3, 5);
    const late = waitingFor(flow);
    if (late === null) throw new Error('nobody to wait for');
    const next = timeOut(stored(flow), rng);
    expect(next.match.games).toHaveLength(1);
    expect(next.match.games[0]).toMatchObject({ winner: late === 'white' ? 'black' : 'white' });
    expect(next.match.games[0]?.reason).toBe('timeout');
    expect(next.log[0]).toEqual({ type: 'timeout', player: late });
    expect(next.log.map((e) => e.type)).toContain('nextGame');
    expect(next.game.phase).toBe('moving');
    expect(next.match.status).toBe('in-progress');
  });

  it('timeOut: the match ends when that game reaches the target', () => {
    const { flow, rng } = create('portes', 3, 1);
    const done = timeOut(stored(flow), rng);
    expect(done.match.status).toBe('finished');
    expect(waitingFor(done)).toBeNull();
    expect(toView({ ...VIEW, choice: 'portes', flow: done }).turnDeadline).toBeNull();
    expect(code(() => timeOut(done, rng))).toBe('GAME_OVER');
  });
});

describe('answerPrompt', () => {
  it('rejects an answer when there is no question', () => {
    const { flow, rng } = create();
    expect(code(() => answerPrompt(flow, flow.game.state.toMove, 'playOn', rng))).toBe(
      'ILLEGAL_ACTION',
    );
  });
});

describe('whole matches with server dice', () => {
  for (const choice of ONLINE_GAME_CHOICES) {
    it(`${choice}: plays to the end, and the log replays to the same flow`, () => {
      const { flow, events } = playMatch(choice, 11, choice === 'tavli' ? 3 : 1);
      expect(flow.match.status).toBe('finished');
      const again = replay(events);
      expect(again.match).toEqual(flow.match);
      expect(again.game).toEqual(flow.game);
      const view = toView({ ...VIEW, choice, flow });
      expect(view.status).toBe('finished');
      expect(view.waitingFor).toBeNull();
      expect(view.prompt).toBeNull();
    });
  }
});

describe('stored flow', () => {
  it('round-trips without the log', () => {
    const { flow } = create();
    const back = loadFlow(storeFlow(flow, null));
    expect(back.log).toEqual([]);
    expect(back.match).toEqual(flow.match);
    expect(back.game).toEqual(flow.game);
  });

  it('rejects an unknown schema version', () => {
    expect(() => loadStored(JSON.stringify({ schemaVersion: 99 }))).toThrow(/schema version/);
  });

  it('keeps the previous game apart from the flow; a flow saved before #299 has none', () => {
    const { flow } = create();
    const ended = lastBearOff(flow).game;
    const text = storeFlow(flow, ended);
    const loaded = loadStored(text);
    expect(loaded.previousGame).toEqual(ended);
    expect(loaded.flow).toEqual(loadFlow(storeFlow(flow, null)));
    expect(Object.keys(loaded.flow)).not.toContain('previousGame');
    const old = JSON.stringify({
      schemaVersion: flow.schemaVersion,
      match: flow.match,
      game: flow.game,
    });
    expect(loadStored(old)).toEqual({ flow: loaded.flow, previousGame: null });
  });

  it('saves no endedGame: it is a field of the step result only', () => {
    const { flow, rng } = create('portes', 1, 5);
    const before = loadStored(storeFlow(flow, null));
    const step = playTurn(before.flow, flow.game.state.toMove, pickTurn(flow.game, rng), rng);
    expect(step.endedGame).toBeNull();
    expect(Object.keys(JSON.parse(storeStep(before, step)) as object)).not.toContain('endedGame');
    expect(Object.keys(flow)).not.toContain('endedGame');
  });
});

describe('previousGame (#299)', () => {
  /** A 5-point Portes match where White's next turn bears off the last checkers. */
  function lastTurn() {
    const { flow, rng } = create('portes', 1, 5);
    const before = loadStored(storeFlow(lastBearOff(flow), null));
    const moves = pickTurn(before.flow.game, createSeededRng(9));
    return { before, moves, rng };
  }

  it('the turn that ends a game is kept as it ended; the next game starts', () => {
    const { before, moves, rng } = lastTurn();
    const next = playTurn(before.flow, 'white', moves, rng);
    expect(next.match.games).toHaveLength(1);
    expect(next.game.phase).toBe('moving');
    const ended = next.endedGame;
    expect(ended?.phase).toBe('game-over');
    expect(ended?.result).toMatchObject({ winner: 'white', points: 1 });
    expect(ended?.lastTurn?.player).toBe('white');
    expect(ended?.lastTurn?.moves).toEqual(moves);
    expect(ended?.state.board.off.white).toBe(15);
    const saved = loadStored(storeStep(before, next));
    expect(saved.previousGame).toEqual(ended);
    expect(saved.flow).toEqual(loadFlow(storeFlow(next, null)));
    const view = toView({ ...VIEW, choice: 'portes', ...saved });
    expect(view.previousGame).toEqual(ended);
  });

  it('stays through the next game until that game ends', () => {
    const { before, moves, rng } = lastTurn();
    const first = loadStored(storeStep(before, playTurn(before.flow, 'white', moves, rng)));
    const ended = first.previousGame;
    expect(ended?.phase).toBe('game-over');
    const step = playTurn(
      first.flow,
      first.flow.game.state.toMove,
      pickTurn(first.flow.game, rng),
      rng,
    );
    expect(step.endedGame).toBeNull();
    const late = loadStored(storeStep(first, step));
    expect(late.previousGame).toEqual(ended);
    // A time out ends the second game: it takes the place of the first.
    const second = loadStored(storeStep(late, timeOut(late.flow, rng))).previousGame;
    expect(second?.result?.reason).toBe('timeout');
    expect(second?.state.board).toEqual(late.flow.game.state.board);
    // A resign ends the match: no next game, so the stored one stays.
    const resigned = resign(late.flow, 'black', rng);
    expect(resigned.endedGame).toBeNull();
    expect(loadStored(storeStep(late, resigned)).previousGame).toEqual(ended);
  });

  it('a step that starts no next game keeps none: the first game, and the match end', () => {
    const { flow, rng } = create('portes', 1, 1);
    const text = loadStored(storeFlow(flow, null));
    const step = playTurn(text.flow, flow.game.state.toMove, pickTurn(flow.game, rng), rng);
    expect(loadStored(storeStep(text, step)).previousGame).toBeNull();
    // A 1-point match ends with the game: `game` is that game, no next game starts.
    const won = loadStored(storeFlow(lastBearOff(flow), null));
    const done = playTurn(won.flow, 'white', pickTurn(won.flow.game, rng), rng);
    expect(done.match.status).toBe('finished');
    expect(done.game.lastTurn?.player).toBe('white');
    expect(done.endedGame).toBeNull();
    expect(loadStored(storeStep(won, done)).previousGame).toBeNull();
  });
});

describe('sideOf', () => {
  it('maps a player id to a side', () => {
    expect(sideOf(PLAYERS, 'alice')).toBe('white');
    expect(sideOf(PLAYERS, 'bob')).toBe('black');
    expect(sideOf(PLAYERS, 'eve')).toBeNull();
  });
});
