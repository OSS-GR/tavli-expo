import { describe, expect, it } from 'vitest';

import { asodio, createBoard, getPreset, resolveRules } from '@tavli/engine';
import type { GameState, PlayerId, RuleSet, SideLayout } from '@tavli/engine';

import {
  asodioOptions,
  asodioSideOf,
  hasAnyMove,
  lowestPinnedQuarter,
  mutualLock,
  rearQuarter,
} from './asodio-board';
import {
  ASODIO_DEFAULT_WEIGHTS,
  asodioHeuristic,
  asodioTurnResult,
  evaluateAsodioSides,
} from './asodio-heuristic';
import { countAsodioShots } from './asodio-shots';

const KAFENEIO = getPreset('asodio.kafeneio');

function state(
  white: SideLayout,
  black: SideLayout,
  toMove: PlayerId = 'white',
  rules: RuleSet = KAFENEIO,
): GameState {
  const start = asodio.initialState({ startingPlayer: toMove, rules });
  return { ...start, board: createBoard({ white, black }, 'contrary') };
}

function sides(s: GameState) {
  return {
    white: asodioSideOf(s, 'white'),
    black: asodioSideOf(s, 'black'),
    options: asodioOptions(s.rules),
  };
}

describe('the Asodio board', () => {
  it('reads outside checkers as waiting at 25, and pins per side', () => {
    const s = state({ points: { 24: 2, 23: 1 }, outside: 12 }, { outside: 15 });
    const { white } = sides(s);
    expect(white[25]).toBe(12);
    expect(white[24]).toBe(2);
    expect(rearQuarter(white)).toBe(0);
    const pinned = state(
      { points: { 14: 2, 13: 13 } },
      { points: { 11: 1, 16: 14 }, pinned: [11] },
    );
    expect(lowestPinnedQuarter(sides(pinned).black)).toBe(2);
    expect(lowestPinnedQuarter(sides(pinned).white)).toBe(4);
  });

  it('agrees with the engine on "no move at all" (the deadlock test)', () => {
    // Both armies frozen behind a pinned lagging checker: A5, a draw.
    const s = state(
      { points: { 16: 1, 9: 14 }, pinned: [16] },
      { points: { 16: 1, 9: 14 }, pinned: [16] },
    );
    const { white, black, options } = sides(s);
    expect(hasAnyMove(white, black, options)).toBe(false);
    expect(hasAnyMove(black, white, options)).toBe(false);
    expect(asodio.result(s)).toMatchObject({ winner: null, reason: 'deadlock' });
    expect(asodioTurnResult(white, black, options)).toBe(0);
  });
});

describe('mutual lock', () => {
  // White's lone checker on White 16 (quarter 1) is pinned under Black's checkers on Black 9.
  // Black's lone checker on Black 17 (quarter 1) is pinned under White's checkers on White 8.
  // Each pinner sits in front of its own pinned rear, so it is frozen for good.
  const white = { points: { 16: 1, 18: 6, 8: 8 }, pinned: [16] };
  const black = { points: { 17: 1, 13: 6, 9: 8 }, pinned: [17] };

  it('is found, and the evaluator calls it a draw although checkers can still move', () => {
    const s = state(white, black);
    const { white: w, black: b, options } = sides(s);
    expect(mutualLock(w, b, options)).toBe(true);
    expect(hasAnyMove(w, b, options)).toBe(true);
    expect(asodio.result(s)).toBeNull();
    expect(asodioHeuristic.evaluate(s).equity).toBe(0);
  });

  it('needs pins, the quarter lock and frozen checkers that stay put', () => {
    const free = state(
      white,
      black,
      'white',
      resolveRules('asodio.kafeneio', { quarters: { moveInsideFrozenQuarter: true } }),
    );
    const f = sides(free);
    expect(mutualLock(f.white, f.black, f.options)).toBe(false);
    // A pin in home (quarter 3) never locks.
    const home = state(
      { points: { 4: 1, 8: 14 }, pinned: [4] },
      { points: { 17: 1, 21: 14 }, pinned: [17] },
    );
    const h = sides(home);
    expect(mutualLock(h.white, h.black, h.options)).toBe(false);
  });
});

