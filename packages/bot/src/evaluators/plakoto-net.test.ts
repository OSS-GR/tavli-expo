import { describe, expect, it } from 'vitest';

import { createBoard, getPreset, opponent, plakoto, resolveRules } from '@tavli/engine';
import type { Dice, GameState, PlayerId, RuleSet, SideLayout } from '@tavli/engine';

import { scoreTurns } from '../score';
import { randomPlakotoPositions } from '../testing/random-plakoto-positions';
import type { Evaluator } from '../types';
import { createSparseInput } from './net';
import { motherPinned, plakotoContact, plakotoSideOf } from './plakoto-board';
import { plakotoHeuristic } from './plakoto-heuristic';
import {
  PLAKOTO_NET_INPUTS,
  encodePlakoto,
  loadPlakotoNet,
  plakotoNet,
  plakotoNetGame,
  shippedPlakotoNet,
} from './plakoto-net';
import { PLAKOTO_NET_V1 } from './plakoto-net-weights';

const start = plakoto.initialState({ startingPlayer: 'white' });

function position(
  white: SideLayout,
  black: SideLayout,
  toMove: PlayerId = 'white',
  rules: RuleSet = getPreset('plakoto'),
): GameState {
  const first = plakoto.initialState({ startingPlayer: toMove, rules });
  return { ...first, board: createBoard({ white, black }, 'contrary') };
}

/** The dense inputs of a position, from the view of its player to move. */
function dense(state: GameState): number[] {
  const input = createSparseInput(PLAKOTO_NET_INPUTS);
  encodePlakoto(
    plakotoSideOf(state, state.toMove),
    plakotoSideOf(state, opponent(state.toMove)),
    input,
  );
  const out = new Array<number>(PLAKOTO_NET_INPUTS).fill(0);
  for (let k = 0; k < input.count; k += 1) out[input.index[k] ?? 0] = input.value[k] ?? 0;
  return out;
}

/** The same position with the colours swapped (the board turned around). */
function mirrored(state: GameState): GameState {
  const swap = (p: PlayerId | null): PlayerId | null => (p === null ? null : opponent(p));
  return {
    ...state,
    toMove: opponent(state.toMove),
    board: {
      ...state.board,
      points: [...state.board.points]
        .reverse()
        .map((p) => ({ white: p.black, black: p.white, pinned: swap(p.pinned) })),
      off: { white: state.board.off.black, black: state.board.off.white },
    },
  };
}

/** True when the net (not the heuristic) scores this state. */
function netScores(state: GameState): boolean {
  return plakotoNetGame.usesNet(
    plakotoSideOf(state, state.toMove),
    plakotoSideOf(state, opponent(state.toMove)),
    state.rules.mother,
  );
}

describe('plakoto net: inputs', () => {
  it('encodes the start: 15 checkers on own 24, pips, no pins, no lone mother', () => {
    const x = dense(start);
    expect(x.slice(23 * 4, 23 * 4 + 4)).toEqual([1, 1, 1, 6]);
    expect(x.slice(96, 192)).toEqual(x.slice(0, 96));
    expect(x.slice(192, 244).every((v) => v === 0)).toBe(true);
    expect(x[244]).toBeCloseTo(3.6, 12);
    expect(x[245]).toBeCloseTo(3.6, 12);
    expect(x.slice(246, 250)).toEqual([0, 0, 0, 0]);
    expect(Math.abs(x[250] ?? 1)).toBeLessThan(0.1);
  });

  it('sets the pin units, the lone mothers and the mother shots', () => {
    // White pins Black's checker on Black's own 20 (White's 5). Black's mother
    // is alone on Black's 24 (White's 1), 3 pips in front of White's 4.
    const state = position(
      { points: { 24: 10, 4: 2, 5: 1, 13: 2 } },
      { points: { 24: 1, 20: 1, 13: 6, 18: 7 }, pinned: [20] },
    );
    const x = dense(state);
    // The waiter's pin unit for its own 20.
    expect(x[192 + 24 + 19]).toBe(1);
    // No roller checker is pinned.
    expect(x.slice(192, 216).every((v) => v === 0)).toBe(true);
    // The waiter has a lone mother; the roller does not (10 on its start).
    expect([x[240], x[241]]).toEqual([0, 1]);
    // The roller can pin the mother with some rolls.
    expect(x[248]).toBeGreaterThan(0);
    expect(x[246]).toBeGreaterThanOrEqual(x[248] ?? 0);
  });

  it('is the same for both colours (each from its own view)', () => {
    for (const state of randomPlakotoPositions(4, 80)) {
      expect(dense(mirrored(state))).toEqual(dense(state));
    }
  });

  it('keeps every index in range, each at most once', () => {
    for (const state of randomPlakotoPositions(6, 200)) {
      const input = createSparseInput(PLAKOTO_NET_INPUTS);
      encodePlakoto(
        plakotoSideOf(state, state.toMove),
        plakotoSideOf(state, opponent(state.toMove)),
        input,
      );
      const seen = new Set<number>();
      for (let k = 0; k < input.count; k += 1) {
        const i = input.index[k] ?? -1;
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(PLAKOTO_NET_INPUTS);
        expect(seen.has(i)).toBe(false);
        seen.add(i);
      }
    }
  });
});

