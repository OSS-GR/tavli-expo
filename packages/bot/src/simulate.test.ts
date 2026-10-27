import { describe, expect, it } from 'vitest';

import { formatTurn, portes } from '@tavli/engine';
import type { Turn } from '@tavli/engine';

import { createBot, playGame, simulate } from './index';
import type { Bot, SimulationPlayer } from './index';

const random: SimulationPlayer = { bot: createBot(), difficulty: 'random' };

describe('simulate', () => {
  it('plays 1,000 random-vs-random Portes games with no illegal turn', { timeout: 30_000 }, () => {
    let turns = 0;
    let passes = 0;
    const result = simulate({
      variant: portes,
      bots: [random, random],
      games: 1000,
      seed: 2026,
      onTurn: ({ turn }) => {
        turns += 1;
        if (turn.moves.length === 0) passes += 1;
      },
    });
    expect(result.failures).toEqual([]);
    expect(result.illegalTurns).toBe(0);
    expect(result.completed).toBe(1000);
    expect(result.wins[0] + result.wins[1] + result.draws).toBe(1000);
    expect(result.mono[0] + result.diplo[0]).toBe(result.wins[0]);
    expect(result.mono[1] + result.diplo[1]).toBe(result.wins[1]);
    expect(result.totalTurns).toBe(turns);
    expect(result.averageTurns).toBeGreaterThan(40);
    // Random play blocks itself sometimes, so passes happen.
    expect(passes).toBeGreaterThan(0);
    // Two equal bots: neither side wins far more often.
    expect(result.wins[0]).toBeGreaterThan(400);
    expect(result.wins[1]).toBeGreaterThan(400);
  });

  it('gives the same games for the same seed', () => {
    const record = (seed: number): string[] => {
      const log: string[] = [];
      simulate({
        variant: portes,
        bots: [random, random],
        games: 5,
        seed,
        onTurn: ({ game, state, turn }) => {
          log.push(`${game}:${state.dice?.join('-')}:${formatTurn(turn)}`);
        },
      });
      return log;
    };
    const first = record(77);
    expect(record(77)).toEqual(first);
    expect(record(78)).not.toEqual(first);
    const options = { variant: portes, bots: [random, random] as const, games: 20, seed: 5 };
    expect(simulate(options)).toEqual(simulate(options));
  });

  it('counts an illegal turn as a failure and keeps going', () => {
    // Always passes, which is illegal as soon as a move exists.
    const lazy: Bot = {
      chooseTurn: (state, dice): Turn => ({ player: state.toMove, dice, moves: [] }),
    };
    const result = simulate({
      variant: portes,
      bots: [random, { bot: lazy, difficulty: 'random' }],
      games: 3,
      seed: 1,
    });
    expect(result.completed).toBe(0);
    expect(result.illegalTurns).toBe(3);
    expect(result.failures[0]).toMatchObject({ game: 0, code: 'ILLEGAL_TURN' });
    // The seed in the failure replays the same game.
    const failure = result.failures[1];
    if (failure === undefined) throw new Error('missing failure');
    const replay = playGame(
      { variant: portes, bots: [random, { bot: lazy, difficulty: 'random' }], game: failure.game },
      failure.gameSeed,
    );
    expect(replay).toMatchObject({
      ok: false,
      code: 'ILLEGAL_TURN',
      turnNumber: failure.turnNumber,
    });
  });

  it('stops games that run too long, and reports bot errors', () => {
    const short = simulate({
      variant: portes,
      bots: [random, random],
      games: 2,
      seed: 1,
      maxTurns: 5,
    });
    expect(short.failures.map((f) => f.code)).toEqual(['TOO_LONG', 'TOO_LONG']);
    const notYet = simulate({
      variant: portes,
      bots: [random, { bot: createBot(), difficulty: 'hard' }],
      games: 1,
      seed: 1,
    });
    expect(notYet.failures[0]?.code).toBe('NOT_IMPLEMENTED');
    expect(notYet.illegalTurns).toBe(0);
    expect(notYet.averageTurns).toBe(0);
  });

  it('rejects a bad game count', () => {
    expect(() => simulate({ variant: portes, bots: [random, random], games: -1, seed: 1 })).toThrow(
      RangeError,
    );
  });
});
