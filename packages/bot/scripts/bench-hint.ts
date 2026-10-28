// Measures one 2-ply hint (`rankTurns` with `plies: 2, top: 1`) per game and
// rules preset (#233). Run it from the repo root:
//
//   pnpm --filter @tavli/bot bench:hint
//   pnpm --filter @tavli/bot bench:hint -- asodio.kafeneio --seed=233
//   pnpm --filter @tavli/bot bench:hint -- --budget=none
//   pnpm --filter @tavli/bot bench:hint -- --budget=4000 --compare
//
// Each hint has the app's work budget for its preset (`TWO_PLY_HINT_BUDGETS`,
// #237), unless `--budget=N` sets one for every game (`none`: no budget). `--compare` also ranks
// each position with no budget (not timed) and prints how many hints the
// budget cut short (`cut`), and how many of those got another best turn.
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

import { sameTurn } from '@tavli/engine';
import type { Dice, GameState } from '@tavli/engine';

import { TWO_PLY_HINT_BUDGETS, createAnalyzer } from '../src/index';
import { HINT_WORK_GAMES, countingEvaluators, hintWorkPositions } from '../src/testing/hint-work';

// The package has no Node types (`"types": []`), so declare the little we use.
declare const console: { log(text: string): void };
declare const performance: { now(): number };
declare const process: { readonly argv: readonly string[] };

const PER_SOURCE = 250;

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const seedArg = args.find((arg) => arg.startsWith('--seed='));
const seed = seedArg === undefined ? 219 : Number(seedArg.slice('--seed='.length));
if (!Number.isInteger(seed)) throw new Error(`--seed must be an integer, got "${seedArg}"`);
const budgetArg = args.find((arg) => arg.startsWith('--budget='));
const budgetText = budgetArg?.slice('--budget='.length);
const fixedBudget =
  budgetText === undefined
    ? undefined
    : budgetText === 'none'
      ? Number.POSITIVE_INFINITY
      : Number(budgetText);
if (
  fixedBudget !== undefined &&
  fixedBudget !== Number.POSITIVE_INFINITY &&
  !(Number.isInteger(fixedBudget) && fixedBudget >= 0)
) {
  throw new Error(`--budget must be an integer >= 0 or "none", got "${budgetArg}"`);
}
const compare = args.includes('--compare');
const only = args.filter((arg) => !arg.startsWith('--'));
const unknown = only.filter((game) => !(HINT_WORK_GAMES as readonly string[]).includes(game));
if (unknown.length > 0) {
  throw new Error(`unknown game: ${unknown.join(', ')} (one of: ${HINT_WORK_GAMES.join(', ')})`);
}

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

console.log(
  `seed ${seed}, budget ${fixedBudget ?? "each preset's"}, ${2 * PER_SOURCE} positions per game`,
);
for (const game of HINT_WORK_GAMES) {
  if (only.length > 0 && !only.includes(game)) continue;
  const positions = hintWorkPositions(game, seed, PER_SOURCE);
  const budget = fixedBudget ?? TWO_PLY_HINT_BUDGETS[game];
  const { registry, count } = countingEvaluators();
  const analyzer = createAnalyzer({ evaluators: registry });
  const hint = (state: GameState) =>
    analyzer.rankTurns(state, state.dice as Dice, { plies: 2, top: 1, budget });
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
  let compared = '';
  if (compare) {
    let cut = 0;
    let other = 0;
    positions.forEach((state, i) => {
      const before = count();
      const [full] = analyzer.rankTurns(state, state.dice as Dice, { plies: 2, top: 1 });
      if (count() - before === counts[i]) return;
      cut += 1;
      const [short] = hint(state);
      if (full === undefined || short === undefined || !sameTurn(full.turn, short.turn)) {
        other += 1;
      }
    });
    compared = `; cut ${cut}, other best turn ${other}`;
  }
  console.log(
    `${game} (budget ${budget}): positions median ${median(counts)}, worst ${Math.max(...counts)}; ` +
      `ms median ${median(times).toFixed(1)}, worst ${Math.max(...times).toFixed(0)}` +
      compared,
  );
}
