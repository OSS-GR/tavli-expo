// Training for the Portes net (TD(λ) self-play). Dev only; CI never runs it.
// Run it from the repo root:
//
//   pnpm --filter @tavli/bot train -- train --out /tmp/portes-net --hidden 80 --games 200000
//   pnpm --filter @tavli/bot train -- eval --file /tmp/portes-net/best.json --games 1000
//   pnpm --filter @tavli/bot train -- export --file /tmp/portes-net/best.json
//
// `train` options: --out DIR (required), --hidden N (80), --games N (100000),
// --lambda X (0.7), --alpha X (0.1), --alpha-end X (0.02), --seed N (1),
// --warm N (positions for the supervised warm start, 0), --warm-epochs N (3),
// --eval-every N (10000), --eval-games N (1000), --from FILE (start net).
// It writes DIR/games-N.json checkpoints and DIR/best.json (the best match
// against medium so far), and logs to stdout.
//
// `eval`: --file FILE, --games N (1000), --seed N (1), --vs LEVEL (medium).
// `export`: --file FILE, --id ID (portes-net-v1), --notes TEXT (default: the file notes).
//   It writes FILE into src/evaluators/portes-net-weights.ts.
//
// All the logic is in `src/train/`. This file only connects it to Node.

import type { PortesNetFile } from '../src/evaluators/portes-net';
import { loadPortesNet } from '../src/evaluators/portes-net';
import { isBotLevel } from '../src/types';
import { netVsLevel } from '../src/train/arena';
import { train } from '../src/train/run';
import type { TrainOptions } from '../src/train/run';

// The package has no Node types (`"types": []`), so declare the little we use.
declare const process: { readonly argv: readonly string[]; exitCode?: number };
declare const console: { log(text: string): void; error(text: string): void };

interface Fs {
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, text: string): void;
  mkdirSync(path: string, options: { recursive: boolean }): void;
}
const fsModule = 'node:fs';
const fs = (await import(fsModule)) as Fs;

function flags(argv: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] ?? '';
    if (flag === '--') continue;
    if (!flag.startsWith('--')) throw new Error(`unexpected argument ${flag}`);
    out.set(flag.slice(2), argv[i + 1] ?? '');
    i += 1;
  }
  return out;
}

function number(options: Map<string, string>, key: string, fallback: number): number {
  const text = options.get(key);
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`--${key} must be a number, got ${text}`);
  return value;
}

function readNet(path: string): PortesNetFile {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as PortesNetFile;
}

function runTrain(options: Map<string, string>): void {
  const out = options.get('out');
  if (out === undefined || out === '') throw new Error('--out DIR is required');
  fs.mkdirSync(out, { recursive: true });
  const from = options.get('from');
  const start = from === undefined ? undefined : loadPortesNet(readNet(from));
  const base: TrainOptions = {
    hidden: number(options, 'hidden', 80),
    games: number(options, 'games', 100_000),
    lambda: number(options, 'lambda', 0.7),
    alpha: number(options, 'alpha', 0.1),
    alphaEnd: number(options, 'alpha-end', 0.02),
    seed: number(options, 'seed', 1),
    warmPositions: number(options, 'warm', 0),
    warmEpochs: number(options, 'warm-epochs', 3),
    evalEvery: number(options, 'eval-every', 10_000),
    evalGames: number(options, 'eval-games', 1000),
  };
  train(start === undefined ? base : { ...base, start }, {
    log: (text) => console.log(text),
    save: (name, file, best) => {
      const text = JSON.stringify(file);
      fs.writeFileSync(`${out}/${name}.json`, text);
      if (best) fs.writeFileSync(`${out}/best.json`, text);
    },
    now: () => Date.now(),
  });
}

function runEval(options: Map<string, string>): void {
  const file = options.get('file');
  if (file === undefined) throw new Error('--file FILE is required');
  const vs = options.get('vs') ?? 'medium';
  if (!isBotLevel(vs)) throw new Error(`unknown level ${vs}`);
  const started = Date.now();
  const net = loadPortesNet(readNet(file));
  const result = netVsLevel(net, number(options, 'games', 1000), number(options, 'seed', 1), vs);
  console.log(
    `${result.wins}/${result.games} wins vs ${vs} ` +
      `(${((100 * result.wins) / result.games).toFixed(1)} %), ` +
      `${result.pointsPerGame.toFixed(3)} points/game, ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}

function runExport(options: Map<string, string>): void {
  const file = options.get('file');
  if (file === undefined) throw new Error('--file FILE is required');
  const net = readNet(file);
  loadPortesNet(net); // Throws if the sizes are wrong.
  const id = options.get('id') ?? 'portes-net-v1';
  const notes = options.get('notes') ?? net.notes ?? '';
  // A single-quoted string, as Prettier writes it.
  const quote = (text: string): string => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  // pnpm runs package scripts in the package folder.
  const target = 'src/evaluators/portes-net-weights.ts';
  const text =
    `// The shipped Portes net. Written by \`pnpm --filter @tavli/bot train -- export\`.\n` +
    `// Do not edit by hand. Training notes: packages/bot/README.md, "The Portes net".\n\n` +
    `import type { PortesNetFile } from './portes-net';\n\n` +
    `export const PORTES_NET_V1: PortesNetFile = {\n` +
    `  id: ${quote(id)},\n` +
    `  inputs: ${net.inputs},\n` +
    `  hidden: ${net.hidden},\n` +
    `  notes: ${quote(notes)},\n` +
    `  data: '${net.data}',\n` +
    `};\n`;
  fs.writeFileSync(target, text);
  console.log(`wrote ${target} (${text.length} bytes)`);
}

try {
  const [mode, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
  const options = flags(rest);
  if (mode === 'train') runTrain(options);
  else if (mode === 'eval') runEval(options);
  else if (mode === 'export') runExport(options);
  else throw new Error('usage: train.ts train|eval|export [options] (see the file header)');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
