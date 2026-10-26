import { describe, expect, it } from 'vitest';

import { EngineError } from './errors';
import { absoluteToOwn, isPointNumber, otherPlayerPoint, ownToAbsolute } from './numbering';
import type { Direction } from './numbering';
import { PLAYERS } from './player';

const ALL_POINTS = Array.from({ length: 24 }, (_, i) => i + 1);
const DIRECTIONS: readonly Direction[] = ['contrary', 'parallel'];

describe('contrary numbering (Portes, Plakoto, Asodio)', () => {
  it.each(ALL_POINTS)('White own %i is absolute %i; Black own %i is absolute 25 - %i', (p) => {
    expect(ownToAbsolute(p, 'white', 'contrary')).toBe(p);
    expect(absoluteToOwn(p, 'white', 'contrary')).toBe(p);
    expect(ownToAbsolute(p, 'black', 'contrary')).toBe(25 - p);
    expect(absoluteToOwn(p, 'black', 'contrary')).toBe(25 - p);
    expect(otherPlayerPoint(p, 'contrary')).toBe(25 - p);
  });

  it('matches the Portes diagram: Black 24 = White 1, Black 6 = White 19', () => {
    expect(ownToAbsolute(24, 'black', 'contrary')).toBe(1);
    expect(ownToAbsolute(13, 'black', 'contrary')).toBe(12);
    expect(ownToAbsolute(8, 'black', 'contrary')).toBe(17);
    expect(ownToAbsolute(6, 'black', 'contrary')).toBe(19);
  });
});

describe('parallel numbering (Fevga)', () => {
  it.each(ALL_POINTS)('Black own %i maps with q = p > 12 ? p - 12 : p + 12', (p) => {
    const expected = p > 12 ? p - 12 : p + 12;
    expect(ownToAbsolute(p, 'black', 'parallel')).toBe(expected);
    expect(absoluteToOwn(p, 'black', 'parallel')).toBe(expected);
    expect(otherPlayerPoint(p, 'parallel')).toBe(expected);
    expect(ownToAbsolute(p, 'white', 'parallel')).toBe(p);
    expect(absoluteToOwn(p, 'white', 'parallel')).toBe(p);
  });

  it('matches fevga.md: White 24 = Black 12, White 12 = Black 24', () => {
    expect(absoluteToOwn(24, 'black', 'parallel')).toBe(12);
    expect(absoluteToOwn(12, 'black', 'parallel')).toBe(24);
  });

  it("Black's path runs W12 → W1 → W24 → W13 (same direction as White)", () => {
    const blackPath = [...ALL_POINTS]
      .reverse()
      .map((own) => ownToAbsolute(own, 'black', 'parallel'));
    expect(blackPath).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13,
    ]);
  });

  it("Black's home (own 1–6) is White's 13–18", () => {
    const home = [1, 2, 3, 4, 5, 6].map((own) => ownToAbsolute(own, 'black', 'parallel'));
    expect(home).toEqual([13, 14, 15, 16, 17, 18]);
  });
});

describe('numbering in general', () => {
  it.each(DIRECTIONS)(
    '%s: conversion is a bijection and round-trips for both players',
    (direction) => {
      for (const player of PLAYERS) {
        const images = new Set(ALL_POINTS.map((p) => ownToAbsolute(p, player, direction)));
        expect(images.size).toBe(24);
        for (const p of ALL_POINTS) {
          expect(absoluteToOwn(ownToAbsolute(p, player, direction), player, direction)).toBe(p);
          expect(ownToAbsolute(absoluteToOwn(p, player, direction), player, direction)).toBe(p);
          expect(otherPlayerPoint(otherPlayerPoint(p, direction), direction)).toBe(p);
        }
      }
    },
  );

  it.each([0, 25, -1, 1.5, Number.NaN])('rejects point %s', (bad) => {
    expect(() => ownToAbsolute(bad, 'white', 'contrary')).toThrow(EngineError);
    expect(() => absoluteToOwn(bad, 'black', 'parallel')).toThrow(EngineError);
    expect(() => otherPlayerPoint(bad, 'contrary')).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
    expect(isPointNumber(bad)).toBe(false);
  });
});
