import { describe, expect, it } from 'vitest';

import {
  EngineError,
  createBoard,
  createSeededRng,
  createVariantRegistry,
  formatTurn,
  pipCount,
  portes,
  rollDice,
  sameTurn,
} from '@tavli/engine';
import type { Dice, GameState, SideLayout, Turn } from '@tavli/engine';

import {
  BotError,
  EMPTY_EVALUATOR_REGISTRY,
  chooseRandomTurn,
  createBot,
  pickTurn,
  portesHeuristic,
  scoreTurns,
} from './index';
import type { BotLevel, Evaluator, EvaluatorRegistry } from './index';
import { randomPositions } from './testing/random-positions';

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

/** The worst possible advice: it loves to lose. Used to show that a win is always taken. */
const loserEvaluator: Evaluator = {
  id: 'test-loser',
  variant: 'portes',
  evaluate: (state) => {
    const e = raceEvaluator.evaluate(state);
    return { ...e, equity: 10 - e.equity };
  },
};

function isLegal(state: GameState, dice: Dice, turn: Turn): boolean {
  return portes.legalTurns(state, dice).some((legal) => sameTurn(legal, turn));
}

function position(white: SideLayout, black: SideLayout, toMove: 'white' | 'black' = 'white') {
  return { ...start, toMove, board: createBoard({ white, black }, 'contrary') };
}

