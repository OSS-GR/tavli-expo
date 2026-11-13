// Play ranked (#529, ADR-0009): two time outs in a row by the same player
// lose the match. One test per numbered case (edge cases 32 to 38 of
// docs/rules/tavli-match.md), and the parts around it. The
// steps are saved and loaded like a server does (`storeStep`, `loadStored`).

import { describe, expect, it } from 'vitest';

import { RANKED_TIMEOUTS_TO_LOSE, RANKED_TURN_TIME_MINUTES } from '@tavli/contracts';
import { createSeededRng, opponent, replay } from '@tavli/engine';
import type { FlowEvent, PlayerId, Rng } from '@tavli/engine';

import { checkRankedGame } from './calls';
import {
  NO_TIMEOUTS,
  OnlineGameError,
  createOnlineMatch,
  loadStored,
  losesRankedMatch,
  matchEndReason,
  playTurn,
  resign,
  rollDice,
  storeFlow,
  storeStep,
  timeOut,
  toView,
  waitingFor,
} from './online-game';
import type { LoadedFlow, SteppedFlow } from './online-game';
import { closedOut, openFlow, pickTurn } from './testing';

const PLAYERS = { white: 'alice', black: 'bob' };

/** A match as a server holds it, and every event so far. */
interface Run {
  loaded: LoadedFlow;
  readonly rng: Rng;
  readonly ranked: boolean;
  readonly events: FlowEvent[];
}

/** A new match. `open`: both opening dice rolled, the first turn waits. */
function start(ranked: boolean, options: { seed?: number; open?: boolean; target?: number } = {}) {
  const { seed = 1, open = true, target = 5 } = options;
  const rng = createSeededRng(seed);
  const created = createOnlineMatch(
    { choice: 'portes', targetPoints: target, players: PLAYERS },
    rng,
  );
  const flow = open ? openFlow(created, rng) : created;
  const run: Run = {
    loaded: loadStored(storeFlow(flow, null)),
    rng,
    ranked,
    events: [...flow.log],
  };
  return run;
}

/** Saves a step like a server: `storeStep`, then load it again. */
function save(run: Run, next: SteppedFlow): void {
  run.events.push(...next.log);
  run.loaded = loadStored(storeStep(run.loaded, next));
}

function waiting(run: Run): PlayerId {
  const side = waitingFor(run.loaded.flow);
  if (side === null) throw new Error('the match is over');
  return side;
}

/** The side the server waits for runs out of time (the server's `timeOut`). */
function timesOut(run: Run): PlayerId {
  const late = waiting(run);
  const { ranked, loaded } = run;
  save(run, timeOut(loaded.flow, run.rng, { ranked, timeoutsInARow: loaded.timeoutsInARow }));
  return late;
}

/** The side the server waits for rolls; returns true when it must now move that roll. */
function rolls(run: Run): boolean {
  const side = waiting(run);
  save(run, rollDice(run.loaded.flow, side, run.rng));
  return run.loaded.flow.game.phase === 'moving' && waitingFor(run.loaded.flow) === side;
}

/** The side the server waits for plays one turn in time: a roll, then its moves (or a pass). */
function playsTurn(run: Run): PlayerId {
  const side = waiting(run);
  if (run.loaded.flow.game.phase === 'awaiting-roll' && !rolls(run)) return side;
  const { flow } = run.loaded;
  save(run, playTurn(flow, side, pickTurn(flow.game, run.rng), run.rng));
  return side;
}

/** The other side plays turns until the server waits for `side`. */
function untilWaitingFor(run: Run, side: PlayerId): void {
  for (let i = 0; i < 50 && waiting(run) !== side; i++) playsTurn(run);
  if (waiting(run) !== side) throw new Error(`still waiting for ${waiting(run)}`);
}

function viewOf(run: Run) {
  const { flow, previousGame, timeoutsInARow } = run.loaded;
  return toView({
    gameId: 'g',
    version: 1,
    choice: 'portes',
    turnTimeMinutes: RANKED_TURN_TIME_MINUTES,
    ranked: run.ranked,
    turnDeadline: 1000,
    players: PLAYERS,
    names: { white: null, black: null },
    flow,
    previousGame,
    timeoutsInARow,
  });
}

