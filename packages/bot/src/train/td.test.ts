import { describe, expect, it } from 'vitest';

import { createBoard, createSeededRng, plakoto, portes } from '@tavli/engine';
import type { Dice } from '@tavli/engine';

import { fevgaNetGame } from '../evaluators/fevga-net';
import { createScratch, evaluateNet, forward } from '../evaluators/net';
import type { NetGame } from '../evaluators/net';
import { PINNED } from '../evaluators/plakoto-board';
import { plakotoNetGame } from '../evaluators/plakoto-net';
import { sideOf } from '../evaluators/portes-board';
import { encodePortes, loadPortesNet, portesNetGame } from '../evaluators/portes-net';
import { numberFlag, parseFlags } from './args';
import {
  createTrainScratch,
  createTrainableNet,
  endTriple,
  heuristicPositions,
  isValidSide,
  playOn,
  supervisedEpoch,
  toNetFile,
  trainEpisode,
  trainStep,
} from './td';

const start = portes.initialState({ startingPlayer: 'white' });
const roller = sideOf(start, 'white');
const waiter = sideOf(start, 'black');

/** The checkers of a side, without the Plakoto pin flags. */
function checkersOf(side: readonly number[]): readonly number[] {
  return side.slice(0, PINNED);
}

function episodeTest<S, C>(name: string, game: NetGame<S, C>): void {
  it(`${name}: plays a self-play game until the net stops scoring, and repeats it for a seed`, () => {
    const run = () => {
      const net = createTrainableNet(game.inputs, 8, createSeededRng(2));
      const result = trainEpisode(game, net, createSeededRng(3), {
        lambda: 0.7,
        alpha: 0.05,
        startingPlayer: 'white',
      });
      return { result, w: Array.from(net.w2) };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.result.dropped).toBe(false);
    expect(a.result.turns).toBeGreaterThan(5);
    expect(Number.isFinite(a.result.error)).toBe(true);
  });

  it(`${name}: drops a game that runs past maxTurns, with no step`, () => {
    const net = createTrainableNet(game.inputs, 8, createSeededRng(2));
    const before = Array.from(net.w2);
    const result = trainEpisode(game, net, createSeededRng(3), {
      lambda: 0.7,
      alpha: 0.05,
      startingPlayer: 'white',
      maxTurns: 3,
    });
    expect(result).toMatchObject({ turns: 3, dropped: true });
    expect(Array.from(net.w2)).toEqual(before);
  });

  it(`${name}: labels positions the net scores, from heuristic play`, () => {
    const positions = heuristicPositions(game, 150, 4);
    expect(positions).toHaveLength(150);
    for (const p of positions) {
      expect(game.usesNet(p.roller, p.waiter)).toBe(true);
      expect(p.target[0]).toBeGreaterThanOrEqual(0);
      expect(p.target[0]).toBeLessThanOrEqual(1);
    }
    const net = createTrainableNet(game.inputs, 8, createSeededRng(5));
    const rng = createSeededRng(6);
    const context = game.context(game.variant.initialState({ startingPlayer: 'white' }).rules);
    const first = supervisedEpoch(game, net, positions, context, 0.05, rng);
    let last = first;
    for (let i = 0; i < 5; i += 1) last = supervisedEpoch(game, net, positions, context, 0.05, rng);
    expect(last).toBeLessThan(first);
  });
}