describe('plakoto net: the shipped weights', () => {
  it('load, and stay under 100 KB', () => {
    const net = shippedPlakotoNet();
    expect(net.inputs).toBe(PLAKOTO_NET_INPUTS);
    expect(net.hidden).toBeGreaterThanOrEqual(20);
    expect(net.w1.length).toBe(net.inputs * net.hidden);
    expect(PLAKOTO_NET_V1.data.length).toBeLessThan(100_000);
    for (const w of net.w1) expect(Number.isFinite(w)).toBe(true);
  });

  it('reject a file with the wrong sizes', () => {
    expect(() => loadPlakotoNet({ ...PLAKOTO_NET_V1, inputs: 10 })).toThrow(RangeError);
    expect(() => loadPlakotoNet({ ...PLAKOTO_NET_V1, hidden: PLAKOTO_NET_V1.hidden + 1 })).toThrow(
      RangeError,
    );
  });
});

describe('plakoto net: evaluation', () => {
  it('gives numbers in range, and equity = 2·win − 1 + winDouble − loseDouble', () => {
    for (const state of randomPlakotoPositions(3, 300)) {
      const e = plakotoNet.evaluate(state);
      for (const p of [e.win, e.winDouble, e.loseDouble]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
      expect(e.equity).toBeCloseTo(2 * e.win - 1 + e.winDouble - e.loseDouble, 12);
    }
  });

  it('gives a pinned value for the start (catches a changed net or heuristic)', () => {
    // The last input is the heuristic's contact score, so a retuned
    // `PLAKOTO_DEFAULT_WEIGHTS` changes this number: then retrain the net.
    const e = plakotoNet.evaluate(start);
    expect(e.win).toBeCloseTo(0.5119029, 6);
    expect(e.equity).toBeCloseTo(0.0382461, 6);
  });

  it('uses the heuristic for a race and for a pinned mother', () => {
    let race = 0;
    let mother = 0;
    for (const state of randomPlakotoPositions(8, 800, 1)) {
      if (netScores(state)) continue;
      const me = plakotoSideOf(state, state.toMove);
      const them = plakotoSideOf(state, opponent(state.toMove));
      if (motherPinned(me) || motherPinned(them)) mother += 1;
      else if (!plakotoContact(me, them)) race += 1;
      expect(plakotoNet.evaluate(state)).toEqual(plakotoHeuristic.evaluate(state));
    }
    expect(race).toBeGreaterThan(0);
    expect(mother).toBeGreaterThan(0);
  });

  it('likes a pinned opponent checker deep in its home', () => {
    // White to roll. In `pinning`, White pins Black's checker on Black's 20
    // (White's 5); in `free`, White's checker is one point lower.
    const free = position(
      { points: { 24: 8, 13: 4, 6: 2, 4: 1 } },
      { points: { 24: 8, 20: 1, 13: 4, 8: 2 } },
    );
    const pinning = position(
      { points: { 24: 8, 13: 4, 6: 2, 5: 1 } },
      { points: { 24: 8, 20: 1, 13: 4, 8: 2 }, pinned: [20] },
    );
    expect(plakotoNet.evaluate(pinning).equity).toBeGreaterThan(plakotoNet.evaluate(free).equity);
  });

  it('the fast path scores like the engine path, for every mother rule', () => {
    const slow: Evaluator = {
      id: 'slow',
      variant: 'plakoto',
      evaluate: (state) => plakotoNet.evaluate(state),
    };
    const ruleSets: RuleSet[] = [
      getPreset('plakoto'),
      getPreset('plakoto.federation'),
      resolveRules('plakoto', { mother: { motherRule: 'instant' } }),
      resolveRules('plakoto', { mother: { motherCheckTiming: 'endOfTurn' } }),
    ];
    let ended = 0;
    for (const [i, rules] of ruleSets.entries()) {
      for (const state of randomPlakotoPositions(200 + i, 40, 3, rules)) {
        const turns = plakoto.legalTurns(state, state.dice as Dice);
        const fast = scoreTurns(plakoto, plakotoNet, state, turns);
        const generic = scoreTurns(plakoto, slow, state, turns);
        fast.forEach((s, j) => {
          expect(s.gameOver).toBe(generic[j]?.gameOver);
          expect(s.score).toBeCloseTo(generic[j]?.score ?? NaN, 12);
          if (s.gameOver) ended += 1;
        });
      }
    }
    expect(ended).toBeGreaterThan(0);
  });
});
