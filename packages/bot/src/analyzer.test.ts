/**
 * The Analyzer (#206): it ranks the legal turns for a roll, best first, with
 * the variant's best evaluator, and it is the same as the hard bot at
 * temperature 0.
 */

import { describe, expect, it } from 'vitest';

import {
  asodio,
  createBoard,
  createSeededRng,
  fevga,
  getPreset,
  getVariant,
  plakoto,
  portes,
  rollDice,
  sameTurn,
  VARIANT_REGISTRY,
} from '@tavli/engine';
import type { Dice, GameState, SideLayout, Turn } from '@tavli/engine';

import {
  BotError,
  DEFAULT_EVALUATORS,
  EMPTY_EVALUATOR_REGISTRY,
  asodioNet,
  createAnalyzer,
  createBot,
  fevgaNet,
  plakotoNet,
  portesHeuristic,
  portesNet,
  scoreTurns,
} from './index';
import type { Evaluator, EvaluatorRegistry, RankedTurn } from './index';
import { pickOne } from './random';
import { randomAsodioPositions } from './testing/random-asodio-positions';
import { randomFevgaPositions } from './testing/random-fevga-positions';
import { randomPlakotoPositions } from './testing/random-plakoto-positions';
import { randomPositions } from './testing/random-positions';

const analyzer = createAnalyzer();
const LONG = { timeout: 60_000 };

const start = portes.initialState({ startingPlayer: 'white' });

function position(white: SideLayout, black: SideLayout, toMove: 'white' | 'black' = 'white') {
  return { ...start, toMove, board: createBoard({ white, black }, 'contrary') };
}

/** White has one checker on the bar and every entry point is a black door. */
const blocked = position(
  { points: { 6: 14 }, bar: 1 },
  { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
);

/** White's last two checkers on 6 and 1. With 6-1, 6/0 1/0 wins; 6/5 5/0 does not. */
const lastTwo = position({ points: { 6: 1, 1: 1 }, off: 13 }, { points: { 6: 10, 12: 5 } });

/** Random positions of every game, each with the dice rolled for it. */
const GAMES: readonly (readonly [string, () => GameState[]])[] = [
  ['portes', () => randomPositions(206, 30, 3)],
  ['plakoto', () => randomPlakotoPositions(206, 30, 3)],
  ['fevga', () => randomFevgaPositions(206, 30, 3)],
  ['asodio', () => randomAsodioPositions(206, 30, 3)],
  [
    'asodio (Acey-Deucey, roll chains)',
    () => randomAsodioPositions(207, 30, 1, getPreset('asodio.aceyDeuceyGreek')),
  ],
];

function diceOf(state: GameState): Dice {
  if (state.dice === null) throw new Error('the test position has no dice');
  return state.dice;
}

function bestTurn(ranked: readonly RankedTurn[]): Turn {
  const first = ranked[0];
  if (first === undefined) throw new Error('no turns');
  return first.turn;
}

function expectSorted(ranked: readonly RankedTurn[]): void {
  expect(ranked.length).toBeGreaterThan(0);
  expect(ranked[0]?.equityLoss).toBe(0);
  ranked.forEach((r, i) => {
    expect(r.equityLoss).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.equityLoss)).toBe(true);
    expect(r.evaluation.win).toBeGreaterThanOrEqual(0);
    expect(r.evaluation.win).toBeLessThanOrEqual(1);
    const next = ranked[i + 1];
    if (next !== undefined) expect(next.equityLoss).toBeGreaterThanOrEqual(r.equityLoss);
  });
}