describe('training (dev only)', () => {
  it('a gradient step moves the outputs toward the target', () => {
    const net = createTrainableNet(portesNetGame.inputs, 8, createSeededRng(1));
    const scratch = createTrainScratch(net);
    encodePortes(roller, waiter, scratch.input);
    const target = [0.9, 0.4, 0.05];
    const first = trainStep(net, target, 0.1, scratch);
    for (let i = 0; i < 50; i += 1) trainStep(net, target, 0.1, scratch);
    const last = trainStep(net, target, 0.1, scratch);
    expect(last).toBeLessThan(first);
    forward(net, scratch.input, scratch.hidden, scratch.out);
    expect(scratch.out[0]).toBeCloseTo(0.9, 1);
    expect(scratch.out[2]).toBeCloseTo(0.05, 1);
  });

  episodeTest('portes', portesNetGame);
  episodeTest('plakoto', plakotoNetGame);
  episodeTest('fevga', fevgaNetGame);

  it('heuristic positions have valid sides', () => {
    for (const p of heuristicPositions(portesNetGame, 100, 4)) {
      expect(isValidSide(p.roller)).toBe(true);
      expect(isValidSide(p.waiter)).toBe(true);
    }
    for (const p of heuristicPositions(plakotoNetGame, 100, 4)) {
      expect(isValidSide(checkersOf(p.roller))).toBe(true);
      expect(isValidSide(checkersOf(p.waiter))).toBe(true);
    }
    for (const p of heuristicPositions(fevgaNetGame, 100, 4)) {
      expect(isValidSide(p.roller)).toBe(true);
      expect(isValidSide(p.waiter)).toBe(true);
    }
  });

  it('plays on when the Plakoto mother question waits', () => {
    // White pins Black's lone mother (on White's 1) with a 3 from White's 4.
    const before = {
      ...plakoto.initialState({ startingPlayer: 'white' }),
      board: createBoard(
        {
          white: { points: { 24: 5, 13: 5, 8: 3, 4: 2 } },
          black: { points: { 24: 1, 13: 7, 18: 7 } },
        },
        'contrary',
      ),
    };
    const dice: Dice = [3, 5];
    const turn = plakoto
      .legalTurns(before, dice)
      .find((t) => t.moves.some((m) => m.to === 1 && m.capture === 'pin'));
    if (turn === undefined) throw new Error('no pinning turn');
    const asked = plakoto.applyTurn({ ...before, dice }, turn);
    expect(plakoto.prompt?.(asked)?.player).toBe('black');
    const next = playOn(plakoto, asked);
    expect(plakoto.prompt?.(next) ?? null).toBeNull();
    expect(plakoto.result(next)).toBeNull();
    expect(() => plakoto.legalTurns(next, [1, 2])).not.toThrow();
    // No question: the same state.
    expect(playOn(portes, start)).toBe(start);
  });

  it('turns a game end into a target from the mover’s view', () => {
    expect(endTriple(3)).toEqual([1, 1, 0]);
    expect(endTriple(2)).toEqual([1, 1, 0]);
    expect(endTriple(1)).toEqual([1, 0, 0]);
    expect(endTriple(0)).toEqual([0.5, 0, 0]);
    expect(endTriple(-1)).toEqual([0, 0, 0]);
    expect(endTriple(-2)).toEqual([0, 0, 1]);
  });

  it('saves a net that loads back with the same (Float32) outputs', () => {
    const net = createTrainableNet(portesNetGame.inputs, 8, createSeededRng(7));
    const loaded = loadPortesNet(toNetFile(net, 'test', 'notes'));
    const a = evaluateNet(portesNetGame, net, roller, waiter, false, createScratch(net));
    const b = evaluateNet(portesNetGame, loaded, roller, waiter, false, createScratch(loaded));
    expect(b.equity).toBeCloseTo(a.equity, 5);
  });
});

describe('train script flags', () => {
  it('reads --flag value pairs and skips a lone --', () => {
    const flags = parseFlags(['--', '--game', 'plakoto', '--seed', '3', '--alpha', '-0.5']);
    expect([...flags]).toEqual([
      ['game', 'plakoto'],
      ['seed', '3'],
      ['alpha', '-0.5'],
    ]);
    expect(numberFlag(flags, 'seed', 1)).toBe(3);
    expect(numberFlag(flags, 'alpha', 1)).toBe(-0.5);
    expect(numberFlag(flags, 'games', 100)).toBe(100);
  });

  it('rejects a missing value, a flag used as a value, and a bare word', () => {
    expect(() => parseFlags(['--warm'])).toThrow('--warm needs a value');
    expect(() => parseFlags(['--warm', '--seed', '3'])).toThrow('--warm needs a value');
    expect(() => parseFlags(['--warm', ''])).toThrow('--warm needs a value');
    expect(() => parseFlags(['seed', '3'])).toThrow('unexpected argument seed');
  });

  it('rejects a value that is not a number', () => {
    const flags = new Map([
      ['seed', 'x'],
      ['games', ' '],
    ]);
    expect(() => numberFlag(flags, 'seed', 1)).toThrow('--seed must be a number');
    expect(() => numberFlag(flags, 'games', 1)).toThrow('--games must be a number');
  });
});
