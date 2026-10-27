/**
 * The 2-ply Analyzer (#212): for the best candidates it also looks at each
 * roll of the next player and their best 1-ply reply.
 */

import { describe, expect, it } from 'vitest';

import {
  DIE_VALUES,
  asodio,
  createBoard,
  createSeededRng,
  createVariantRegistry,
  getPreset,
  getVariant,
  opponent,
  pipCount,
  plakoto,
  portes,
  rollDice,
  sameTurn,
  VARIANT_REGISTRY,
} from '@tavli/engine';
import type { Dice, GameState, PlayerId, SideLayout, Turn, Variant } from '@tavli/engine';

import {
  TWO_PLY_CANDIDATES,
  TWO_PLY_MARGIN,
  TWO_PLY_MAX_CANDIDATES,
  createAnalyzer,
  createBot,
  portesHeuristic,
} from './index';
import type { Evaluator, RankedTurn } from './index';
import { pickOne } from './random';
import { randomAsodioPositions } from './testing/random-asodio-positions';
import { randomFevgaPositions } from './testing/random-fevga-positions';
import { randomPlakotoPositions } from './testing/random-plakoto-positions';
import { randomPositions } from './testing/random-positions';

const analyzer = createAnalyzer();
const TWO = { plies: 2 } as const;
const LONG = { timeout: 60_000 };
const hardAtZero = createBot({ policies: { hard: { temperature: 0 } } });

const start = portes.initialState({ startingPlayer: 'white' });

function position(white: SideLayout, black: SideLayout, toMove: PlayerId = 'white'): GameState {
  return { ...start, toMove, board: createBoard({ white, black }, 'contrary') };
}

/** White has one checker on the bar and every entry point is a black door. */
const blocked = position(
  { points: { 6: 14 }, bar: 1 },
  { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
);

/** White's last two checkers on 6 and 1. With 6-1, 6/0 1/0 wins; 6/5 5/0 does not. */
const lastTwo = position({ points: { 6: 1, 1: 1 }, off: 13 }, { points: { 6: 10, 12: 5 } });

/** A few random positions of every game, with their dice. 2-ply is slow, so keep them few. */
const GAMES: readonly (readonly [string, () => GameState[]])[] = [
  ['portes', () => randomPositions(212, 4, 7)],
  ['plakoto', () => randomPlakotoPositions(212, 4, 7)],
  ['fevga', () => randomFevgaPositions(212, 4, 7)],
  ['asodio', () => randomAsodioPositions(214, 4, 7)],
  [
    'asodio (Acey-Deucey, roll chains)',
    () => randomAsodioPositions(213, 4, 3, getPreset('asodio.aceyDeuceyGreek')),
  ],
];

function diceOf(state: GameState): Dice {
  if (state.dice === null) throw new Error('the test position has no dice');
  return state.dice;
}

function first(ranked: readonly RankedTurn[]): RankedTurn {
  const best = ranked[0];
  if (best === undefined) throw new Error('no turns');
  return best;
}

function expectSorted(ranked: readonly RankedTurn[]): void {
  expect(ranked.length).toBeGreaterThan(0);
  expect(ranked[0]?.equityLoss).toBe(0);
  ranked.forEach((r, i) => {
    expect(r.equityLoss).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.equityLoss)).toBe(true);
    expect(r.evaluation.win).toBeGreaterThanOrEqual(0);
    expect(r.evaluation.win).toBeLessThanOrEqual(1 + 1e-12);
    const next = ranked[i + 1];
    if (next !== undefined) expect(next.equityLoss).toBeGreaterThanOrEqual(r.equityLoss);
  });
}

/**
 * The 2-ply equity of `after` for `me`, counted by hand from the public
 * API: the hard bot answers a question, held dice give one reply, else the
 * 36 rolls (in both orders) each give the best 1-ply reply.
 */
