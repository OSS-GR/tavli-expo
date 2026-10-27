import { describe, expect, it } from 'vitest';

import { asodio, createBoard, getPreset, opponent, resolveRules } from '@tavli/engine';
import type { Dice, GameState, PlayerId, RuleSet, SideLayout } from '@tavli/engine';

import { scoreTurns } from '../score';
import { randomAsodioPositions } from '../testing/random-asodio-positions';
import type { Evaluator } from '../types';
import { asodioContact, asodioOptions, asodioSideOf, mutualLock } from './asodio-board';
import { asodioHeuristic } from './asodio-heuristic';
import {
  ASODIO_NET_INPUTS,
  asodioNet,
  asodioNetGame,
  encodeAsodio,
  evaluateAsodioFallback,
  isAsodioNetRules,
  loadAsodioNet,
  shippedAsodioNet,
} from './asodio-net';
import { ASODIO_NET_V1 } from './asodio-net-weights';
import { createSparseInput } from './net';

const KAFENEIO = getPreset('asodio.kafeneio');
const start = asodio.initialState({ startingPlayer: 'white' });

function position(
  white: SideLayout,
  black: SideLayout,
  toMove: PlayerId = 'white',
  rules: RuleSet = KAFENEIO,
): GameState {
  const first = asodio.initialState({ startingPlayer: toMove, rules });
  return { ...first, board: createBoard({ white, black }, 'contrary') };
}

function sidesOf(state: GameState) {
  return {
    roller: asodioSideOf(state, state.toMove),
    waiter: asodioSideOf(state, opponent(state.toMove)),
    options: asodioOptions(state.rules),
  };
}

/** The dense inputs of a position, from the view of its player to move. */
function dense(state: GameState): number[] {
  const { roller, waiter, options } = sidesOf(state);
  const input = createSparseInput(ASODIO_NET_INPUTS);
  encodeAsodio(roller, waiter, options, input);
  const out = new Array<number>(ASODIO_NET_INPUTS).fill(0);
  for (let k = 0; k < input.count; k += 1) out[input.index[k] ?? 0] = input.value[k] ?? 0;
  return out;
}

/** The same position with the colours swapped (the board turned around). */
function mirrored(state: GameState): GameState {
  const swap = (p: PlayerId | null): PlayerId | null => (p === null ? null : opponent(p));
  const { board } = state;
  return {
    ...state,
    toMove: opponent(state.toMove),
    board: {
      ...board,
      points: [...board.points]
        .reverse()
        .map((p) => ({ white: p.black, black: p.white, pinned: swap(p.pinned) })),
      off: { white: board.off.black, black: board.off.white },
      bar: { white: board.bar.black, black: board.bar.white },
      outside: { white: board.outside.black, black: board.outside.white },
    },
  };
}

/** True when the net (not the heuristic) scores this state. */
function netScores(state: GameState): boolean {
  const { roller, waiter, options } = sidesOf(state);
  return asodioNetGame.usesNet(roller, waiter, options);
}

describe('asodio net: inputs', () => {
  it('encodes the start: all 15 outside, the gate holds, no pins', () => {
    const x = dense(start);
    expect(x.slice(0, 240).every((v) => v === 0)).toBe(true);
    // Outside / 15 and the gate, per side.
    expect(x.slice(240, 244)).toEqual([1, 1, 1, 1]);
    expect(x.slice(244, 246)).toEqual([0, 0]);
    // 15 checkers that count 25 pips each.
    expect(x[246]).toBeCloseTo(3.75, 12);
    expect(x[247]).toBeCloseTo(3.75, 12);
    // Rear quarter 0 for both, no pinned checker.
    expect(x.slice(248, 256)).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    expect(x.slice(256, 268).every((v) => v === 0)).toBe(true);
    // No pin is possible yet.
    expect(x.slice(272, 276)).toEqual([0, 0, 0, 0]);
  });

  it('sets the pin units, the lowest pinned quarter and the frozen army', () => {
    // Black's last checker in its rear quarter (Black 13–18) is alone on
    // Black 16 = White 9, and White pins it: Black's army is frozen.
    const state = position(
      { points: { 14: 3, 9: 1, 13: 11 } },
      { points: { 16: 1, 9: 14 }, pinned: [16] },
    );
    const x = dense(state);
    // The waiter's pin unit for its own 16.
    expect(x[192 + 24 + 15]).toBe(1);
    expect(x.slice(192, 216).every((v) => v === 0)).toBe(true);
    // The waiter: rear quarter 1 (13–18), lowest pinned quarter 1, the army frozen.
    expect(x.slice(252, 256)).toEqual([0, 1, 0, 0]);
    expect(x.slice(260, 264)).toEqual([0, 1, 0, 0]);
    expect(x[267]).toBe(1);
    expect(x[266]).toBe(0);
    // The waiter's 14 checkers on Black 9 sit in front of its rear quarter.
    expect(x[265]).toBeCloseTo(14 / 15, 12);
    // The waiter cannot move at all.
    expect(x[269]).toBe(1);
    expect(x[271]).toBe(1);
  });

  it('is the same for both colours (each from its own view)', () => {
    for (const state of randomAsodioPositions(4, 80)) {
      expect(dense(mirrored(state))).toEqual(dense(state));
    }
  });

  it('keeps every index in range, each at most once', () => {
    for (const state of randomAsodioPositions(6, 200)) {
      const { roller, waiter, options } = sidesOf(state);
      const input = createSparseInput(ASODIO_NET_INPUTS);
      encodeAsodio(roller, waiter, options, input);
      const seen = new Set<number>();
      for (let k = 0; k < input.count; k += 1) {
        const i = input.index[k] ?? -1;
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(ASODIO_NET_INPUTS);
        expect(seen.has(i)).toBe(false);
        seen.add(i);
      }
    }
  });
});

