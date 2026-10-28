/**
 * The fast shot count (#225) against the first one, kept as the reference
 * in `src/testing/asodio-shots-reference.ts`. Seeded positions of all three
 * Asodio presets, before and after turns, both players to roll.
 */

import { describe, expect, it } from 'vitest';

import { asodio, getPreset, opponent } from '@tavli/engine';
import type { Dice, PresetId } from '@tavli/engine';

import { countAsodioShotsReference } from '../testing/asodio-shots-reference';
import { randomAsodioPositions } from '../testing/random-asodio-positions';
import {
  PINNED,
  asodioOptions,
  asodioSideOf,
  canMove,
  lowestFrom,
  lowestPinnedQuarter,
  moveContext,
  playAsodioTurn,
} from './asodio-board';
import type { AsodioOptions, AsodioSide } from './asodio-board';
import { asodioShotFallbacks, countAsodioShots } from './asodio-shots';

const PRESETS: readonly (readonly [PresetId, number])[] = [
  ['asodio.kafeneio', 2251],
  ['asodio.aceyDeuceyGreek', 2252],
  ['asodio.aceyDeuceyAmerican', 2253],
];

/** Seeded positions: random game states, and the positions after some of their legal turns. */
function positions(preset: PresetId, seed: number, states: number): [AsodioSide, AsodioSide][] {
  const out: [AsodioSide, AsodioSide][] = [];
  for (const state of randomAsodioPositions(seed, states, 1, getPreset(preset))) {
    const me = asodioSideOf(state, state.toMove);
    const them = asodioSideOf(state, opponent(state.toMove));
    out.push([me, them]);
    for (const turn of asodio.legalTurns(state, state.dice as Dice).slice(0, 6)) {
      const [mine, theirs] = playAsodioTurn(me, them, turn);
      out.push([theirs, mine]);
    }
  }
  return out;
}

function hasPin(side: AsodioSide): boolean {
  for (let p = 1; p <= 24; p += 1) if (side[PINNED + p] === 1) return true;
  return false;
}

describe('the Asodio shot count', () => {
  it('gives the same result as the first version', { timeout: 60_000 }, () => {
    const fallbacksBefore = asodioShotFallbacks();
    let compared = 0;
    let pinned = 0;
    const wrong: string[] = [];
    for (const [preset, seed] of PRESETS) {
      const options = asodioOptions(getPreset(preset));
      for (const [a, b] of positions(preset, seed, 500)) {
        for (const [roller, waiter] of [
          [a, b],
          [b, a],
        ] as const) {
          if (hasPin(waiter)) pinned += 1;
          // The lock quarter the evaluator uses, and a fixed one.
          for (const lockQuarter of [2 - lowestPinnedQuarter(roller), 1]) {
            const fast = countAsodioShots(roller, waiter, options, lockQuarter);
            const first = countAsodioShotsReference(roller, waiter, options, lockQuarter);
            compared += 1;
            if (
              fast.any !== first.any ||
              fast.lock !== first.lock ||
              fast.perBlot.join() !== first.perBlot.join()
            ) {
              wrong.push(`${preset} ${JSON.stringify([roller, waiter, lockQuarter])}`);
            }
          }
        }
      }
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    expect(compared).toBeGreaterThan(25_000);
    // The set has pin positions, and some rolls took the first version.
    expect(pinned).toBeGreaterThan(800);
    expect(asodioShotFallbacks() - fallbacksBefore).toBeGreaterThan(0);
  });

  it('returns a new result when there is no target', () => {
    const options = asodioOptions(getPreset('asodio.kafeneio'));
    const state = asodio.initialState({
      startingPlayer: 'white',
      rules: getPreset('asodio.kafeneio'),
    });
    const white = asodioSideOf(state, 'white');
    const black = asodioSideOf(state, 'black');
    const first = countAsodioShots(white, black, options);
    (first.perBlot as number[])[3] = 99;
    expect(countAsodioShots(white, black, options).perBlot[3]).toBe(0);
  });
});

describe('lowestFrom', () => {
  it('never skips a point canMove accepts', () => {
    let checked = 0;
    const wrong: string[] = [];
    const check = (me: AsodioSide, them: AsodioSide, options: AsodioOptions, preset: string) => {
      const ctx = moveContext(me, options);
      for (let die = 1; die <= 6; die += 1) {
        const low = lowestFrom(die, ctx, options);
        for (let from = 1; from < low && from <= 24; from += 1) {
          checked += 1;
          if (canMove(me, them, from, die, ctx, options)) wrong.push(`${preset} ${from} ${die}`);
        }
      }
    };
    for (const [preset, seed] of PRESETS) {
      const options = asodioOptions(getPreset(preset));
      for (const [a, b] of positions(preset, seed + 10, 150)) {
        check(a, b, options, preset);
        check(b, a, options, preset);
      }
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    expect(checked).toBeGreaterThan(10_000);
  });
});
