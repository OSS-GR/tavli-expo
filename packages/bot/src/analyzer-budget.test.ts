/**
 * The work budget of the 2-ply Analyzer (#237): `rankTurns(state, dice,
 * { plies: 2, budget })`. The candidates get their deeper look in 1-ply
 * order until the next scored position would pass the budget; that
 * candidate and the later ones keep their 1-ply values.
 */

import { describe, expect, it } from 'vitest';

import {
  PRESET_IDS,
  createBoard,
  getPreset,
  getVariant,
  portes,
  sameTurn,
  VARIANT_REGISTRY,
} from '@tavli/engine';
import type { Dice, GameState, PlayerId, SideLayout } from '@tavli/engine';

import {
  TWO_PLY_CANDIDATES,
  TWO_PLY_HINT_BUDGET,
  TWO_PLY_HINT_BUDGETS,
  TWO_PLY_MARGIN,
  TWO_PLY_MAX_CANDIDATES,
  createAnalyzer,
} from './index';
import type { RankedTurn } from './index';
import { countingEvaluators } from './testing/hint-work';
import { randomAsodioPositions } from './testing/random-asodio-positions';
import { randomFevgaPositions } from './testing/random-fevga-positions';
import { randomPlakotoPositions } from './testing/random-plakoto-positions';
import { randomPositions } from './testing/random-positions';

const analyzer = createAnalyzer();
const LONG = { timeout: 60_000 };

const start = portes.initialState({ startingPlayer: 'white' });

function position(white: SideLayout, black: SideLayout, toMove: PlayerId = 'white'): GameState {
  return { ...start, toMove, board: createBoard({ white, black }, 'contrary') };
}

/** White's last two checkers on 6 and 1. With 6-1, 6/0 1/0 wins; 6/5 5/0 does not. */
const lastTwo = position({ points: { 6: 1, 1: 1 }, off: 13 }, { points: { 6: 10, 12: 5 } });

/** A few random positions of every game, with their dice. 2-ply is slow, so keep them few. */
const GAMES: readonly (readonly [string, () => GameState[]])[] = [
  ['portes', () => randomPositions(237, 3, 7)],
  ['plakoto', () => randomPlakotoPositions(237, 3, 7)],
  ['fevga', () => randomFevgaPositions(237, 3, 7)],
  ['asodio', () => randomAsodioPositions(237, 3, 7)],
  [
    'asodio (Acey-Deucey Greek)',
    () => randomAsodioPositions(237, 3, 3, getPreset('asodio.aceyDeuceyGreek')),
  ],
  [
    'asodio (Acey-Deucey American)',
    () => randomAsodioPositions(237, 3, 3, getPreset('asodio.aceyDeuceyAmerican')),
  ],
];

function diceOf(state: GameState): Dice {
  if (state.dice === null) throw new Error('the test position has no dice');
  return state.dice;
}

function expectSorted(ranked: readonly RankedTurn[]): void {
  expect(ranked.length).toBeGreaterThan(0);
  expect(ranked[0]?.equityLoss).toBe(0);
  ranked.forEach((r, i) => {
    expect(r.equityLoss).toBeGreaterThanOrEqual(0);
    const next = ranked[i + 1];
    if (next !== undefined) expect(next.equityLoss).toBeGreaterThanOrEqual(r.equityLoss);
  });
}

/** The 2-ply candidates of a 1-ply ranking, in 1-ply order (as in `createAnalyzer`). */
function candidatesOf(one: readonly RankedTurn[]): RankedTurn[] {
  return one
    .filter((r, i) => i < TWO_PLY_CANDIDATES || r.equityLoss <= TWO_PLY_MARGIN)
    .slice(0, TWO_PLY_MAX_CANDIDATES);
}

/** The positions one call scores, with the counting evaluators. */
function work(
  state: GameState,
  opts: Parameters<ReturnType<typeof createAnalyzer>['rankTurns']>[2],
): { ranked: readonly RankedTurn[]; used: number } {
  const { registry, count } = countingEvaluators();
  const ranked = createAnalyzer({ evaluators: registry }).rankTurns(state, diceOf(state), opts);
  return { ranked, used: count() };
}

