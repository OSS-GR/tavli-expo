/**
 * Weight tuning by self-play (docs/architecture/bot-ai.md, section 4.2):
 * a coordinate search, one weight at a time.
 *
 * For each scalar weight, try it `× (1 + step)` and `× (1 − step)`. Each
 * candidate plays `games` medium-vs-medium games against the current best
 * weights: half with each colour, on the same dice seeds (paired games, so
 * the luck of the dice mostly cancels out). Keep the candidate if it wins
 * more than `minGain` points per game. After each round, halve the step.
 * At the end, the best weights play a fresh match against the start weights.
 *
 * Pure: no clock, no `Math.random`. `scripts/tune.ts` runs it from Node:
 *
 *   pnpm --filter @tavli/bot tune -- --games 1000 --rounds 2
 *
 * It is slow on purpose (thousands of games) and is not part of CI.
 */

import { portes } from '@tavli/engine';

import { createBot } from './create-bot';
import { PORTES_DEFAULT_WEIGHTS, createPortesHeuristic } from './evaluators/portes-heuristic';
import type { PortesWeights } from './evaluators/portes-heuristic';
import { simulate } from './simulate';

/** The weights that are single numbers (the shape tables stay fixed). */
export type ScalarWeight = {
  [K in keyof PortesWeights]: PortesWeights[K] extends number ? K : never;
}[keyof PortesWeights];

export const SCALAR_WEIGHTS: readonly ScalarWeight[] = (
  Object.keys(PORTES_DEFAULT_WEIGHTS) as (keyof PortesWeights)[]
).filter((key): key is ScalarWeight => typeof PORTES_DEFAULT_WEIGHTS[key] === 'number');

export interface MatchResult {
  readonly games: number;
  /** Games won by the candidate. */
  readonly wins: number;
  /** (candidate points − baseline points) / games. */
  readonly pointsPerGame: number;
}

/** Plays `games` paired medium-vs-medium games (half per colour, same seeds). */
export function playMatch(
  candidate: PortesWeights,
  baseline: PortesWeights,
  games: number,
  seed: number,
): MatchResult {
  const bot = (weights: PortesWeights) =>
    createBot({ evaluators: new Map([['portes', { medium: createPortesHeuristic(weights) }]]) });
  const a = { bot: bot(candidate), difficulty: 'medium' as const };
  const b = { bot: bot(baseline), difficulty: 'medium' as const };
  const half = Math.max(1, Math.floor(games / 2));
  const first = simulate({ variant: portes, bots: [a, b], games: half, seed });
  const second = simulate({ variant: portes, bots: [b, a], games: half, seed });
  const played = 2 * half;
  const wins = first.wins[0] + second.wins[1];
  const points = first.points[0] + second.points[1] - first.points[1] - second.points[0];
  return { games: played, wins, pointsPerGame: points / played };
}

export interface TuneOptions {
  /** Games per candidate. */
  readonly games: number;
  /** Passes over all weights. */
  readonly rounds: number;
  /** The first relative step, for example 0.3 = ±30 %. */
  readonly step: number;
  /** Keep a candidate only if it wins more points per game than this. */
  readonly minGain: number;
  readonly seed: number;
  /** The weights to tune. Default: all scalar weights. */
  readonly keys?: readonly ScalarWeight[];
  /** The start weights. Default: `PORTES_DEFAULT_WEIGHTS`. */
  readonly start?: PortesWeights;
  readonly log?: (text: string) => void;
}

export interface TuneResult {
  readonly weights: PortesWeights;
  /** The weights that changed, old → new. */
  readonly changes: readonly { key: ScalarWeight; from: number; to: number }[];
  /** The final check: best weights against the start weights, on fresh seeds. */
  readonly check: MatchResult;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function tune(options: TuneOptions): TuneResult {
  const start = options.start ?? PORTES_DEFAULT_WEIGHTS;
  const keys = options.keys ?? SCALAR_WEIGHTS;
  const log = options.log ?? (() => {});
  let best = start;
  let step = options.step;
  let seed = options.seed;

  for (let round = 1; round <= options.rounds; round += 1) {
    log(`round ${round}: step ±${Math.round(step * 100)}%`);
    for (const key of keys) {
      const value = best[key];
      for (const factor of [1 + step, 1 - step]) {
        const tried = round3(value === 0 ? step * factor : value * factor);
        const candidate: PortesWeights = { ...best, [key]: tried };
        seed += 1;
        const result = playMatch(candidate, best, options.games, seed);
        const gain = result.pointsPerGame;
        const kept = gain > options.minGain;
        log(
          `  ${key} ${value} → ${tried}: ${gain >= 0 ? '+' : ''}${gain.toFixed(3)} points/game, ` +
            `${result.wins}/${result.games} wins${kept ? '  KEPT' : ''}`,
        );
        if (kept) {
          best = candidate;
          break;
        }
      }
    }
    step /= 2;
  }

  const changes = keys
    .filter((key) => best[key] !== start[key])
    .map((key) => ({ key, from: start[key], to: best[key] }));
  const check = playMatch(best, start, options.games * 2, options.seed + 1_000_000);
  return { weights: best, changes, check };
}