describe('asodio net: the shipped weights', () => {
  it('load, name their game, and stay under 100 KB', () => {
    const net = shippedAsodioNet();
    expect(net.inputs).toBe(ASODIO_NET_INPUTS);
    expect(net.hidden).toBeGreaterThanOrEqual(20);
    expect(net.w1.length).toBe(net.inputs * net.hidden);
    expect(ASODIO_NET_V1.game).toBe('asodio');
    expect(ASODIO_NET_V1.data.length).toBeLessThan(100_000);
    for (const w of net.w1) expect(Number.isFinite(w)).toBe(true);
  });

  it('reject a file with the wrong sizes', () => {
    expect(() => loadAsodioNet({ ...ASODIO_NET_V1, inputs: 10 })).toThrow(RangeError);
    expect(() => loadAsodioNet({ ...ASODIO_NET_V1, hidden: ASODIO_NET_V1.hidden + 1 })).toThrow(
      RangeError,
    );
  });
});

describe('asodio net: which rules', () => {
  it('plays the owner rules only; any other rule set is the heuristic', { timeout: 30_000 }, () => {
    expect(isAsodioNetRules(KAFENEIO)).toBe(true);
    expect(isAsodioNetRules(resolveRules('asodio.kafeneio', {}))).toBe(true);
    const others: RuleSet[] = [
      getPreset('asodio.aceyDeuceyGreek'),
      getPreset('asodio.aceyDeuceyAmerican'),
      resolveRules('asodio.kafeneio', { entry: { moveWhileLoading: true } }),
      resolveRules('asodio.kafeneio', { quarters: { moveInsideFrozenQuarter: true } }),
      resolveRules('asodio.kafeneio', { scoring: { method: 'perChecker' } }),
    ];
    for (const [i, rules] of others.entries()) {
      expect(isAsodioNetRules(rules)).toBe(false);
      for (const state of randomAsodioPositions(30 + i, 8, 5, rules)) {
        expect(asodioNet.evaluate(state)).toEqual(asodioHeuristic.evaluate(state));
        const turns = asodio.legalTurns(state, state.dice as Dice);
        expect(scoreTurns(asodio, asodioNet, state, turns)).toEqual(
          scoreTurns(asodio, asodioHeuristic, state, turns),
        );
      }
    }
  });
});

describe('asodio net: evaluation', () => {
  it('gives numbers in range, and equity = 2·win − 1 + winDouble − loseDouble', () => {
    for (const state of randomAsodioPositions(3, 300)) {
      const e = asodioNet.evaluate(state);
      for (const p of [e.win, e.winDouble, e.loseDouble]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(e.equity).toBeCloseTo(2 * e.win - 1 + e.winDouble - e.loseDouble, 12);
    }
  });

  it('gives a pinned value for the start (catches a changed net or heuristic)', () => {
    // Some inputs come from the heuristic, so a retuned
    // `ASODIO_DEFAULT_WEIGHTS` changes this number: then retrain the net.
    const e = asodioNet.evaluate(start);
    expect(e.win).toBeCloseTo(0.5124611, 6);
    expect(e.equity).toBeCloseTo(0.0313972, 6);
  });

  it('uses the heuristic for a race and a mutual lock, with a draw as half a win', () => {
    let race = 0;
    let lock = 0;
    for (const state of randomAsodioPositions(8, 800, 1)) {
      if (netScores(state)) continue;
      const { roller, waiter, options } = sidesOf(state);
      if (mutualLock(roller, waiter, options)) lock += 1;
      else if (!asodioContact(roller, waiter)) race += 1;
      const net = asodioNet.evaluate(state);
      const heuristic = asodioHeuristic.evaluate(state);
      expect(net.equity).toBeCloseTo(heuristic.equity, 12);
      expect(net).toEqual(evaluateAsodioFallback(roller, waiter, options));
      expect(net.equity).toBeCloseTo(2 * net.win - 1 + net.winDouble - net.loseDouble, 12);
    }
    expect(race).toBeGreaterThan(0);
    expect(lock).toBeGreaterThan(0);
  });

  it('scores a sure draw (a mutual lock) as half a win', () => {
    const state = position(
      { points: { 16: 1, 18: 6, 8: 8 }, pinned: [16] },
      { points: { 17: 1, 13: 6, 9: 8 }, pinned: [17] },
    );
    expect(netScores(state)).toBe(false);
    expect(asodioNet.evaluate(state)).toEqual({ win: 0.5, winDouble: 0, loseDouble: 0, equity: 0 });
  });

  it('the fast path scores like the engine path', () => {
    const slow: Evaluator = {
      id: 'slow',
      variant: 'asodio',
      evaluate: (state) => asodioNet.evaluate(state),
    };
    let ended = 0;
    let compared = 0;
    for (const state of randomAsodioPositions(200, 150, 2)) {
      const turns = asodio.legalTurns(state, state.dice as Dice);
      const fast = scoreTurns(asodio, asodioNet, state, turns);
      const generic = scoreTurns(asodio, slow, state, turns);
      fast.forEach((s, j) => {
        expect(s.gameOver).toBe(generic[j]?.gameOver);
        expect(s.score).toBeCloseTo(generic[j]?.score ?? NaN, 12);
        if (s.gameOver) ended += 1;
        compared += 1;
      });
    }
    expect(compared).toBeGreaterThan(300);
    expect(ended).toBeGreaterThan(0);
  });
});
