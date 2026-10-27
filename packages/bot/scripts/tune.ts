// Weight tuning by self-play. Run it from the repo root:
//
//   pnpm --filter @tavli/bot tune -- --games 1000 --rounds 2
//
// Options: --games N (per candidate, default 600), --rounds N (default 1),
// --step X (first relative step, default 0.3), --min-gain X (points per game
// a candidate must win by, default 0.03), --seed N (default 1),
// --keys a,b,c (default: all scalar weights).
//
// All the logic is in `src/tune.ts`. This file only connects it to Node.
// It is optional and slow, and CI does not run it.

import { SCALAR_WEIGHTS, tune } from '../src/tune';
import type { ScalarWeight, TuneOptions } from '../src/tune';

declare const process: { readonly argv: readonly string[]; exitCode?: number };
declare const console: { log(text: string): void; error(text: string): void };

function parse(argv: readonly string[]): TuneOptions {
  let options: TuneOptions = { games: 600, rounds: 1, step: 0.3, minGain: 0.03, seed: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--') continue;
    const value = argv[i + 1] ?? '';
    i += 1;
    const number = Number(value);
    switch (flag) {
      case '--games':
        options = { ...options, games: number };
        break;
      case '--rounds':
        options = { ...options, rounds: number };
        break;
      case '--step':
        options = { ...options, step: number };
        break;
      case '--min-gain':
        options = { ...options, minGain: number };
        break;
      case '--seed':
        options = { ...options, seed: number };
        break;
      case '--keys': {
        const keys = value.split(',') as ScalarWeight[];
        const bad = keys.filter((key) => !SCALAR_WEIGHTS.includes(key));
        if (bad.length > 0) throw new Error(`unknown weights: ${bad.join(', ')}`);
        options = { ...options, keys };
        break;
      }
      default:
        throw new Error(`unknown option ${flag ?? ''}`);
    }
  }
  if (!(options.games >= 2 && options.rounds >= 1 && options.step > 0)) {
    throw new Error('--games must be >= 2, --rounds >= 1 and --step > 0');
  }
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  const started = Date.now();
  const result = tune({ ...options, log: (text) => console.log(text) });
  console.log('');
  console.log(
    result.changes.length === 0
      ? 'no weight changed'
      : `changed: ${result.changes.map((c) => `${c.key} ${c.from} → ${c.to}`).join(', ')}`,
  );
  const { check } = result;
  console.log(
    `check (best vs start, ${check.games} fresh games): ${check.wins} wins, ` +
      `${check.pointsPerGame >= 0 ? '+' : ''}${check.pointsPerGame.toFixed(3)} points/game`,
  );
  console.log(`best weights:\n${JSON.stringify(result.weights, null, 2)}`);
  console.log(`time: ${((Date.now() - started) / 1000).toFixed(1)} s`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
