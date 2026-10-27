// Training for the nets (TD(λ) self-play). Dev only; CI never runs it.
// Run it from the repo root:
//
//   pnpm --filter @tavli/bot train -- train --game plakoto --out /tmp/plakoto-net --hidden 40
//   pnpm --filter @tavli/bot train -- eval --game plakoto --file /tmp/plakoto-net/best.json --games 1000 --seed 99
//   pnpm --filter @tavli/bot train -- export --game plakoto --file /tmp/plakoto-net/best.json
//
// Every mode takes --game portes|plakoto|fevga (default portes).
//
// `train` options: --out DIR (required), --hidden N (80), --games N (100000),
// --lambda X (0.7), --alpha X (0.1), --alpha-end X (0.02), --seed N (1),
// --warm N (positions for the supervised warm start, 0), --warm-epochs N (3),
// --eval-every N (10000), --eval-games N (1000), --eval-seed N (1000000; a
// match after G games uses seed N + G), --from FILE (start net).
// It writes DIR/games-N.json checkpoints and DIR/best.json (the best match
// against medium so far), and logs to stdout.
//
// `eval`: --file FILE, --games N (1000), --seed N (1), --vs LEVEL (medium).
// `export`: --file FILE, --id ID (<game>-net-v1), --notes TEXT (default: the file notes).
//   It writes FILE into src/evaluators/<game>-net-weights.ts.
//
// All the logic is in `src/train/`. This file only connects it to Node.

import { fevgaNetGame } from '../src/evaluators/fevga-net';
import { loadNet } from '../src/evaluators/net';
import type { NetFile, NetGame } from '../src/evaluators/net';
import { plakotoNetGame } from '../src/evaluators/plakoto-net';
import { portesNetGame } from '../src/evaluators/portes-net';
import { isBotLevel } from '../src/types';
import { numberFlag, parseFlags } from '../src/train/args';
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

const number = numberFlag;

function readNet(path: string): NetFile {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as NetFile;
}

/** Runs `run` with the `NetGame` named by `--game`. */
function withGame(options: Map<string, string>, run: <S, C>(game: NetGame<S, C>) => void): void {
  const name = options.get('game') ?? 'portes';
  if (name === 'portes') run(portesNetGame);
  else if (name === 'plakoto') run(plakotoNetGame);
  else if (name === 'fevga') run(fevgaNetGame);
  else throw new Error(`--game must be portes, plakoto or fevga, got ${name}`);
}

function runTrain<S, C>(game: NetGame<S, C>, options: Map<string, string>): void {
  const out = options.get('out');
  if (out === undefined) throw new Error('--out DIR is required');
  fs.mkdirSync(out, { recursive: true });
  const from = options.get('from');
  const start = from === undefined ? undefined : loadNet(readNet(from), game.inputs);
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
    evalSeed: number(options, 'eval-seed', 1_000_000),
  };
  train(game, start === undefined ? base : { ...base, start }, {
    log: (text) => console.log(text),
    save: (name, file, best) => {
      const text = JSON.stringify(file);
      fs.writeFileSync(`${out}/${name}.json`, text);
      if (best) fs.writeFileSync(`${out}/best.json`, text);
    },
    now: () => Date.now(),
  });
}

function runEval<S, C>(game: NetGame<S, C>, options: Map<string, string>): void {
  const file = options.get('file');
  if (file === undefined) throw new Error('--file FILE is required');
  const vs = options.get('vs') ?? 'medium';
  if (!isBotLevel(vs)) throw new Error(`unknown level ${vs}`);
  const started = Date.now();
  const net = loadNet(readNet(file), game.inputs);
  const games = number(options, 'games', 1000);
  const result = netVsLevel(game, net, games, number(options, 'seed', 1), vs);
  console.log(
    `${result.wins}/${result.games} wins vs ${vs} ` +
      `(${((100 * result.wins) / result.games).toFixed(1)} %, ${result.draws} draws), ` +
      `${result.pointsPerGame.toFixed(3)} points/game, ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}

/** A single-quoted string, as Prettier writes it: newlines and other escapes stay escaped. */
function quote(text: string): string {
  const escaped = JSON.stringify(text).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function runExport<S, C>(game: NetGame<S, C>, options: Map<string, string>): void {
  const file = options.get('file');
  if (file === undefined) throw new Error('--file FILE is required');
  const net = readNet(file);
  loadNet(net, game.inputs); // Throws if the sizes are wrong.
  const name = game.variant.id;
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  const id = options.get('id') ?? `${name}-net-v1`;
  const notes = options.get('notes') ?? net.notes ?? '';
  // pnpm runs package scripts in the package folder.
  const target = `src/evaluators/${name}-net-weights.ts`;
  const notesLine = `  notes: ${quote(notes)},`;
  const text =
    `// The shipped ${title} net. Written by \`pnpm --filter @tavli/bot train -- export\`.\n` +
    `// Do not edit by hand. Training notes: packages/bot/README.md, "The ${title} net".\n\n` +
    `import type { NetFile } from './net';\n\n` +
    `export const ${name.toUpperCase()}_NET_V1: NetFile = {\n` +
    `  id: ${quote(id)},\n` +
    `  inputs: ${net.inputs},\n` +
    `  hidden: ${net.hidden},\n` +
    // Prettier moves a long value to its own line (print width 100).
    (notesLine.length > 100 ? `  notes:\n    ${quote(notes)},\n` : `${notesLine}\n`) +
    `  data: '${net.data}',\n` +
    `};\n`;
  fs.writeFileSync(target, text);
  console.log(`wrote ${target} (${text.length} bytes)`);
}

try {
  const [mode, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
  const options = parseFlags(rest);
  if (mode === 'train') withGame(options, (game) => runTrain(game, options));
  else if (mode === 'eval') withGame(options, (game) => runEval(game, options));
  else if (mode === 'export') withGame(options, (game) => runExport(game, options));
  else throw new Error('usage: train.ts train|eval|export [options] (see the file header)');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
