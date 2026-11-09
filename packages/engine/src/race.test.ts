import { describe, expect, it } from 'vitest';

import { createGameFlow, legalNextMoves } from './flow/game-flow';
import { applyMatchAction, createMatchFlow, matchPhase } from './flow/match-flow';
import type { MatchAction, MatchFlow } from './flow/match-flow';
import { getPreset } from './presets';
import { isRace, isRaceBoard } from './race';
import { createSeededRng } from './rng';
import type { GameState } from './state';
import { asodioState } from './testing/asodio-notation';
import { fevgaState } from './testing/fevga-notation';
import { plakotoState } from './testing/plakoto-notation';
import { portesState } from './testing/position-notation';
import { VARIANT_REGISTRY } from './variants';

describe('isRace: contrary games', () => {
  it('the start position is not a race', () => {
    for (const id of ['portes', 'plakoto', 'asodio'] as const) {
      const state = VARIANT_REGISTRY.get(id)?.initialState({ startingPlayer: 'white' });
      expect(state && isRace(state)).toBe(false);
    }
  });

  it('tavli-match.md #23: Portes, last checkers on 12 and own 12 have passed; on 13 and own 13 they have not', () => {
    // Black's own 12 is White's 13: White's last checker is below it.
    expect(isRace(portesState('w: 12 6x14 ; b: 12 6x14'))).toBe(true);
    // Black's own 13 is White's 12: White's last checker on 13 is above it.
    expect(isRace(portesState('w: 13 6x14 ; b: 13 6x14'))).toBe(false);
  });

  it('tavli-match.md #24: Portes, a checker on the bar is never a race', () => {
    expect(isRace(portesState('w: 6x14 bar ; b: 6x15'))).toBe(false);
    expect(isRace(portesState('w: 6x15 ; b: 6x14 bar'))).toBe(false);
    expect(isRace(portesState('w: 6x15 ; b: 6x15'))).toBe(true);
  });

  it('tavli-match.md #25: Plakoto, a pinned checker is never a race', () => {
    // White's lone checker on its own 12 is pinned under Black's checkers
    // (Black's own 13). Every other checker has passed.
    expect(isRace(plakotoState('w: 12! 6x14 ; b: 13x2 6x13'))).toBe(false);
    expect(isRace(plakotoState('w: 6x15 ; b: 6x15'))).toBe(true);
  });

  it('tavli-match.md #26: Asodio, a checker that has not entered is never a race', () => {
    expect(isRace(asodioState('w: 6x14 out ; b: 6x15'))).toBe(false);
    expect(isRace(asodioState('w: 6x15 ; b: 6x15'))).toBe(true);
  });

  it('a pin in Asodio is never a race', () => {
    expect(isRace(asodioState('w: 12! 6x14 ; b: 13x2 6x13'))).toBe(false);
  });

  it('a side with every checker off still races the other side', () => {
    expect(isRace(portesState('w: offx15 ; b: 24x15'))).toBe(true);
  });
});

describe('isRace: Fevga (parallel)', () => {
  it('the start position is not a race', () => {
    const state = VARIANT_REGISTRY.get('fevga')?.initialState({ startingPlayer: 'white' });
    expect(state && isRace(state)).toBe(false);
  });

  it('tavli-match.md #27: Fevga, a Black checker in front of the last White checker is no race; all behind is', () => {
    // Black's own 24 is White's 12: in front of White's last checker on 13.
    expect(isRace(fevgaState('w: 13 6x14 ; b: 24 6x14'))).toBe(false);
    // Black is in its home (White's 13–18), White in its home (1–6): nobody is in front of anybody.
    expect(isRace(fevgaState('w: 6x15 ; b: 6x15'))).toBe(true);
  });

  it("White's checkers in front of Black's last checker are contact too", () => {
    // Black's last checker on its own 20 is White's 8. White on 6 is in front of it.
    expect(isRace(fevgaState('w: 6x15 ; b: 20 6x14'))).toBe(false);
  });

  it("White passing through Black's home is contact", () => {
    // White's 20 must still pass White's 13–18, where Black's home checkers stand.
    expect(isRace(fevgaState('w: 20 6x14 ; b: 6x15'))).toBe(false);
  });

  it('isRaceBoard reads the direction it is given', () => {
    // The same board is a race when both sides move apart (contrary): Black's
    // own 6 is then White's 19, behind White's 6.
    const contrary = portesState('w: 6x15 ; b: 6x15');
    expect(isRaceBoard(contrary.board, 'contrary')).toBe(true);
  });
});

/** Plays the first legal move until the game is over: a fast forward with a trivial chooser. */
function playOut(start: MatchFlow, seed: number): MatchFlow {
  const ctx = { rng: createSeededRng(seed) };
  let flow = start;
  for (let guard = 0; guard < 2000 && matchPhase(flow) === 'playing'; guard += 1) {
    const game = flow.game;
    const player = game.state.toMove;
    let action: MatchAction;
    if (game.phase === 'awaiting-roll') action = { type: 'roll', player };
    else if (game.phase === 'awaiting-confirm') action = { type: 'confirm', player };
    else {
      const move = legalNextMoves(game, ctx)[0]?.moves[0];
      if (move === undefined) throw new Error('no legal move while moving');
      action = { type: 'move', player, move };
    }
    flow = applyMatchAction(flow, action, ctx);
    // A race stays a race.
    expect(isRace(flow.game.state)).toBe(true);
  }
  return flow;
}

/** A match flow whose first game starts at `state` (White to roll). */
function matchAt(state: GameState): MatchFlow {
  const flow = createMatchFlow({ rules: getPreset('portes'), starter: 'white', targetPoints: 3 });
  return { ...flow, game: createGameFlow({ state, starter: 'white' }) };
}

describe('fast forward', () => {
  it('tavli-match.md #28: a race played to the end scores as usual and the match goes on', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const flow = playOut(matchAt(portesState('w: 6x5 5x5 4x5 ; b: 6x5 5x5 4x5')), seed);
      expect(matchPhase(flow)).toBe('game-over');
      const result = flow.game.result;
      expect(result?.reason).toBe('borneOff');
      expect([1, 2]).toContain(result?.points);
      const winner = result?.winner ?? 'white';
      expect(flow.match.score[winner]).toBe(result?.points);
      // The match goes on with the next game, as after any other game.
      const next = applyMatchAction(flow, { type: 'nextGame' });
      expect(matchPhase(next)).toBe('playing');
    }
  });
});