/** Checks the end of a ranked match lost on time outs in a row by `late`. */
function expectLostOnTime(run: Run, late: PlayerId): void {
  const { match } = run.loaded.flow;
  expect(match.status).toBe('finished');
  expect(match.winner).toBe(opponent(late));
  expect(match.resignedBy).toBe(late);
  expect(run.loaded.timeoutsInARow[late]).toBe(RANKED_TIMEOUTS_TO_LOSE);
  const view = viewOf(run);
  expect(view.status).toBe('finished');
  expect(view.matchEndReason).toBe('timeouts-in-a-row');
  expect(view.waitingFor).toBeNull();
  expect(view.turnDeadline).toBeNull();
  // The whole log replays: the engine's own actions, no special event.
  expect(replay(run.events).match).toEqual(match);
}

describe('Play ranked: time outs in a row (#529)', () => {
  it('tavli-match.md #32: a time out ends the game, so two time outs never fall in one game', () => {
    const run = start(true);
    const late = timesOut(run);
    const { match, game } = run.loaded.flow;
    // The game is lost for 1 point and the next game starts: the match goes on.
    expect(match.games).toHaveLength(1);
    expect(match.games[0]).toMatchObject({ winner: opponent(late), points: 1, reason: 'timeout' });
    expect(match.status).toBe('in-progress');
    expect(game.phase).not.toBe('game-over');
    expect(run.loaded.timeoutsInARow[late]).toBe(1);
    expect(viewOf(run).matchEndReason).toBeNull();
    // The next time out of that player falls in the next game, and ends the match.
    untilWaitingFor(run, late);
    expect(timesOut(run)).toBe(late);
    expect(run.loaded.flow.match.games).toHaveLength(2);
    expectLostOnTime(run, late);
  });

  it('tavli-match.md #33: a time out ends one game, a time out on the first turn of the next game: the match is lost', () => {
    const run = start(true);
    const late = timesOut(run);
    untilWaitingFor(run, late);
    // `late` has played no turn in the new game yet: this is their first.
    expect(run.loaded.flow.game.lastTurn?.player ?? opponent(late)).toBe(opponent(late));
    timesOut(run);
    expectLostOnTime(run, late);
    // The score keeps both lost games; the resign adds nothing (the game was over).
    expect(run.loaded.flow.match.score[opponent(late)]).toBe(2);
    expect(run.loaded.flow.match.score[late]).toBe(0);
  });

  it('tavli-match.md #34: a played turn between two time outs: no match loss', () => {
    const run = start(true);
    const late = timesOut(run);
    untilWaitingFor(run, late);
    expect(playsTurn(run)).toBe(late);
    expect(run.loaded.timeoutsInARow[late]).toBe(0);
    untilWaitingFor(run, late);
    timesOut(run);
    const { match } = run.loaded.flow;
    expect(match.status).toBe('in-progress');
    expect(match.resignedBy).toBeNull();
    expect(match.games.filter((game) => game.reason === 'timeout')).toHaveLength(2);
    expect(run.loaded.timeoutsInARow[late]).toBe(1);
  });

  it('tavli-match.md #34: a pass is a played turn too', () => {
    const run = start(true);
    // White timed out once before, and now waits to roll with no legal move.
    run.loaded = {
      flow: closedOut(run.loaded.flow, 'white'),
      previousGame: null,
      timeoutsInARow: { white: 1, black: 0 },
    };
    expect(rolls(run)).toBe(false);
    expect(run.loaded.timeoutsInARow.white).toBe(0);
  });

  it('tavli-match.md #34: a roll the player can still play is not a played turn', () => {
    const run = start(true);
    const late = timesOut(run);
    untilWaitingFor(run, late);
    // The next game starts from the opening position: every roll can be played.
    expect(rolls(run)).toBe(true);
    expect(run.loaded.timeoutsInARow[late]).toBe(1);
    timesOut(run);
    expectLostOnTime(run, late);
  });

  it('tavli-match.md #35: a time out in the opening roll counts as a turn', () => {
    const run = start(true, { open: false });
    // Black rolls their opening die; White never rolls.
    save(run, rollDice(run.loaded.flow, 'black', run.rng));
    expect(timesOut(run)).toBe('white');
    expect(run.loaded.flow.match.games[0]).toMatchObject({ winner: 'black', reason: 'timeout' });
    expect(run.loaded.timeoutsInARow).toEqual({ white: 1, black: 0 });
    untilWaitingFor(run, 'white');
    timesOut(run);
    expectLostOnTime(run, 'white');
  });

  it("tavli-match.md #35: rolling your opening die is a played turn; nobody rolling is nobody's time out", () => {
    const run = start(true, { open: false });
    run.loaded = { ...run.loaded, timeoutsInARow: { white: 1, black: 1 } };
    save(run, rollDice(run.loaded.flow, 'white', run.rng));
    expect(run.loaded.timeoutsInARow).toEqual({ white: 0, black: 1 });
    // Neither rolled: the server rolls both, and no count moves.
    const quiet = start(true, { open: false });
    timesOut(quiet);
    expect(quiet.loaded.flow.match.games).toEqual([]);
    expect(quiet.loaded.timeoutsInARow).toEqual(NO_TIMEOUTS);
  });

  it('tavli-match.md #36: not ranked: two time outs in a row never end the match', () => {
    const run = start(false);
    const late = timesOut(run);
    untilWaitingFor(run, late);
    timesOut(run);
    untilWaitingFor(run, late);
    timesOut(run);
    const { match } = run.loaded.flow;
    expect(match.status).toBe('in-progress');
    expect(match.resignedBy).toBeNull();
    expect(match.score[opponent(late)]).toBe(3);
    expect(run.loaded.timeoutsInARow[late]).toBe(3);
    expect(viewOf(run).matchEndReason).toBeNull();
  });

  it('tavli-match.md #37: the time outs of the two players count apart', () => {
    const run = start(true);
    const first = timesOut(run);
    untilWaitingFor(run, opponent(first));
    timesOut(run);
    expect(run.loaded.timeoutsInARow).toEqual({ white: 1, black: 1 });
    expect(run.loaded.flow.match.status).toBe('in-progress');
  });

  it('tavli-match.md #38: when the second time out already reaches the match length, the match ends on points', () => {
    const run = start(true, { target: 2 });
    const late = timesOut(run);
    untilWaitingFor(run, late);
    timesOut(run);
    const { match } = run.loaded.flow;
    expect(match).toMatchObject({ status: 'finished', winner: opponent(late), resignedBy: null });
    expect(viewOf(run).matchEndReason).toBe('points');
  });
});