describe('rankTurns', () => {
  it('ranks a forced turn (here a pass) as one turn with no loss', () => {
    const ranked = analyzer.rankTurns(blocked, [6, 5]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.turn.moves).toEqual([]);
    expect(ranked[0]?.equityLoss).toBe(0);
  });

  it('ranks a turn that wins at once first, with its true points', () => {
    const dice: Dice = [6, 1];
    const ranked = analyzer.rankTurns(lastTwo, dice);
    expect(ranked.length).toBeGreaterThan(1);
    const first = ranked[0];
    if (first === undefined) throw new Error('no turns');
    const after = portes.applyTurn({ ...lastTwo, dice }, first.turn);
    expect(portes.result(after)?.winner).toBe('white');
    expect(first.evaluation).toEqual({ win: 1, winDouble: 1, loseDouble: 0, equity: 2 });
    // The turn that does not win loses the sure diplo.
    expect(ranked[1]?.equityLoss).toBeGreaterThan(0);
  });

  it('ranks a win first even when the evaluator likes another turn more', () => {
    // An evaluator that loves to lose: it scores the other turn far above the win.
    const loser: Evaluator = {
      id: 'test-loser',
      variant: 'portes',
      evaluate: (state) => {
        const e = portesHeuristic.evaluate(state);
        return { ...e, equity: -10 - e.equity };
      },
    };
    const custom = createAnalyzer({ evaluators: new Map([['portes', { medium: loser }]]) });
    const dice: Dice = [6, 1];
    const ranked = custom.rankTurns(lastTwo, dice);
    const after = portes.applyTurn({ ...lastTwo, dice }, bestTurn(ranked));
    expect(portes.result(after)?.winner).toBe('white');
    expectSorted(ranked);
  });

  it('ranks a win first in random end games', LONG, () => {
    const rng = createSeededRng(206);
    let found = 0;
    let state = portes.initialState({ startingPlayer: 'white' });
    while (found < 6) {
      if (portes.isGameOver(state)) state = portes.initialState({ startingPlayer: 'white' });
      const dice = rollDice(rng);
      const rolled = { ...state, dice };
      const turns = portes.legalTurns(state, dice);
      if (state.board.off[state.toMove] >= 11) {
        const wins = turns.filter((t) => portes.result(portes.applyTurn(rolled, t)) !== null);
        if (wins.length > 0 && wins.length < turns.length) {
          const after = portes.applyTurn(rolled, bestTurn(analyzer.rankTurns(rolled, dice)));
          expect(portes.result(after)?.winner).toBe(state.toMove);
          found += 1;
        }
      }
      state = portes.applyTurn(rolled, pickOne(rng, turns));
    }
  });

  describe.each(GAMES)('%s', (_name, make) => {
    const positions = make();
    const hardAtZero = createBot({ policies: { hard: { temperature: 0 } } });

    it('ranks every legal turn once, sorted, with equityLoss >= 0', LONG, () => {
      for (const state of positions) {
        const dice = diceOf(state);
        const variant = getVariant(VARIANT_REGISTRY, state.variant);
        const legal = variant.legalTurns(state, dice);
        const ranked = analyzer.rankTurns(state, dice);
        expect(ranked).toHaveLength(legal.length);
        for (const turn of legal) {
          expect(ranked.filter((r) => sameTurn(r.turn, turn))).toHaveLength(1);
        }
        expectSorted(ranked);
      }
    });

    it('its best turn is the hard bot at temperature 0', LONG, () => {
      for (const [i, state] of positions.entries()) {
        const dice = diceOf(state);
        const ranked = analyzer.rankTurns(state, dice);
        const chosen = hardAtZero.chooseTurn(state, dice, 'hard', { rng: createSeededRng(i) });
        const match = ranked.find((r) => sameTurn(r.turn, chosen));
        // Ties pick at random in the bot, so the bot may play any turn with no loss.
        expect(match?.equityLoss).toBe(0);
        if (ranked.length === 1 || (ranked[1]?.equityLoss ?? 0) > 0) {
          expect(sameTurn(bestTurn(ranked), chosen)).toBe(true);
        }
      }
    });

    it('gives each turn its evaluation from the view of the mover', LONG, () => {
      for (const state of positions) {
        const dice = diceOf(state);
        const variant = getVariant(VARIANT_REGISTRY, state.variant);
        const evaluator = DEFAULT_EVALUATORS.get(state.variant)?.hard;
        if (evaluator === undefined) throw new Error('no hard evaluator');
        for (const r of analyzer.rankTurns(state, dice, { top: 3 })) {
          const after = variant.applyTurn(state, r.turn);
          if (variant.result(after) !== null) continue;
          const raw = evaluator.evaluate(after);
          const same = after.toMove === state.toMove;
          expect(r.evaluation.equity).toBeCloseTo(same ? raw.equity : -raw.equity, 9);
          expect(r.evaluation.win).toBeCloseTo(same ? raw.win : 1 - raw.win, 12);
        }
      }
    });

    it('gives the same output for the same input', LONG, () => {
      const other = createAnalyzer();
      for (const state of positions.slice(0, 10)) {
        const dice = diceOf(state);
        const once = analyzer.rankTurns(state, dice);
        expect(analyzer.rankTurns(state, dice)).toEqual(once);
        expect(other.rankTurns(state, dice)).toEqual(once);
      }
    });
  });

  it('keeps only the best `top` turns', () => {
    const dice: Dice = [6, 5];
    const all = analyzer.rankTurns(start, dice);
    expect(all.length).toBeGreaterThan(3);
    expect(analyzer.rankTurns(start, dice, { top: 3 })).toEqual(all.slice(0, 3));
    expect(analyzer.rankTurns(start, dice, { top: 1000 })).toEqual(all);
    expect(analyzer.rankTurns(start, dice, { plies: 1 })).toEqual(all);
  });

  it('follows state.toMove and plays state.dice (Asodio roll chains)', LONG, () => {
    // Play Acey-Deucey games with the best turn. A turn may keep the same player
    // to move, and a chosen double after a 1-2 leaves the dice in the state.
    const rules = getPreset('asodio.aceyDeuceyGreek');
    const rng = createSeededRng(206);
    let sameMover = 0;
    let heldDice = 0;
    for (let game = 0; game < 20 && (sameMover === 0 || heldDice === 0); game += 1) {
      let state = asodio.initialState({ startingPlayer: 'white', rules });
      for (let turn = 0; turn < 400 && !asodio.isGameOver(state); turn += 1) {
        const prompt = asodio.prompt?.(state) ?? null;
        if (prompt !== null && asodio.answerPrompt !== undefined) {
          state = asodio.answerPrompt(state, prompt.player, pickOne(rng, prompt.choices));
          continue;
        }
        if (state.dice !== null) heldDice += 1;
        const dice = state.dice ?? rollDice(rng);
        const rolled = { ...state, dice };
        const ranked = analyzer.rankTurns(rolled, dice);
        expect(ranked).toHaveLength(asodio.legalTurns(rolled, dice).length);
        expectSorted(ranked);
        const after = asodio.applyTurn(rolled, bestTurn(ranked));
        if (after.toMove === state.toMove && !asodio.isGameOver(after)) sameMover += 1;
        state = after;
      }
    }
    expect(sameMover).toBeGreaterThan(0);
    expect(heldDice).toBeGreaterThan(0);
  });

  it('throws NOT_IMPLEMENTED for 2-ply', () => {
    expect(() => analyzer.rankTurns(start, [3, 1], { plies: 2 })).toThrow(
      expect.objectContaining({ name: 'BotError', code: 'NOT_IMPLEMENTED' }),
    );
  });

  it('throws INVALID_REQUEST for a bad request', () => {
    const invalid = expect.objectContaining({ code: 'INVALID_REQUEST' });
    expect(() => analyzer.rankTurns(start, [3, 1], { top: 0 })).toThrow(invalid);
    expect(() => analyzer.rankTurns(start, [3, 1], { top: 1.5 })).toThrow(invalid);
    expect(() => analyzer.rankTurns(start, [3, 1], { plies: 3 as 1 })).toThrow(invalid);
    expect(() => analyzer.rankTurns({ ...start, dice: [4, 2] }, [3, 1])).toThrow(invalid);
  });
});