describe('Asodio shots', () => {
  it('counts direct and combined shots, and a combined move stops at the quarter line', () => {
    // White's army is all in White 13–18. Black's lone rear checker is on Black 16 = White 9.
    const s = state({ points: { 14: 3, 13: 12 } }, { points: { 16: 1, 9: 14 } });
    const { white, black, options } = sides(s);
    const shots = countAsodioShots(white, black, options);
    // A 5 (from 14) or a 4 (from 13): 20 rolls. 1-4 is one of them. 2-3 does not count:
    // the first die already takes the checker over the line into quarter 2, where it freezes.
    expect(shots.perBlot[16]).toBe(20);
    expect(shots.any).toBe(20);
    expect(shots.lock).toBe(0);
  });

  it('a frozen checker cannot shoot', () => {
    // White's front checkers on White 10 are frozen (White's rear is on 20).
    const s = state({ points: { 20: 2, 10: 13 } }, { points: { 18: 1, 8: 14 } });
    const { white, black, options } = sides(s);
    // Black 18 = White 7: only the frozen checkers on 10 are close; 20 is 13 pips away.
    expect(countAsodioShots(white, black, options).any).toBe(0);
  });

  it('marks the shots that would lock both armies', () => {
    // White pins Black on Black 17 (quarter 1). Black shoots at White's lone checker on
    // White 15 (quarter 1) from Black 13: that pin would lock both armies.
    const s = state(
      { points: { 15: 1, 18: 6, 8: 8 } },
      { points: { 17: 1, 13: 6, 9: 8 }, pinned: [17] },
      'black',
    );
    const { white, black, options } = sides(s);
    const shots = countAsodioShots(black, white, options, 2 - lowestPinnedQuarter(black));
    expect(shots.any).toBeGreaterThan(0);
    expect(shots.lock).toBe(shots.any);
  });
});

describe('the Asodio evaluation', () => {
  const w = ASODIO_DEFAULT_WEIGHTS;

  it('stays in −2 … +2 and gives the start a small edge to the roller', () => {
    const start = asodio.initialState({ startingPlayer: 'white' });
    const e = asodioHeuristic.evaluate(start);
    expect(e.equity).toBeGreaterThan(-0.2);
    expect(e.equity).toBeLessThan(0.5);
    expect(e.win).toBeGreaterThan(0);
    expect(e.win).toBeLessThan(1);
  });

  it('scores a finished game as its points', () => {
    const s = state({ off: 15 }, { points: { 12: 15 } });
    const { white, black, options } = sides(s);
    expect(evaluateAsodioSides(white, black, w, options).equity).toBe(2);
    expect(evaluateAsodioSides(black, white, w, options).equity).toBe(-2);
    expect(asodioTurnResult(white, black, options)).toBe(2);
  });

  it('a pinned lagging checker is much worse than a free one', () => {
    const free = state({ points: { 16: 1, 9: 14 } }, { points: { 12: 2, 18: 13 } });
    const pinned = state(
      { points: { 16: 1, 9: 14 }, pinned: [16] },
      { points: { 9: 1, 12: 1, 18: 13 } },
    );
    const a = asodioHeuristic.evaluate(free).equity;
    const b = asodioHeuristic.evaluate(pinned).equity;
    expect(b).toBeLessThan(a - 0.5);
  });

  it('counts a waiting first entry (the gate) against the side', () => {
    const gated = state({ outside: 15 }, { points: { 24: 1, 23: 1 }, outside: 13 });
    const open = state(
      { points: { 24: 1, 23: 1 }, outside: 13 },
      { points: { 24: 1, 23: 1 }, outside: 13 },
    );
    expect(asodioHeuristic.evaluate(gated).equity).toBeLessThan(
      asodioHeuristic.evaluate(open).equity,
    );
  });
});