function byHand(variant: Variant, after: GameState, me: PlayerId): number {
  let state = after;
  for (let prompt = variant.prompt?.(state) ?? null; prompt !== null;) {
    if (variant.answerPrompt === undefined) throw new Error('a prompt with no answer');
    const choice = hardAtZero.chooseAnswer(state, 'hard', { rng: createSeededRng(1) });
    state = variant.answerPrompt(state, prompt.player, choice);
    const result = variant.result(state);
    if (result !== null) {
      if (result.winner === null) return 0;
      return result.winner === me ? result.points : -result.points;
    }
    prompt = variant.prompt?.(state) ?? null;
  }
  const sign = state.toMove === me ? 1 : -1;
  const reply = (dice: Dice): number =>
    sign * first(analyzer.rankTurns({ ...state, dice }, dice)).evaluation.equity;
  if (state.dice !== null) return reply(state.dice);
  let sum = 0;
  for (const a of DIE_VALUES) for (const b of DIE_VALUES) sum += reply([a, b]);
  return sum / 36;
}

describe('rankTurns with plies: 2', () => {
  it('agrees with 1 ply on a forced turn (here a pass)', () => {
    const one = analyzer.rankTurns(blocked, [6, 5]);
    const two = analyzer.rankTurns(blocked, [6, 5], TWO);
    expect(two).toHaveLength(1);
    expect(two[0]?.turn).toEqual(one[0]?.turn);
    expect(two[0]?.equityLoss).toBe(0);
  });

  it('agrees with 1 ply on a turn that wins at once, with its true points', () => {
    const dice: Dice = [6, 1];
    const one = analyzer.rankTurns(lastTwo, dice);
    const two = analyzer.rankTurns(lastTwo, dice, TWO);
    expect(sameTurn(first(two).turn, first(one).turn)).toBe(true);
    expect(first(two).evaluation).toEqual({ win: 1, winDouble: 1, loseDouble: 0, equity: 2 });
    expect(two[1]?.equityLoss).toBeGreaterThan(0);
    expectSorted(two);
  });

  it('keeps the same turns as 1 ply, and `top` keeps the best ones', () => {
    const dice: Dice = [6, 5];
    const one = analyzer.rankTurns(start, dice);
    const two = analyzer.rankTurns(start, dice, TWO);
    expect(two).toHaveLength(one.length);
    for (const r of one) expect(two.filter((t) => sameTurn(t.turn, r.turn))).toHaveLength(1);
    expect(analyzer.rankTurns(start, dice, { plies: 2, top: 3 })).toEqual(two.slice(0, 3));
    expect(analyzer.rankTurns(start, dice, { plies: 2, top: 1000 })).toEqual(two);
  });

  it('looks deeper at the best candidates and keeps the rest in 1-ply order', () => {
    // The first random position with a few more turns than the candidates.
    const candidatesOf = (one: readonly RankedTurn[]): RankedTurn[] =>
      one
        .filter((r, i) => i < TWO_PLY_CANDIDATES || r.equityLoss <= TWO_PLY_MARGIN)
        .slice(0, TWO_PLY_MAX_CANDIDATES);
    const state = randomPositions(2120, 40, 1).find((s) => {
      const one = analyzer.rankTurns(s, diceOf(s));
      return one.length >= candidatesOf(one).length + 3;
    });
    if (state === undefined) throw new Error('no position with many turns');
    const dice = diceOf(state);
    const one = analyzer.rankTurns(state, dice);
    const two = analyzer.rankTurns(state, dice, TWO);
    const deep = candidatesOf(one);
    expect(deep.length).toBeGreaterThanOrEqual(TWO_PLY_CANDIDATES);
    const head = two.slice(0, deep.length);
    for (const r of deep) expect(head.filter((t) => sameTurn(t.turn, r.turn))).toHaveLength(1);
    const rest = one.filter((r) => !deep.includes(r));
    expect(two.slice(deep.length).map((r) => r.turn)).toEqual(rest.map((r) => r.turn));
    // The rest keep their 1-ply evaluation.
    expect(two.slice(deep.length).map((r) => r.evaluation)).toEqual(rest.map((r) => r.evaluation));
    expectSorted(two);
  });

  it('prefers the safe turn when 1 ply leaves a direct shot', () => {
    // A test evaluator that sees only the race (pips) and likes checkers on
    // many points. It cannot see shots, so at 1 ply 1-1 splits White's two
    // checkers (8/7 8/5 or 8/4: two points). 2 plies see Black's entering
    // checker hit the blot: a hit sends it back 18 or more pips, far more
    // than the small bonus. So 2 plies keep the checkers together (8/6(2)).
    const raceOnly: Evaluator = {
      id: 'test-race-only',
      variant: 'portes',
      evaluate: (state) => {
        const me = state.toMove;
        const them = opponent(me);
        const points = (p: PlayerId): number => state.board.points.filter((x) => x[p] > 0).length;
        const race =
          (pipCount(state.board, them, 'contrary') - pipCount(state.board, me, 'contrary')) / 100;
        const equity = race + 0.01 * (points(me) - points(them));
        return {
          win: Math.min(1, Math.max(0, 0.5 + equity / 2)),
          winDouble: 0,
          loseDouble: 0,
          equity,
        };
      },
    };
    const custom = createAnalyzer({ evaluators: new Map([['portes', { medium: raceOnly }]]) });
    // Black's last checker waits on the bar; it enters on White's home (White's 1 to 6).
    const shot = position({ points: { 8: 2 }, off: 13 }, { points: { 6: 14 }, bar: 1 });
    const dice: Dice = [1, 1];
    const safe = (turn: Turn): boolean => {
      const after = portes.applyTurn({ ...shot, dice }, turn);
      return after.board.points[5]?.white === 2;
    };
    const one = custom.rankTurns(shot, dice);
    const two = custom.rankTurns(shot, dice, TWO);
    expect(safe(first(one).turn)).toBe(false);
    expect(safe(first(two).turn)).toBe(true);
    expect(one.find((r) => safe(r.turn))?.equityLoss).toBeGreaterThan(0);
    expect(two.find((r) => sameTurn(r.turn, first(one).turn))?.equityLoss).toBeGreaterThan(0.05);
  });

  it('lets the Plakoto player asked answer first (the mother question)', () => {
    // Black's mother is alone on White's 1; White can pin it with 3-5. Black
    // must then answer "resign or play on" before the roll.
    const rules = getPreset('plakoto');
    const before = {
      ...plakoto.initialState({ startingPlayer: 'white', rules }),
      board: createBoard(
        {
          white: { points: { 24: 5, 13: 5, 8: 3, 4: 2 } },
          black: { points: { 24: 1, 13: 7, 18: 7 } },
        },
        'contrary',
      ),
    };
    const dice: Dice = [3, 5];
    const two = analyzer.rankTurns(before, dice, TWO);
    expectSorted(two);
    const pin = two.find((r) => r.turn.moves.some((m) => m.to === 1 && m.capture === 'pin'));
    if (pin === undefined) throw new Error('no pinning turn');
    const after = plakoto.applyTurn({ ...before, dice }, pin.turn);
    expect(plakoto.prompt?.(after)?.kind).toBe('motherPinned');
    expect(pin.evaluation.equity).toBeCloseTo(byHand(plakoto, after, 'white'), 9);
  });

  describe.each(GAMES)('%s', (_name, make) => {
    const positions = make();

    it('ranks every legal turn once, sorted, with equityLoss >= 0', LONG, () => {
      let widest = { state: positions[0] as GameState, ranked: [] as readonly RankedTurn[] };
      for (const state of positions) {
        const dice = diceOf(state);
        const variant = getVariant(VARIANT_REGISTRY, state.variant);
        const legal = variant.legalTurns(state, dice);
        const ranked = analyzer.rankTurns(state, dice, TWO);
        expect(ranked).toHaveLength(legal.length);
        for (const turn of legal) {
          expect(ranked.filter((r) => sameTurn(r.turn, turn))).toHaveLength(1);
        }
        expectSorted(ranked);
        if (ranked.length > widest.ranked.length) widest = { state, ranked };
      }
      // Same input, same output, also from a new Analyzer. One position only: 2-ply is slow.
      const { state, ranked } = widest;
      expect(createAnalyzer().rankTurns(state, diceOf(state), TWO)).toEqual(ranked);
    });

    it('gives the best turns the average of the best replies (counted by hand)', LONG, () => {
      for (const state of positions.slice(0, 2)) {
        const dice = diceOf(state);
        const variant = getVariant(VARIANT_REGISTRY, state.variant);
        for (const r of analyzer.rankTurns(state, dice, { plies: 2, top: 2 })) {
          const after = variant.applyTurn(state, r.turn);
          if (variant.result(after) !== null) continue;
          expect(r.evaluation.equity).toBeCloseTo(byHand(variant, after, state.toMove), 9);
        }
      }
    });
  });

  it('follows state.toMove in Asodio roll chains', LONG, () => {
    // Acey-Deucey: after a double the same player rolls again, and after a
    // 1-2 the same player chooses a double and plays it. Then the "reply" is
    // the same player's next turn. Find both cases with the 1-ply best turn
    // (always a 2-ply candidate) and check the 2-ply equity by hand.
    const rules = getPreset('asodio.aceyDeuceyGreek');
    const rng = createSeededRng(212);
    let extraRoll = 0;
    let chosenDouble = 0;
    for (let game = 0; game < 20 && (extraRoll < 2 || chosenDouble < 2); game += 1) {
      let state = asodio.initialState({ startingPlayer: 'white', rules });
      for (let turn = 0; turn < 400 && !asodio.isGameOver(state); turn += 1) {
        const prompt = asodio.prompt?.(state) ?? null;
        if (prompt !== null && asodio.answerPrompt !== undefined) {
          state = asodio.answerPrompt(state, prompt.player, pickOne(rng, prompt.choices));
          continue;
        }
        const dice = state.dice ?? rollDice(rng);
        const rolled = { ...state, dice };
        const one = first(analyzer.rankTurns(rolled, dice));
        const after = asodio.applyTurn(rolled, one.turn);
        const same = after.toMove === state.toMove && !asodio.isGameOver(after);
        const asks = same && (asodio.prompt?.(after) ?? null) !== null;
        if (same && ((asks && chosenDouble < 2) || (!asks && extraRoll < 2))) {
          const two = analyzer.rankTurns(rolled, dice, TWO);
          expectSorted(two);
          const mine = two.find((r) => sameTurn(r.turn, one.turn));
          expect(mine?.evaluation.equity).toBeCloseTo(byHand(asodio, after, state.toMove), 9);
          if (asks) chosenDouble += 1;
          else extraRoll += 1;
        }
        state = after;
      }
    }
    expect(extraRoll).toBe(2);
    expect(chosenDouble).toBe(2);
  });

  it('throws like 1 ply for a bad request or a missing evaluator', () => {
    const invalid = expect.objectContaining({ code: 'INVALID_REQUEST' });
    expect(() => analyzer.rankTurns(start, [3, 1], { plies: 2, top: 0 })).toThrow(invalid);
    expect(() => analyzer.rankTurns({ ...start, dice: [4, 2] }, [3, 1], TWO)).toThrow(invalid);
    const easyOnly = createAnalyzer({
      evaluators: new Map([['portes', { easy: portesHeuristic }]]),
    });
    expect(() => easyOnly.rankTurns(blocked, [6, 5], TWO)).toThrow(
      expect.objectContaining({ code: 'NOT_IMPLEMENTED' }),
    );
  });

  it('throws INVALID_REQUEST for a question the variant cannot take an answer for', () => {
    // A stub Portes that asks a question after every turn but has no `answerPrompt`.
    const asksOnly: Variant = Object.assign(Object.create(portes) as Variant, {
      prompt: (state: GameState) => ({ player: state.toMove, kind: 'stub', choices: ['ok'] }),
      answerPrompt: undefined,
    });
    const stub = createAnalyzer({
      variants: createVariantRegistry([asksOnly]),
      evaluators: new Map([['portes', { medium: portesHeuristic }]]),
    });
    const dice: Dice = [3, 1];
    // 1 ply never plays past the turn, so it never meets the question.
    expect(stub.rankTurns(start, dice).length).toBeGreaterThan(1);
    expect(() => stub.rankTurns(start, dice, TWO)).toThrow(
      expect.objectContaining({ name: 'BotError', code: 'INVALID_REQUEST' }),
    );
  });
});
