/**
 * The training loop for the Portes net: an optional supervised warm start
 * toward the heuristic, then TD(λ) self-play, with a match against medium
 * every `evalEvery` games. Dev only; `scripts/train.ts` runs it in Node.
 *
 * Pure apart from the callbacks: the clock and the files come from the caller.
 */

import { createSeededRng } from '@tavli/engine';

import type { PortesNet, PortesNetFile } from '../evaluators/portes-net';
import { netVsLevel } from './arena';
import type { MatchResult } from './arena';
import {
  createTrainScratch,
  createTrainableNet,
  heuristicPositions,
  supervisedEpoch,
  toNetFile,
  toTrainable,
  trainEpisode,
} from './td';

export interface TrainOptions {
  readonly hidden: number;
  /** Self-play games in all. */
  readonly games: number;
  readonly lambda: number;
  /** Learning rate at the start; it falls linearly to `alphaEnd`. */
  readonly alpha: number;
  readonly alphaEnd: number;
  readonly seed: number;
  /** Positions for the supervised warm start (0 = none). */
  readonly warmPositions: number;
  readonly warmEpochs: number;
  /** Play a match against medium every this many games (0 = never). */
  readonly evalEvery: number;
  readonly evalGames: number;
  /** Start from this net instead of random weights. */
  readonly start?: PortesNet;
}

export interface TrainCallbacks {
  log(text: string): void;
  /** Saves a checkpoint. `best` is true for the best match result so far. */
  save(name: string, file: PortesNetFile, best: boolean): void;
  now(): number;
}

export function train(options: TrainOptions, io: TrainCallbacks): void {
  const rng = createSeededRng(options.seed);
  const net =
    options.start === undefined
      ? createTrainableNet(options.hidden, rng)
      : toTrainable(options.start);
  const scratch = createTrainScratch(net);
  const started = io.now();
  const notes = (games: number): string =>
    `hidden ${net.hidden}, lambda ${options.lambda}, alpha ${options.alpha}→${options.alphaEnd}, ` +
    `seed ${options.seed}, warm start ${options.warmPositions}×${options.warmEpochs}, ` +
    `${games} self-play games`;

  if (options.warmPositions > 0) {
    const positions = heuristicPositions(options.warmPositions, options.seed + 1);
    for (let epoch = 0; epoch < options.warmEpochs; epoch += 1) {
      const error = supervisedEpoch(net, positions, 0.05, rng, scratch);
      io.log(`warm epoch ${epoch + 1}: win mse ${error.toFixed(5)}`);
    }
  }

  let best: MatchResult | undefined;
  const check = (games: number): void => {
    const file = toNetFile(net, `portes-net-${games}`, notes(games));
    if (options.evalEvery <= 0) {
      io.save(`games-${games}`, file, false);
      return;
    }
    const result = netVsLevel(net, options.evalGames, 1);
    const isBest = best === undefined || result.pointsPerGame > best.pointsPerGame;
    if (isBest) best = result;
    io.log(
      `games ${games}: ${result.wins}/${result.games} wins vs medium ` +
        `(${((100 * result.wins) / result.games).toFixed(1)} %), ` +
        `${result.pointsPerGame.toFixed(3)} points/game${isBest ? ' (best)' : ''}, ` +
        `${((io.now() - started) / 60_000).toFixed(1)} min`,
    );
    io.save(`games-${games}`, file, isBest);
  };
  check(0);

  let turns = 0;
  let races = 0;
  let error = 0;
  for (let game = 1; game <= options.games; game += 1) {
    const progress = (game - 1) / Math.max(1, options.games - 1);
    const alpha = options.alpha + (options.alphaEnd - options.alpha) * progress;
    const result = trainEpisode(
      net,
      rng,
      { lambda: options.lambda, alpha, startingPlayer: game % 2 === 0 ? 'white' : 'black' },
      scratch,
    );
    turns += result.turns;
    races += result.race ? 1 : 0;
    error += result.error;
    if (game % 1000 === 0) {
      io.log(
        `game ${game}: ${(turns / 1000).toFixed(1)} turns, ${(races / 10).toFixed(1)} % races, ` +
          `win mse ${(error / 1000).toFixed(4)}, alpha ${alpha.toFixed(4)}, ` +
          `${((io.now() - started) / 1000).toFixed(0)} s`,
      );
      turns = 0;
      races = 0;
      error = 0;
    }
    if (options.evalEvery > 0 && game % options.evalEvery === 0) check(game);
  }
  if (options.evalEvery <= 0 || options.games % options.evalEvery !== 0) check(options.games);
}
