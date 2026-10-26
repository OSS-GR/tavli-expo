import { describe, expect, it } from 'vitest';

import {
  EngineError,
  createBoard,
  createSeededRng,
  createVariantRegistry,
  formatTurn,
  pipCount,
  portes,
  sameTurn,
} from '@tavli/engine';
import type { Dice, GameState, Turn } from '@tavli/engine';

import { BotError, chooseRandomTurn, createBot } from './index';
import type { Evaluator, EvaluatorRegistry } from './index';

const start = portes.initialState({ startingPlayer: 'white' });

/** White has one checker on the bar and every entry point is a black door. */
const blocked: GameState = {
  ...start,
  board: createBoard(
    {
      white: { points: { 6: 14 }, bar: 1 },
      black: { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
    },
    'contrary',
  ),
};

/** Scores by the race: the side to move likes a lower pip count. */
const raceEvaluator: Evaluator = {
  id: 'test-race',
  variant: 'portes',
  evaluate(state) {
    const mine = pipCount(state.board, state.toMove, 'contrary');
    const theirs = pipCount(state.board, state.toMove === 'white' ? 'black' : 'white', 'contrary');
    const equity = (theirs - mine) / 100;
    return { win: 0.5 + equity / 4, winDouble: 0, loseDouble: 0, equity };
  },
};

function isLegal(state: GameState, dice: Dice, turn: Turn): boolean {
  return portes.legalTurns(state, dice).some((legal) => sameTurn(legal, turn));
}

describe('easy bot', () => {
  const bot = createBot();

  it('returns one of the legal turns', () => {
    const rng = createSeededRng(7);
    const dice: Dice = [3, 1];
    for (let i = 0; i < 50; i += 1) {
      const turn = bot.chooseTurn(start, dice, 'easy', { rng });
      expect(isLegal(start, dice, turn)).toBe(true);
    }
  });

  it('gives the same turn for the same seed', () => {
    const dice: Dice = [6, 6];
    const a = bot.chooseTurn(start, dice, 'easy', { rng: createSeededRng(42) });
    const b = bot.chooseTurn(start, dice, 'easy', { rng: createSeededRng(42) });
    expect(formatTurn(a)).toBe(formatTurn(b));
    const many = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        formatTurn(bot.chooseTurn(start, dice, 'easy', { rng: createSeededRng(seed) })),
      ),
    );
    expect(many.size).toBeGreaterThan(1);
  });

  it('picks every legal turn about equally often', () => {
    const dice: Dice = [3, 1];
    const legal = portes.legalTurns(start, dice);
    const rng = createSeededRng(1);
    const counts = new Map<string, number>();
    const draws = legal.length * 300;
    for (let i = 0; i < draws; i += 1) {
      const key = formatTurn(chooseRandomTurn(legal, rng));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(legal.length);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(200);
      expect(count).toBeLessThan(400);
    }
  });

  it('passes when no move is legal, and the engine accepts the pass', () => {
    const dice: Dice = [6, 5];
    const turn = bot.chooseTurn(blocked, dice, 'easy', { rng: createSeededRng(1) });
    expect(turn).toEqual({ player: 'white', dice, moves: [] });
    const next = portes.applyTurn({ ...blocked, dice }, turn);
    expect(next.toMove).toBe('black');
  });

  it('accepts a state with the same dice already set', () => {
    const dice: Dice = [4, 2];
    const turn = bot.chooseTurn({ ...start, dice }, dice, 'easy', { rng: createSeededRng(3) });
    expect(isLegal(start, dice, turn)).toBe(true);
  });

  it('rejects dice that differ from state.dice', () => {
    expect(() =>
      bot.chooseTurn({ ...start, dice: [4, 2] }, [5, 2], 'easy', { rng: createSeededRng(3) }),
    ).toThrow(expect.objectContaining({ name: 'BotError', code: 'INVALID_REQUEST' }));
  });

  it('lets engine errors through for a finished game and an unknown variant', () => {
    const over: GameState = {
      ...start,
      board: createBoard({ white: { off: 15 }, black: { points: { 6: 15 } } }, 'contrary'),
    };
    const rng = createSeededRng(1);
    expect(() => bot.chooseTurn(over, [1, 2], 'easy', { rng })).toThrow(EngineError);
    expect(() => bot.chooseTurn({ ...start, variant: 'nope' }, [1, 2], 'easy', { rng })).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_VARIANT' }),
    );
  });
});

describe('medium and hard', () => {
  it('throw NOT_IMPLEMENTED without an evaluator', () => {
    const bot = createBot();
    for (const level of ['medium', 'hard'] as const) {
      expect(() => bot.chooseTurn(start, [3, 1], level, { rng: createSeededRng(1) })).toThrow(
        expect.objectContaining({ name: 'BotError', code: 'NOT_IMPLEMENTED' }),
      );
    }
  });

  it('plug in through the evaluator registry and pick the best turn (1-ply)', () => {
    const evaluators: EvaluatorRegistry = new Map([['portes', { medium: raceEvaluator }]]);
    const bot = createBot({ evaluators });
    const dice: Dice = [6, 5];
    const rolled = { ...start, dice };
    const turn = bot.chooseTurn(start, dice, 'medium', { rng: createSeededRng(1) });
    const score = (t: Turn): number => -raceEvaluator.evaluate(portes.applyTurn(rolled, t)).equity;
    const best = Math.max(...portes.legalTurns(start, dice).map(score));
    expect(score(turn)).toBe(best);
    // Hard is still missing for Portes.
    expect(() => bot.chooseTurn(start, dice, 'hard', { rng: createSeededRng(1) })).toThrow(
      BotError,
    );
  });

  it('checks the registry', () => {
    const wrongVariant: EvaluatorRegistry = new Map([
      ['portes', { medium: { ...raceEvaluator, variant: 'fevga' } }],
    ]);
    expect(() => createBot({ evaluators: wrongVariant })).toThrow(
      expect.objectContaining({ code: 'INVALID_REGISTRY' }),
    );
    const unknownVariant: EvaluatorRegistry = new Map([['nope', {}]]);
    expect(() => createBot({ evaluators: unknownVariant })).toThrow(
      expect.objectContaining({ code: 'INVALID_REGISTRY' }),
    );
    // A custom variant registry is used for the lookup.
    const bot = createBot({ variants: createVariantRegistry([]) });
    expect(() => bot.chooseTurn(start, [1, 2], 'easy', { rng: createSeededRng(1) })).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_VARIANT' }),
    );
  });
});
