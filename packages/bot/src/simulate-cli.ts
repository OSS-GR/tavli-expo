/**
 * The simulator command line, as pure functions. `scripts/simulate.ts` is the
 * thin Node wrapper that passes in `argv`, a logger and a clock.
 *
 *   pnpm --filter @tavli/bot simulate -- --games 1000 --a easy --b easy
 */

import { VARIANT_REGISTRY, getVariant } from '@tavli/engine';

import { createBot } from './create-bot';
import { simulate } from './simulate';
import type { SimulationResult } from './simulate';
import { isBotLevel } from './types';
import type { BotLevel } from './types';

export interface SimulateArgs {
  readonly games: number;
  readonly a: BotLevel;
  readonly b: BotLevel;
  readonly seed: number;
  readonly variant: string;
}

export const DEFAULT_SIMULATE_ARGS: SimulateArgs = {
  games: 1000,
  a: 'easy',
  b: 'easy',
  seed: 1,
  variant: 'portes',
};

export const SIMULATE_USAGE = [
  'Usage: pnpm --filter @tavli/bot simulate -- [options]',
  '  --games N       games to play (default 1000)',
  '  --a LEVEL       player A (White): random | easy | medium | hard (default easy)',
  '  --b LEVEL       player B (Black): random | easy | medium | hard (default easy)',
  '  --seed N        master seed (default 1)',
  '  --variant ID    variant id (default portes)',
].join('\n');

function parseInteger(flag: string, text: string | undefined, min: number): number {
  const value = Number(text);
  if (text === undefined || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${flag} needs a whole number >= ${min}, got ${text ?? 'nothing'}`);
  }
  return value;
}

function parseLevel(flag: string, text: string | undefined): BotLevel {
  if (!isBotLevel(text))
    throw new Error(`${flag} needs random, easy, medium or hard, got ${text ?? 'nothing'}`);
  return text;
}

/** Reads the flags. Throws an `Error` with a short message for bad input. */
export function parseSimulateArgs(argv: readonly string[]): SimulateArgs {
  let args = DEFAULT_SIMULATE_ARGS;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    // pnpm may pass the `--` separator through.
    if (flag === '--') continue;
    const value = argv[i + 1];
    i += 1;
    switch (flag) {
      case '--games':
        args = { ...args, games: parseInteger(flag, value, 1) };
        break;
      case '--seed':
        args = { ...args, seed: parseInteger(flag, value, 0) };
        break;
      case '--a':
        args = { ...args, a: parseLevel(flag, value) };
        break;
      case '--b':
        args = { ...args, b: parseLevel(flag, value) };
        break;
      case '--variant':
        if (value === undefined) throw new Error('--variant needs a variant id');
        args = { ...args, variant: value };
        break;
      default:
        throw new Error(`unknown option ${flag ?? ''}`);
    }
  }
  return args;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '0.0%' : `${((100 * part) / whole).toFixed(1)}%`;
}

/** A short text report. */
export function formatSimulationReport(
  args: SimulateArgs,
  result: SimulationResult,
  elapsedMs: number,
): string {
  const { completed } = result;
  const side = (name: string, level: BotLevel, i: 0 | 1): string =>
    `${name} (${level}): ${result.wins[i]} wins (${percent(result.wins[i], completed)}), ` +
    `mono ${result.mono[i]}, diplo ${result.diplo[i]}, points ${result.points[i]}`;
  return [
    `${args.variant}: ${result.games} games, seed ${args.seed}`,
    side('A, White', args.a, 0),
    side('B, Black', args.b, 1),
    `draws: ${result.draws}`,
    `average turns: ${result.averageTurns.toFixed(1)}`,
    `illegal turns: ${result.illegalTurns}, failed games: ${result.failures.length}`,
    `time: ${(elapsedMs / 1000).toFixed(2)} s (${(elapsedMs / Math.max(1, result.games)).toFixed(2)} ms per game)`,
  ].join('\n');
}

export interface CliIo {
  readonly log: (text: string) => void;
  readonly error: (text: string) => void;
  /** Milliseconds, for the time line only. */
  readonly now: () => number;
}

/** Runs the command. Returns the exit code: 0 ok, 1 failed games, 2 bad input. */
export function runSimulateCli(argv: readonly string[], io: CliIo): number {
  let args: SimulateArgs;
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      io.log(SIMULATE_USAGE);
      return 0;
    }
    args = parseSimulateArgs(argv);
    getVariant(VARIANT_REGISTRY, args.variant);
  } catch (error) {
    io.error(`${error instanceof Error ? error.message : String(error)}\n\n${SIMULATE_USAGE}`);
    return 2;
  }
  const bot = createBot();
  const start = io.now();
  const result = simulate({
    variant: getVariant(VARIANT_REGISTRY, args.variant),
    bots: [
      { bot, difficulty: args.a },
      { bot, difficulty: args.b },
    ],
    games: args.games,
    seed: args.seed,
  });
  io.log(formatSimulationReport(args, result, io.now() - start));
  const first = result.failures[0];
  if (first !== undefined) {
    io.error(
      `first failure: game ${first.game} (seed ${first.gameSeed}), turn ${first.turnNumber}: ${first.code} ${first.message}`,
    );
    return 1;
  }
  return 0;
}
