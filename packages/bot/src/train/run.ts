/**
 * The training loop for a net: an optional supervised warm start toward the
 * heuristic, then TD(λ) self-play, with a match against medium every
 * `evalEvery` games. Dev only; `scripts/train.ts` runs it in Node.
 *
 * Each match uses its own seed (`evalSeed + games`), so the best checkpoint
 * is not picked by its luck on one fixed set of dice. Still, play the best
 * checkpoints again on a fresh seed before you ship one
 * (`train -- eval --seed N`).
 *
 * Pure apart from the callbacks: the clock and the files come from the caller.
 */

import { createSeededRng } from '@tavli/engine';

import type { Net, NetFile, NetGame } from '../evaluators/net';
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
  /** Learning rate at the start; it falls linearly to `alphaEnd`. The warm start uses `alpha`. */
  readonly alpha: number;
  readonly alphaEnd: number;
  readonly seed: number;
  /** Positions for the supervised warm start (0 = none). */
  readonly warmPositions: number;
  readonly warmEpochs: number;
  /** Play a match against medium every this many games (0 = never). */
  readonly evalEvery: number;
  readonly evalGames: number;
  /** The match seeds: `evalSeed + games played` (default 1,000,000). */
  readonly evalSeed?: number;
  /** Start from this net instead of random weights. */
  readonly start?: Net;
}

export interface TrainCallbacks {
  log(text: string): void;
  /** Saves a checkpoint. `best` is true for the best match result so far. */
  save(name: string, file: NetFile, best: boolean): void;
  now(): number;
}

export function train<S, C>(game: NetGame<S, C>, options: TrainOptions, io: TrainCallbacks): void {
  const rng = createSeededRng(options.seed);
  const net =
    options.start === undefined
      ? createTrainableNet(game.inputs, options.hidden, rng)
      : toTrainable(options.start);
  if (net.inputs !== game.inputs) {
    throw new RangeError(
      `the start net has ${net.inputs} inputs, ${game.variant.id} needs ${game.inputs}`,
    );
  }
  const id = game.variant.id;
  const scratch = createTrainScratch(net);
  const started = io.now();
  const notes = (games: number): string =>
    `hidden ${net.hidden}, lambda ${options.lambda}, alpha ${options.alpha}→${options.alphaEnd}, ` +
    `seed ${options.seed}, warm start ${options.warmPositions}×${options.warmEpochs}, ` +
    `${games} self-play games`;

  if (options.warmPositions > 0) {
    const positions = heuristicPositions(game, options.warmPositions, options.seed + 1);
    const context = game.context(game.variant.initialState({ startingPlayer: 'white' }).rules);
    for (let epoch = 0; epoch < options.warmEpochs; epoch += 1) {
      const error = supervisedEpoch(game, net, positions, context, options.alpha, rng, scratch);
      io.log(`warm epoch ${epoch + 1}: win mse ${error.toFixed(5)}`);
    }
  }

  let best: MatchResult | undefined;
  const evalSeed = options.evalSeed ?? 1_000_000;
  const check = (games: number): void => {
    const file = toNetFile(net, `${id}-net-${games}`, notes(games), id);
    if (options.evalEvery <= 0) {
      io.save(`games-${games}`, file, false);
      return;
    }
    const result = netVsLevel(game, net, options.evalGames, evalSeed + games);
    const isBest = best === undefined || result.pointsPerGame > best.pointsPerGame;
    if (isBest) best = result;
    io.log(
      `games ${games}: ${result.wins}/${result.games} wins vs medium ` +
        `(${((100 * result.wins) / result.games).toFixed(1)} %, ${result.draws} draws), ` +
        `${result.pointsPerGame.toFixed(3)} points/game${isBest ? ' (best)' : ''}, ` +
        `${((io.now() - started) / 60_000).toFixed(1)} min`,
    );
    io.save(`games-${games}`, file, isBest);
  };

  let turns = 0;
  let handOffs = 0;
  let dropped = 0;
  let error = 0;
  for (let played = 1; played <= options.games; played += 1) {
    const progress = (played - 1) / Math.max(1, options.games - 1);
    const alpha = options.alpha + (options.alphaEnd - options.alpha) * progress;
    const result = trainEpisode(
      game,
      net,
      rng,
      { lambda: options.lambda, alpha, startingPlayer: played % 2 === 0 ? 'white' : 'black' },
      scratch,
    );
    turns += result.turns;
    handOffs += result.handOff ? 1 : 0;
    dropped += result.dropped ? 1 : 0;
    error += result.error;
    if (played % 1000 === 0) {
      io.log(
        `game ${played}: ${(turns / 1000).toFixed(1)} turns, ${(handOffs / 10).toFixed(1)} % handed to the heuristic, ` +
          `${dropped} dropped, win mse ${(error / 1000).toFixed(4)}, alpha ${alpha.toFixed(4)}, ` +
          `${((io.now() - started) / 1000).toFixed(0)} s`,
      );
      turns = 0;
      handOffs = 0;
      dropped = 0;
      error = 0;
    }
    if (options.evalEvery > 0 && played % options.evalEvery === 0) check(played);
  }
  if (options.evalEvery <= 0 || options.games % options.evalEvery !== 0) check(options.games);
}