describe('losesRankedMatch', () => {
  it('only a ranked game, and only the second time out in a row', () => {
    expect(
      losesRankedMatch({ ranked: true, timeoutsInARow: { white: 1, black: 0 } }, 'white'),
    ).toBe(true);
    expect(
      losesRankedMatch({ ranked: true, timeoutsInARow: { white: 1, black: 0 } }, 'black'),
    ).toBe(false);
    expect(
      losesRankedMatch({ ranked: false, timeoutsInARow: { white: 1, black: 0 } }, 'white'),
    ).toBe(false);
    expect(losesRankedMatch({}, 'white')).toBe(false);
  });
});

describe('matchEndReason', () => {
  it('is null while the match runs, points or resigned after', () => {
    const run = start(true);
    expect(matchEndReason(run.loaded.flow, true, NO_TIMEOUTS)).toBeNull();
    const resigned = resign(run.loaded.flow, 'white', run.rng);
    expect(matchEndReason(resigned, true, { white: 1, black: 0 })).toBe('resigned');
    expect(matchEndReason(resigned, false, { white: 2, black: 0 })).toBe('resigned');
    expect(matchEndReason(resigned, true, { white: 2, black: 0 })).toBe('timeouts-in-a-row');
    const won = start(false, { target: 1 });
    timesOut(won);
    expect(matchEndReason(won.loaded.flow, false, won.loaded.timeoutsInARow)).toBe('points');
  });
});

describe('the stored counts', () => {
  it('a flow with no time outs stores no counts; an old flow reads as none', () => {
    const run = start(true);
    expect(storeFlow(run.loaded.flow, null)).not.toContain('timeoutsInARow');
    timesOut(run);
    const text = storeFlow(run.loaded.flow, null, run.loaded.timeoutsInARow);
    expect(text).toContain('timeoutsInARow');
    expect(loadStored(text).timeoutsInARow).toEqual(run.loaded.timeoutsInARow);
  });
});

describe('checkRankedGame', () => {
  it(`a ranked game has ${RANKED_TURN_TIME_MINUTES} minutes per turn; a friend game any time`, () => {
    expect(() => checkRankedGame(true, RANKED_TURN_TIME_MINUTES)).not.toThrow();
    expect(() => checkRankedGame(false, null)).not.toThrow();
    expect(() => checkRankedGame(false, 7)).not.toThrow();
    for (const minutes of [null, 1, 3]) {
      expect(() => checkRankedGame(true, minutes)).toThrow(OnlineGameError);
    }
  });
});