describe('rankTurns with plies: 2 and a budget (#237)', () => {
  it('a budget of 0 gives the 1-ply ranking', () => {
    const dice: Dice = [6, 5];
    expect(analyzer.rankTurns(start, dice, { plies: 2, budget: 0 })).toEqual(
      analyzer.rankTurns(start, dice),
    );
    expect(analyzer.rankTurns(start, dice, { plies: 2, budget: 0, top: 3 })).toEqual(
      analyzer.rankTurns(start, dice, { top: 3 }),
    );
  });

  it('a turn that wins at once still ranks first, with its true points', () => {
    for (const budget of [0, 1, 100]) {
      const ranked = analyzer.rankTurns(lastTwo, [6, 1], { plies: 2, budget });
      expect(ranked[0]?.evaluation).toEqual({ win: 1, winDouble: 1, loseDouble: 0, equity: 2 });
      expect(ranked[1]?.equityLoss).toBeGreaterThan(0);
      expectSorted(ranked);
    }
  });

  it('ignores the budget at 1 ply', () => {
    expect(analyzer.rankTurns(start, [3, 1], { budget: 0 })).toEqual(
      analyzer.rankTurns(start, [3, 1]),
    );
  });

  it('stops the deeper looks exactly at the budget, in 1-ply order', LONG, () => {
    // The first random position with at least two candidates that do not end the game.
    const state = randomPositions(2370, 20, 1).find(
      (s) => candidatesOf(analyzer.rankTurns(s, diceOf(s))).length >= 4,
    );
    if (state === undefined) throw new Error('no position with candidates');
    const one = analyzer.rankTurns(state, diceOf(state));
    const deep = candidatesOf(one);
    const full = analyzer.rankTurns(state, diceOf(state), { plies: 2 });
    // With `top: 1` the call scores the 1-ply scores and the deeper looks only.
    const { used } = work(state, { plies: 2, top: 1 });

    // Exactly enough budget: the same as no budget.
    expect(analyzer.rankTurns(state, diceOf(state), { plies: 2, budget: used })).toEqual(full);
    expect(work(state, { plies: 2, top: 1, budget: used }).used).toBe(used);

    // One position less: the last candidate keeps its 1-ply value, the others keep their 2-ply one.
    const short = work(state, { plies: 2, budget: used - 1 });
    const last = deep[deep.length - 1] as RankedTurn;
    const find = (ranked: readonly RankedTurn[], r: RankedTurn) =>
      ranked.find((t) => sameTurn(t.turn, r.turn));
    expect(find(short.ranked, last)?.evaluation).toEqual(last.evaluation);
    for (const r of deep.slice(0, -1)) {
      expect(find(short.ranked, r)?.evaluation).toEqual(find(full, r)?.evaluation);
    }
    expectSorted(short.ranked);
    // The 2-ply candidates first (all but the last), then the rest in 1-ply order.
    const tail = one.filter((r) => !deep.slice(0, -1).includes(r));
    expect(short.ranked.slice(deep.length - 1).map((r) => r.turn)).toEqual(tail.map((r) => r.turn));
  });

  it('with a budget large enough, gives the result without a budget', LONG, () => {
    for (const state of randomPositions(2371, 3, 7)) {
      const full = analyzer.rankTurns(state, diceOf(state), { plies: 2 });
      expect(analyzer.rankTurns(state, diceOf(state), { plies: 2, budget: 1e9 })).toEqual(full);
      expect(
        analyzer.rankTurns(state, diceOf(state), {
          plies: 2,
          budget: Number.POSITIVE_INFINITY,
        }),
      ).toEqual(full);
    }
  });

  describe.each(GAMES)('%s', (_name, make) => {
    const positions = make();

    it('respects the budget, ranks every legal turn once, sorted, the same each time', LONG, () => {
      for (const state of positions) {
        const dice = diceOf(state);
        const variant = getVariant(VARIANT_REGISTRY, state.variant);
        const legal = variant.legalTurns(state, dice);
        // The 1-ply scores always run; with `top: 1` that is the count of a 1-ply hint.
        const oneUsed = work(state, { top: 1 }).used;
        for (const budget of [0, 500, 3_000]) {
          const { ranked, used } = work(state, { plies: 2, top: 1, budget });
          expect(used).toBeLessThanOrEqual(Math.max(budget + 1, oneUsed));
          const all = analyzer.rankTurns(state, dice, { plies: 2, budget });
          expect(all).toHaveLength(legal.length);
          for (const turn of legal) {
            expect(all.filter((r) => sameTurn(r.turn, turn))).toHaveLength(1);
          }
          expectSorted(all);
          expect(ranked).toEqual(all.slice(0, 1));
          expect(createAnalyzer().rankTurns(state, dice, { plies: 2, budget })).toEqual(all);
        }
      }
    });
  });

  it('throws INVALID_REQUEST for a bad budget', () => {
    const invalid = expect.objectContaining({ name: 'BotError', code: 'INVALID_REQUEST' });
    for (const budget of [-1, 1.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(() => analyzer.rankTurns(start, [3, 1], { plies: 2, budget })).toThrow(invalid);
    }
  });

  it('has a hint budget for every preset, an integer > 0', () => {
    for (const preset of PRESET_IDS) {
      const budget = TWO_PLY_HINT_BUDGETS[preset];
      expect(Number.isInteger(budget)).toBe(true);
      expect(budget).toBeGreaterThan(0);
      expect(budget).toBeLessThanOrEqual(TWO_PLY_HINT_BUDGET);
    }
  });
});