describe('the evaluator choice', () => {
  it('uses the hard net when there is one', () => {
    expect(analyzer.evaluate(start)).toEqual(portesNet.evaluate(start));
    const fevgaStart = fevga.initialState({ startingPlayer: 'black' });
    expect(analyzer.evaluate(fevgaStart)).toEqual(fevgaNet.evaluate(fevgaStart));
    const plakotoStart = plakoto.initialState({ startingPlayer: 'white' });
    expect(analyzer.evaluate(plakotoStart)).toEqual(plakotoNet.evaluate(plakotoStart));
    const asodioStart = asodio.initialState({ startingPlayer: 'white' });
    expect(analyzer.evaluate(asodioStart)).toEqual(asodioNet.evaluate(asodioStart));
  });

  it('falls back to the medium evaluator', () => {
    const evaluators: EvaluatorRegistry = new Map([['portes', { medium: portesHeuristic }]]);
    const medium = createAnalyzer({ evaluators });
    const dice: Dice = [6, 5];
    const rolled = { ...start, dice };
    const turns = portes.legalTurns(start, dice);
    const scores = scoreTurns(portes, portesHeuristic, rolled, turns);
    const max = Math.max(...scores.map((s) => s.score));
    const ranked = medium.rankTurns(start, dice);
    expect(ranked[0]?.evaluation.equity).toBe(max);
    expect(medium.evaluate(start)).toEqual(portesHeuristic.evaluate(start));
  });

  it('throws NOT_IMPLEMENTED with no hard or medium evaluator, even on a forced turn', () => {
    const easyOnly = createAnalyzer({
      evaluators: new Map([['portes', { easy: portesHeuristic }]]),
    });
    const notImplemented = expect.objectContaining({ code: 'NOT_IMPLEMENTED' });
    expect(() => easyOnly.rankTurns(start, [3, 1])).toThrow(notImplemented);
    expect(() => easyOnly.rankTurns(blocked, [6, 5])).toThrow(notImplemented);
    expect(() => easyOnly.evaluate(start)).toThrow(notImplemented);
    expect(() => createAnalyzer({ evaluators: EMPTY_EVALUATOR_REGISTRY }).evaluate(start)).toThrow(
      BotError,
    );
  });

  it('checks the registry like createBot', () => {
    expect(() =>
      createAnalyzer({ evaluators: new Map([['plakoto', { hard: portesNet }]]) }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_REGISTRY' }));
  });
});

describe('evaluate', () => {
  it('is from the view of the side to move', () => {
    const white = analyzer.evaluate(lastTwo);
    const black = analyzer.evaluate({ ...lastTwo, toMove: 'black' });
    expect(white.equity).toBeGreaterThan(0);
    expect(black.equity).toBeLessThan(white.equity);
  });

  it('gives the true result of a finished game', () => {
    const dice: Dice = [6, 1];
    const rolled = { ...lastTwo, dice };
    const win = bestTurn(analyzer.rankTurns(rolled, dice));
    const over = portes.applyTurn(rolled, win);
    expect(portes.result(over)?.winner).toBe('white');
    const mover = over.toMove;
    const expected =
      mover === 'white'
        ? { win: 1, winDouble: 1, loseDouble: 0, equity: 2 }
        : { win: 0, winDouble: 0, loseDouble: 1, equity: -2 };
    expect(analyzer.evaluate(over)).toEqual(expected);
  });
});
