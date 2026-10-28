// Measures one 2-ply hint (`rankTurns` with `plies: 2, top: 1`) per game and
// rules preset (#233). Run it from the repo root:
//
//   pnpm --filter @tavli/bot bench:hint
//   pnpm --filter @tavli/bot bench:hint -- asodio.kafeneio --seed=233
//
// It plays 500 seeded positions per game (250 from best play, 250 from
// random play: `src/testing/hint-work.ts`, the same positions as
// `analyzer-work.test.ts` with more of them). Per game it prints:
//
// - `positions`: how many positions the evaluator scores in one hint, the
//   median and the worst. This is what `analyzer-work.test.ts` bounds.
// - `ms`: the time of one hint, the median and the worst. The 5 slowest
//   positions run 3 more times and keep their fastest time, so one slow
//   moment of the machine does not make the worst.
//
// The README ("2-ply") compares the worst times: a game hints at 2 ply
// only when its worst hint is no slower than the slowest game that already
// does. Only this script reads the clock. CI does not run it.

import type { Dice, GameState } from '@tavli/engine';

import { createAnalyzer } from '../src/index';
import { HINT_WORK_GAMES, countingEvaluators, hintWorkPositions } from '../src/testing/hint-work';

// The package has no Node types (`"types": []`), so declare the little we use.
declare const console: { log(text: string): void };
declare const performance: { now(): number };
declare const process: { readonly argv: readonly string[] };

const PER_SOURCE = 250;

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const seedArg = args.find((arg) => arg.startsWith('--seed='));
const seed = seedArg === undefined ? 219 : Number(seedArg.slice('--seed='.length));
const only = args.filter((arg) => !arg.startsWith('--'));

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

console.log(`seed ${seed}, ${2 * PER_SOURCE} positions per game`);
for (const game of HINT_WORK_GAMES) {
  if (only.length > 0 && !only.includes(game)) continue;
  const positions = hintWorkPositions(game, seed, PER_SOURCE);
  const { registry, count } = countingEvaluators();
  const analyzer = createAnalyzer({ evaluators: registry });
  const hint = (state: GameState) =>
    analyzer.rankTurns(state, state.dice as Dice, { plies: 2, top: 1 });
  // Warm up the JIT.
  for (const state of positions.slice(0, 5)) hint(state);

  const counts: number[] = [];
  const times: number[] = [];
  for (const state of positions) {
    const before = count();
    const t0 = performance.now();
    hint(state);
    times.push(performance.now() - t0);
    counts.push(count() - before);
  }
  const slowest = times
    .map((ms, i) => [ms, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 5);
  for (const [, i] of slowest) {
    const state = positions[i] as GameState;
    for (let run = 0; run < 3; run += 1) {
      const t0 = performance.now();
      hint(state);
      times[i] = Math.min(times[i] ?? Infinity, performance.now() - t0);
    }
  }
  console.log(
    `${game}: positions median ${median(counts)}, worst ${Math.max(...counts)}; ` +
      `ms median ${median(times).toFixed(1)}, worst ${Math.max(...times).toFixed(0)}`,
  );
}
