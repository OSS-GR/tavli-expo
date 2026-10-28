/**
 * The golden test of the Asodio heuristic (#225): its scores on 2,100
 * seeded positions of all three Asodio presets must stay exactly the ones
 * saved in `asodio-heuristic.golden.json` (captured before the speed work).
 * A speed change must never change a score. See `src/testing/asodio-golden.ts`.
 */

import { describe, expect, it } from 'vitest';

import { getPreset } from '@tavli/engine';

import {
  GOLDEN_POSITIONS,
  GOLDEN_PRESETS,
  GOLDEN_TURN_POSITIONS,
  evaluationText,
  goldenStates,
  parseSideKey,
  positionLine,
  turnsLine,
} from '../testing/asodio-golden';
import { asodioOptions } from './asodio-board';
import { ASODIO_DEFAULT_WEIGHTS, asodioHeuristic, evaluateAsodioSides } from './asodio-heuristic';
import golden from './asodio-heuristic.golden.json';

type Fixture = Record<string, { positions: string[]; turns: string[] }>;
const fixture = golden as Fixture;

describe('the Asodio heuristic golden set', () => {
  it('has 2,100 positions, 700 per preset', () => {
    for (const [preset] of GOLDEN_PRESETS) {
      expect(fixture[preset]?.positions).toHaveLength(GOLDEN_POSITIONS);
      expect(fixture[preset]?.turns).toHaveLength(GOLDEN_TURN_POSITIONS);
    }
  });

  for (const [preset, seed] of GOLDEN_PRESETS) {
    it(`${preset}: gives the saved scores for the saved sides`, () => {
      const options = asodioOptions(getPreset(preset));
      const lines = fixture[preset]?.positions ?? [];
      const wrong: string[] = [];
      for (const line of lines) {
        const [roller = '', waiter = '', ...saved] = line.split(' ');
        const e = evaluateAsodioSides(
          parseSideKey(roller),
          parseSideKey(waiter),
          ASODIO_DEFAULT_WEIGHTS,
          options,
        );
        if (evaluationText(e) !== saved.join(' ')) wrong.push(line);
      }
      expect(wrong).toEqual([]);
    });

    it(`${preset}: gives the saved scores through evaluate and scoreTurns`, () => {
      const states = goldenStates(preset, seed);
      const saved = fixture[preset];
      // The positions come from seeded random games: if the engine plays
      // them differently, this fails here first.
      expect(states.map(positionLine)).toEqual(saved?.positions);
      for (const [i, state] of states.entries()) {
        const fields = saved?.positions[i]?.split(' ').slice(2).join(' ');
        expect(evaluationText(asodioHeuristic.evaluate(state))).toBe(fields);
      }
      expect(states.slice(0, GOLDEN_TURN_POSITIONS).map(turnsLine)).toEqual(saved?.turns);
    });
  }
});
