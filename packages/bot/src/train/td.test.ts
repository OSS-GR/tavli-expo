import { describe, expect, it } from 'vitest';

import { createSeededRng, portes } from '@tavli/engine';

import { hasContact, sideOf } from '../evaluators/portes-board';
import {
  createScratch,
  encodePortes,
  evaluateNetSides,
  forward,
  loadPortesNet,
} from '../evaluators/portes-net';
import {
  createTrainScratch,
  createTrainableNet,
  heuristicPositions,
  isValidSide,
  supervisedEpoch,
  toNetFile,
  trainEpisode,
  trainStep,
} from './td';

const start = portes.initialState({ startingPlayer: 'white' });
const roller = sideOf(start, 'white');
const waiter = sideOf(start, 'black');

describe('training (dev only)', () => {
  it('a gradient step moves the outputs toward the target', () => {
    const net = createTrainableNet(8, createSeededRng(1));
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

  it('plays a self-play game to the end of contact and repeats it for a seed', () => {
    const run = () => {
      const net = createTrainableNet(8, createSeededRng(2));
      const result = trainEpisode(net, createSeededRng(3), {
        lambda: 0.7,
        alpha: 0.05,
        startingPlayer: 'white',
      });
      return { result, w: Array.from(net.w2) };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.result.turns).toBeGreaterThan(5);
    expect(Number.isFinite(a.result.error)).toBe(true);
  });

  it('labels contact positions from heuristic play', () => {
    const positions = heuristicPositions(200, 4);
    expect(positions).toHaveLength(200);
    for (const p of positions) {
      expect(isValidSide(p.roller)).toBe(true);
      expect(isValidSide(p.waiter)).toBe(true);
      expect(hasContact(p.roller, p.waiter)).toBe(true);
      expect(p.target[0]).toBeGreaterThanOrEqual(0);
      expect(p.target[0]).toBeLessThanOrEqual(1);
    }
    const net = createTrainableNet(8, createSeededRng(5));
    const rng = createSeededRng(6);
    const first = supervisedEpoch(net, positions, 0.05, rng);
    let last = first;
    for (let i = 0; i < 5; i += 1) last = supervisedEpoch(net, positions, 0.05, rng);
    expect(last).toBeLessThan(first);
  });

  it('saves a net that loads back with the same (Float32) outputs', () => {
    const net = createTrainableNet(8, createSeededRng(7));
    const loaded = loadPortesNet(toNetFile(net, 'test', 'notes'));
    const a = evaluateNetSides(net, roller, waiter, createScratch(net));
    const b = evaluateNetSides(loaded, roller, waiter, createScratch(loaded));
    expect(b.equity).toBeCloseTo(a.equity, 5);
  });
});
