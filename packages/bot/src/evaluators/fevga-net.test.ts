import { describe, expect, it } from 'vitest';

import { createBoard, fevga, opponent, resolveRules } from '@tavli/engine';
import type { Dice, GameState, PlayerId, RuleSet, SideLayout } from '@tavli/engine';

import { scoreTurns } from '../score';
import { randomFevgaPositions } from '../testing/random-fevga-positions';
import type { Evaluator } from '../types';
import { fevgaHasContact, fevgaSideOf } from './fevga-board';
import { fevgaHeuristic } from './fevga-heuristic';
import {
  FEVGA_NET_INPUTS,
  encodeFevga,
  fevgaNet,
  loadFevgaNet,
  shippedFevgaNet,
} from './fevga-net';
import { FEVGA_NET_V1 } from './fevga-net-weights';
import { createSparseInput } from './net';

const start = fevga.initialState({ startingPlayer: 'white' });

/** The dense inputs of a position, from the view of its player to move. */
function dense(state: GameState, target: number | null = 11): number[] {
  const input = createSparseInput(FEVGA_NET_INPUTS);
  encodeFevga(
    fevgaSideOf(state, state.toMove),
    fevgaSideOf(state, opponent(state.toMove)),
    target,
    input,
  );
  const out = new Array<number>(FEVGA_NET_INPUTS).fill(0);
  for (let k = 0; k < input.count; k += 1) out[input.index[k] ?? 0] = input.value[k] ?? 0;
  return out;
}

/** The same position with the colours swapped. */
function mirrored(state: GameState): GameState {
  const sideAsLayout = (player: PlayerId): SideLayout => {
    const side = fevgaSideOf(state, player);
    const points: Record<number, number> = {};
    for (let p = 1; p <= 24; p += 1) if ((side[p] ?? 0) > 0) points[p] = side[p] ?? 0;
    return { points, off: side[0] ?? 0 };
  };
  return {
    ...state,
    toMove: opponent(state.toMove),
    board: createBoard({ white: sideAsLayout('black'), black: sideAsLayout('white') }, 'parallel'),
  };
}

describe('fevga net: inputs', () => {
  it('encodes the start: 15 checkers on own 24, pips and the runner lock', () => {
    const x = dense(start);
    expect(x.slice(23 * 4, 23 * 4 + 4)).toEqual([1, 1, 1, 6]);
    expect(x.slice(96, 192)).toEqual(x.slice(0, 96));
    expect([x[192], x[193]]).toEqual([0, 0]);
    expect(x[194]).toBeCloseTo(3.6, 12);
    // The runner rule holds both sides at the start: lock 1, the runner still on 24.
    expect([x[196 + 5], x[196 + 6]]).toEqual([1, 1]);
    expect([x[206 + 5], x[206 + 6]]).toEqual([1, 1]);
    // 15 checkers on the start.
    expect(x[196 + 8]).toBe(1);
    expect(Math.abs(x[216] ?? 1)).toBeLessThan(0.1);
  });

  it('has no runner inputs when the rules have no runner rule', () => {
    const x = dense(start, null);
    expect([x[196 + 5], x[196 + 6], x[206 + 5], x[206 + 6]]).toEqual([0, 0, 0, 0]);
  });

  it('is the same for both colours (each from its own view)', () => {
    for (const state of randomFevgaPositions(4, 80)) {
      expect(dense(mirrored(state))).toEqual(dense(state));
    }
  });

  it('keeps every index in range, each at most once', () => {
    for (const state of randomFevgaPositions(6, 200)) {
      const input = createSparseInput(FEVGA_NET_INPUTS);
      encodeFevga(
        fevgaSideOf(state, state.toMove),
        fevgaSideOf(state, opponent(state.toMove)),
        11,
        input,
      );
      const seen = new Set<number>();
      for (let k = 0; k < input.count; k += 1) {
        const i = input.index[k] ?? -1;
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(FEVGA_NET_INPUTS);
        expect(seen.has(i)).toBe(false);
        seen.add(i);
      }
    }
  });
});

describe('fevga net: the shipped weights', () => {
  it('load, and stay under 100 KB', () => {
    const net = shippedFevgaNet();
    expect(net.inputs).toBe(FEVGA_NET_INPUTS);
    expect(net.hidden).toBeGreaterThanOrEqual(20);
    expect(net.w1.length).toBe(net.inputs * net.hidden);
    expect(FEVGA_NET_V1.data.length).toBeLessThan(100_000);
    for (const w of net.w1) expect(Number.isFinite(w)).toBe(true);
  });

  it('reject a file with the wrong sizes', () => {
    expect(() => loadFevgaNet({ ...FEVGA_NET_V1, inputs: 10 })).toThrow(RangeError);
    expect(() => loadFevgaNet({ ...FEVGA_NET_V1, hidden: FEVGA_NET_V1.hidden + 1 })).toThrow(
      RangeError,
    );
  });
});

describe('fevga net: evaluation', () => {
  it('gives numbers in range, and equity = 2·win − 1 + winDouble − loseDouble', () => {
    for (const state of randomFevgaPositions(3, 300)) {
      const e = fevgaNet.evaluate(state);
      for (const p of [e.win, e.winDouble, e.loseDouble]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(e.equity).toBeCloseTo(2 * e.win - 1 + e.winDouble - e.loseDouble, 12);
    }
  });

  it('gives a pinned value for the start (catches a changed net or heuristic)', () => {
    // The block inputs and the last input come from the heuristic, so a
    // retuned `FEVGA_DEFAULT_WEIGHTS` changes this number: then retrain the net.
    const e = fevgaNet.evaluate(start);
    expect(e.win).toBeCloseTo(0.5773012, 6);
    expect(e.equity).toBeCloseTo(0.2067275, 6);
  });

  it('uses the heuristic for a race (no contact)', () => {
    let races = 0;
    for (const state of randomFevgaPositions(8, 600, 1)) {
      const me = fevgaSideOf(state, state.toMove);
      const them = fevgaSideOf(state, opponent(state.toMove));
      if (fevgaHasContact(me, them)) continue;
      races += 1;
      expect(fevgaNet.evaluate(state)).toEqual(fevgaHeuristic.evaluate(state));
    }
    expect(races).toBeGreaterThan(0);
  });

  it('the fast path scores like the engine path, with and without the runner rule', () => {
    const slow: Evaluator = {
      id: 'slow',
      variant: 'fevga',
      evaluate: (state) => fevgaNet.evaluate(state),
    };
    const ruleSets: (RuleSet | undefined)[] = [
      undefined,
      resolveRules('fevga', { movement: { runnerRule: false } }),
    ];
    let compared = 0;
    for (const [i, rules] of ruleSets.entries()) {
      for (const state of randomFevgaPositions(300 + i, 50, 3)) {
        const s = rules === undefined ? state : { ...state, rules };
        const turns = fevga.legalTurns(s, s.dice as Dice);
        const fast = scoreTurns(fevga, fevgaNet, s, turns);
        const generic = scoreTurns(fevga, slow, s, turns);
        fast.forEach((score, j) => {
          expect(score.gameOver).toBe(generic[j]?.gameOver);
          expect(score.score).toBeCloseTo(generic[j]?.score ?? NaN, 12);
          compared += 1;
        });
      }
    }
    expect(compared).toBeGreaterThan(200);
  });
});
