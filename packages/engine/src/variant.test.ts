import { describe, expect, it } from 'vitest';

import { totalCheckers } from './board';
import { rollDice } from './dice';
import { EngineError } from './errors';
import { formatTurn } from './move';
import type { Turn } from './move';
import { PLAYERS } from './player';
import { createSeededRng } from './rng';
import { parseGameState, serializeGameState } from './serialize';
import type { GameState } from './state';
import { raceVariant } from './testing/race-variant';
import { createVariantRegistry, getVariant } from './variant';
import type { GameResult, Variant } from './variant';

interface PlayedGame {
  readonly final: GameState;
  readonly result: GameResult;
  readonly log: readonly string[];
}

/** Plays a full game through the interface only, as the UI or bot would. */
function playGame(variant: Variant, seed: number): PlayedGame {
  const rng = createSeededRng(seed);
  let state = variant.initialState({ startingPlayer: 'white' });
  const log: string[] = [];
  while (!variant.isGameOver(state)) {
    const dice = rollDice(rng);
    state = { ...state, dice };
    // Every state survives a trip through JSON, as it would through the server.
    state = parseGameState(serializeGameState(state));
    const turns = variant.legalTurns(state, dice);
    expect(turns.length).toBeGreaterThan(0);
    const turn = turns[0] as Turn;
    log.push(`${turn.player} ${dice.join('-')}: ${formatTurn(turn)}`);
    state = variant.applyTurn(state, turn);
    for (const player of PLAYERS) expect(totalCheckers(state.board, player)).toBe(15);
    if (state.turnNumber > 500) throw new Error('game did not end');
  }
  const result = variant.result(state);
  if (result === null) throw new Error('game over but no result');
  return { final: state, result, log };
}

describe('Variant interface with the stub race variant', () => {
  it('plays a full game from start to result', () => {
    const { final, result, log } = playGame(raceVariant, 2026);
    expect(result.reason).toBe('borneOff');
    expect(result.winner).not.toBeNull();
    expect([1, 2]).toContain(result.points);
    expect(final.board.off[result.winner ?? 'white']).toBe(15);
    expect(final.dice).toBeNull();
    expect(log.length).toBe(final.turnNumber - 1);
    expect(log[0]).toMatch(/^white \d-\d: 6\//);
  });

  it('is deterministic: same seed, same game', () => {
    expect(playGame(raceVariant, 7)).toEqual(playGame(raceVariant, 7));
  });

  it('initialState starts before the first roll', () => {
    const state = raceVariant.initialState({
      startingPlayer: 'black',
      rules: { id: 'x', version: 2 },
    });
    expect(state).toMatchObject({
      toMove: 'black',
      dice: null,
      turnNumber: 1,
      rules: { id: 'x', version: 2 },
      variant: 'test-race',
    });
    expect(raceVariant.isGameOver(state)).toBe(false);
    expect(raceVariant.result(state)).toBeNull();
  });

  it('applyTurn does not change its input and passes the turn', () => {
    const start = {
      ...raceVariant.initialState({ startingPlayer: 'white' }),
      dice: [6, 5] as const,
    };
    const before = JSON.stringify(start);
    const [turn] = raceVariant.legalTurns(start, [6, 5]);
    if (turn === undefined) throw new Error('no turn');
    const next = raceVariant.applyTurn(start, turn);
    expect(JSON.stringify(start)).toBe(before);
    expect(next).toMatchObject({ toMove: 'black', dice: null, turnNumber: 2 });
    expect(formatTurn(turn)).toBe('6/0 6/1');
  });

  it('applyTurn rejects a turn that is not legal', () => {
    const start = raceVariant.initialState({ startingPlayer: 'white' });
    const bad: Turn = {
      player: 'white',
      dice: [3, 1],
      moves: [{ from: 6, to: 2, die: 3, capture: 'none' }],
    };
    expect(() => raceVariant.applyTurn(start, bad)).toThrow(
      expect.objectContaining({ code: 'ILLEGAL_TURN' }),
    );
  });
});

describe('variant registry', () => {
  it('finds a variant by id', () => {
    const registry = createVariantRegistry([raceVariant]);
    expect(getVariant(registry, 'test-race')).toBe(raceVariant);
  });

  it('throws on an unknown id', () => {
    const registry = createVariantRegistry([raceVariant]);
    expect(() => getVariant(registry, 'portes')).toThrow(EngineError);
    expect(() => getVariant(registry, 'portes')).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_VARIANT' }),
    );
  });

  it('throws on a duplicate id', () => {
    expect(() => createVariantRegistry([raceVariant, raceVariant])).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_VARIANT' }),
    );
  });
});
