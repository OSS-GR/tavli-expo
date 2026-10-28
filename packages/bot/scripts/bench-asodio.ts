// Times the Asodio heuristic on the golden positions (#225). Run it from the
// repo root:
//
//   pnpm --filter @tavli/bot bench:asodio
//
// Per preset it prints two numbers, both the best of 5 runs after a warm-up:
//
// - `evaluate`: one `evaluateAsodioSides` call (a position before the roll);
// - `per turn`: `scoreTurns` on every legal turn, divided by the turns. This
//   is what a bot or a 2-ply hint pays for each position it looks at. In the
//   Acey-Deucey presets it includes the engine's `applyTurn` and `result`.
//
// Only this script reads the clock. CI does not run it.

import { asodio, getPreset, opponent } from '@tavli/engine';
import type { Dice, GameState, Turn } from '@tavli/engine';

import { asodioOptions, asodioSideOf } from '../src/evaluators/asodio-board';
import type { AsodioSide } from '../src/evaluators/asodio-board';
import { ASODIO_DEFAULT_WEIGHTS, evaluateAsodioSides } from '../src/evaluators/asodio-heuristic';
import { GOLDEN_PRESETS, goldenStates, heuristicScoreTurns } from '../src/testing/asodio-golden';

// The package has no Node types (`"types": []`), so declare the little we use.
declare const console: { log(text: string): void };
declare const performance: { now(): number };
declare const process: { readonly argv: readonly string[] };

const RUNS = 5;

/** The fastest of `RUNS` runs of `work`, in ms, after one warm-up run. */
function fastest(work: () => void): number {
  work();
  let best = Infinity;
  for (let run = 0; run < RUNS; run += 1) {
    const t0 = performance.now();
    work();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

// `-- asodio.kafeneio` times one preset only.
const only = process.argv.slice(2).filter((arg) => arg !== '--');

let sink = 0;
for (const [preset, seed] of GOLDEN_PRESETS) {
  if (only.length > 0 && !only.includes(preset)) continue;
  const options = asodioOptions(getPreset(preset));
  const states = goldenStates(preset, seed);
  const sides: [AsodioSide, AsodioSide][] = states.map((s) => [
    asodioSideOf(s, s.toMove),
    asodioSideOf(s, opponent(s.toMove)),
  ]);
  const evaluateMs = fastest(() => {
    for (let rep = 0; rep < 5; rep += 1) {
      for (const [roller, waiter] of sides) {
        sink += evaluateAsodioSides(roller, waiter, ASODIO_DEFAULT_WEIGHTS, options).equity;
      }
    }
  });
  const withTurns: [GameState, readonly Turn[]][] = states.map((s) => [
    s,
    asodio.legalTurns(s, s.dice as Dice),
  ]);
  let turns = 0;
  for (const [, list] of withTurns) turns += list.length;
  const turnsMs = fastest(() => {
    for (const [state, list] of withTurns) {
      for (const score of heuristicScoreTurns(state, list)) sink += score.score;
    }
  });
  const perEvaluate = (evaluateMs * 1000) / (5 * sides.length);
  const perTurn = (turnsMs * 1000) / turns;
  console.log(
    `${preset}: evaluate ${perEvaluate.toFixed(1)} µs, per turn ${perTurn.toFixed(1)} µs (${turns} turns)`,
  );
}
if (Number.isNaN(sink)) console.log('NaN');