describe('random level', () => {
  const bot = createBot();

  it('returns one of the legal turns, the same one for the same seed', () => {
    const rng = createSeededRng(7);
    const dice: Dice = [3, 1];
    for (let i = 0; i < 50; i += 1) {
      expect(isLegal(start, dice, bot.chooseTurn(start, dice, 'random', { rng }))).toBe(true);
    }
    const six: Dice = [6, 6];
    const a = bot.chooseTurn(start, six, 'random', { rng: createSeededRng(42) });
    const b = bot.chooseTurn(start, six, 'random', { rng: createSeededRng(42) });
    expect(formatTurn(a)).toBe(formatTurn(b));
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

  it('works without any evaluator', () => {
    const bare = createBot({ evaluators: EMPTY_EVALUATOR_REGISTRY });
    const turn = bare.chooseTurn(start, [4, 2], 'random', { rng: createSeededRng(3) });
    expect(isLegal(start, [4, 2], turn)).toBe(true);
  });
});

describe('every level', () => {
  const bot = createBot();
  const levels: readonly BotLevel[] = ['random', 'easy', 'medium', 'hard'];

  it('plays legal turns and repeats itself for the same seed', () => {
    for (const state of randomPositions(5, 60)) {
      const dice = state.dice ?? [1, 2];
      for (const level of levels) {
        const a = bot.chooseTurn(state, dice, level, { rng: createSeededRng(9) });
        const b = bot.chooseTurn(state, dice, level, { rng: createSeededRng(9) });
        expect(sameTurn(a, b)).toBe(true);
        expect(isLegal(state, dice, a)).toBe(true);
      }
    }
  });

  it('passes when no move is legal, and the engine accepts the pass', () => {
    const dice: Dice = [6, 5];
    for (const level of levels) {
      const turn = bot.chooseTurn(blocked, dice, level, { rng: createSeededRng(1) });
      expect(turn).toEqual({ player: 'white', dice, moves: [] });
      expect(portes.applyTurn({ ...blocked, dice }, turn).toMove).toBe('black');
    }
  });

  it('accepts a state with the same dice already set, and rejects other dice', () => {
    const dice: Dice = [4, 2];
    const turn = bot.chooseTurn({ ...start, dice }, dice, 'medium', { rng: createSeededRng(3) });
    expect(isLegal(start, dice, turn)).toBe(true);
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
    for (const level of levels) {
      expect(() => bot.chooseTurn(over, [1, 2], level, { rng })).toThrow(EngineError);
    }
    expect(() => bot.chooseTurn({ ...start, variant: 'nope' }, [1, 2], 'easy', { rng })).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_VARIANT' }),
    );
  });
});

describe('easy and medium', () => {
  const bot = createBot();

  it('medium plays sound opening moves', () => {
    const rng = createSeededRng(1);
    const play = (dice: Dice): string => formatTurn(bot.chooseTurn(start, dice, 'medium', { rng }));
    // Make the 5-point with 3-1, the bar point with 6-1, the 4-point with 4-2.
    expect(play([3, 1])).toBe('8/5 6/5');
    expect(play([6, 1])).toBe('13/7 8/7');
    expect(play([4, 2])).toBe('8/4 6/4');
  });

  it('medium hits a blot when it is free to do so', () => {
    // Black's lone checker on White's 5-point; White hits it with 8/5* and makes the point.
    const state = position(
      { points: { 13: 5, 8: 4, 6: 6 } },
      { points: { 20: 1, 13: 5, 8: 3, 6: 6 } },
    );
    const turn = bot.chooseTurn(state, [3, 1], 'medium', { rng: createSeededRng(2) });
    expect(turn.moves.some((m) => m.capture === 'hit')).toBe(true);
  });

  it('medium varies its play with the seed, easy varies more', () => {
    const distinct = (level: BotLevel, state: GameState, dice: Dice): number =>
      new Set(
        Array.from({ length: 40 }, (_, seed) =>
          formatTurn(bot.chooseTurn(state, dice, level, { rng: createSeededRng(seed) })),
        ),
      ).size;
    let medium = 0;
    let easy = 0;
    for (const state of randomPositions(11, 30)) {
      const dice = state.dice ?? [1, 2];
      medium += distinct('medium', state, dice);
      easy += distinct('easy', state, dice);
    }
    expect(medium).toBeGreaterThan(30);
    expect(easy).toBeGreaterThan(medium);
  });

  it('with temperature 0, medium always plays a best-scored turn', () => {
    const greedy = createBot({ policies: { medium: { temperature: 0 } } });
    for (const state of randomPositions(13, 40)) {
      const dice = state.dice ?? [1, 2];
      const turns = portes.legalTurns(state, dice);
      const scores = scoreTurns(portes, portesHeuristic, state, turns);
      const best = Math.max(...scores.map((s) => s.score));
      const turn = greedy.chooseTurn(state, dice, 'medium', { rng: createSeededRng(1) });
      const index = turns.findIndex((t) => sameTurn(t, turn));
      expect(scores[index]?.score).toBe(best);
    }
  });

  it('the fast path scores like the engine path (applyTurn, then evaluate)', () => {
    const slow: Evaluator = {
      id: 'slow',
      variant: 'portes',
      evaluate: (state) => portesHeuristic.evaluate(state),
    };
    for (const state of randomPositions(17, 120, 3)) {
      const turns = portes.legalTurns(state, state.dice ?? [1, 2]);
      const fast = scoreTurns(portes, portesHeuristic, state, turns);
      const generic = scoreTurns(portes, slow, state, turns);
      fast.forEach((s, i) => {
        expect(s.gameOver).toBe(generic[i]?.gameOver);
        expect(s.score).toBeCloseTo(generic[i]?.score ?? NaN, 12);
      });
    }
  });
});

describe('a win now is never missed', () => {
  // White's last two checkers on 6 and 1. With 6-1, 6/0 1/0 wins; 6/5 5/0 does not.
  const lastTwo = position({ points: { 6: 1, 1: 1 }, off: 13 }, { points: { 6: 10, 12: 5 } });

  it('easy, medium and the fallback all take the winning turn', () => {
    const dice: Dice = [6, 1];
    const turns = portes.legalTurns(lastTwo, dice);
    expect(turns.length).toBeGreaterThan(1);
    const bots = [
      createBot(),
      // Huge noise and an evaluator that wants to lose: the win is still taken.
      createBot({
        evaluators: new Map([['portes', { easy: loserEvaluator, medium: loserEvaluator }]]),
        policies: { easy: { temperature: 1000 }, medium: { temperature: 1000 } },
      }),
      // No evaluator: easy falls back to random, but still wins.
      createBot({ evaluators: EMPTY_EVALUATOR_REGISTRY }),
    ];
    for (const bot of bots) {
      for (let seed = 0; seed < 50; seed += 1) {
        for (const level of ['easy', 'medium'] as const) {
          if (bot === bots[2] && level === 'medium') continue;
          const turn = bot.chooseTurn(lastTwo, dice, level, { rng: createSeededRng(seed) });
          const after = portes.applyTurn({ ...lastTwo, dice }, turn);
          expect(portes.result(after)?.winner).toBe('white');
        }
      }
    }
  });

  // Slow: it plays medium games to find the positions. A long timeout keeps it safe on busy CI.
  it('easy wins at once in every position where it can', { timeout: 30_000 }, () => {
    // Collect end-game positions where some turns win and some do not.
    const rng = createSeededRng(99);
    const finder = createBot();
    const positions: GameState[] = [];
    let state = portes.initialState({ startingPlayer: 'white' });
    while (positions.length < 25) {
      if (portes.isGameOver(state)) state = portes.initialState({ startingPlayer: 'white' });
      const dice = rollDice(rng);
      const rolled = { ...state, dice };
      if (state.board.off[state.toMove] >= 11) {
        const turns = portes.legalTurns(state, dice);
        const wins = turns.filter((t) => portes.result(portes.applyTurn(rolled, t)) !== null);
        if (wins.length > 0 && wins.length < turns.length) positions.push(rolled);
      }
      state = portes.applyTurn(rolled, finder.chooseTurn(rolled, dice, 'medium', { rng }));
    }
    const easy = createBot({ policies: { easy: { temperature: 100 } } });
    for (const p of positions) {
      for (let seed = 0; seed < 10; seed += 1) {
        const dice = p.dice ?? [1, 2];
        const turn = easy.chooseTurn(p, dice, 'easy', { rng: createSeededRng(seed) });
        expect(portes.result(portes.applyTurn(p, turn))?.winner).toBe(p.toMove);
      }
    }
  });

  it('pickTurn prefers the win with more points', () => {
    const turns = portes.legalTurns(start, [3, 1]).slice(0, 3);
    const scores = [
      { score: 1, gameOver: true },
      { score: 2, gameOver: true },
      { score: 1.9, gameOver: false },
    ];
    for (let seed = 0; seed < 20; seed += 1) {
      expect(pickTurn(turns, scores, 5, createSeededRng(seed))).toBe(turns[1]);
    }
  });
});

describe('registry', () => {
  it('reports easy, medium and hard as supported for Portes', () => {
    const bot = createBot();
    expect(bot.supportedLevels('portes')).toEqual(['easy', 'medium', 'hard']);
    // The other variants have no hard evaluator yet.
    expect(bot.supportedLevels('plakoto')).toEqual(['easy', 'medium']);
    expect(bot.supportedLevels('nope')).toEqual([]);
    expect(createBot({ evaluators: EMPTY_EVALUATOR_REGISTRY }).supportedLevels('portes')).toEqual([
      'easy',
    ]);
    // The app's level picker may also probe `chooseTurn`: no level throws for Portes.
    const dice: Dice = [3, 1];
    const probe = (level: 'easy' | 'medium' | 'hard') => () =>
      bot.chooseTurn({ ...start, dice }, dice, level, { rng: createSeededRng(1) });
    expect(probe('easy')).not.toThrow();
    expect(probe('medium')).not.toThrow();
    expect(probe('hard')).not.toThrow();
  });

  it('throws NOT_IMPLEMENTED for a level with no evaluator', () => {
    const noHard: EvaluatorRegistry = new Map([
      ['portes', { easy: portesHeuristic, medium: portesHeuristic }],
    ]);
    const bot = createBot({ evaluators: noHard });
    expect(() => bot.chooseTurn(start, [3, 1], 'hard', { rng: createSeededRng(1) })).toThrow(
      expect.objectContaining({ name: 'BotError', code: 'NOT_IMPLEMENTED' }),
    );
    // Also on a forced turn (here a pass), so a game cannot start and then fail later.
    expect(() => bot.chooseTurn(blocked, [6, 5], 'hard', { rng: createSeededRng(1) })).toThrow(
      expect.objectContaining({ code: 'NOT_IMPLEMENTED' }),
    );
    const bare = createBot({ evaluators: EMPTY_EVALUATOR_REGISTRY });
    expect(() => bare.chooseTurn(start, [3, 1], 'medium', { rng: createSeededRng(1) })).toThrow(
      BotError,
    );
  });

  it('plugs in an evaluator through the registry (1-ply, best end position)', () => {
    const evaluators: EvaluatorRegistry = new Map([['portes', { hard: raceEvaluator }]]);
    const bot = createBot({ evaluators });
    const dice: Dice = [6, 5];
    const rolled = { ...start, dice };
    const turn = bot.chooseTurn(start, dice, 'hard', { rng: createSeededRng(1) });
    const score = (t: Turn): number => -raceEvaluator.evaluate(portes.applyTurn(rolled, t)).equity;
    const best = Math.max(...portes.legalTurns(start, dice).map(score));
    expect(score(turn)).toBe(best);
  });

  it('checks the registry and the policies', () => {
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
    expect(() => createBot({ policies: { easy: { temperature: -1 } } })).toThrow(
      expect.objectContaining({ code: 'INVALID_REGISTRY' }),
    );
    expect(() => createBot({ policies: { medium: { temperature: NaN } } })).toThrow(BotError);
    // A custom variant registry is used for the lookup.
    // The default evaluators skip variants the custom registry does not have.
    const bot = createBot({ variants: createVariantRegistry([]) });
    expect(bot.supportedLevels('portes')).toEqual([]);
    expect(() => bot.chooseTurn(start, [1, 2], 'easy', { rng: createSeededRng(1) })).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_VARIANT' }),
    );
  });
});
