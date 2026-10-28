/**
 * Asodio rules: one test per numbered edge case in `docs/rules/asodio.md`
 * (named `asodio.md #N: ...`; `rules-docs.test.ts` checks that every case
 * has one), plus the flags, the roll chain and the errors.
 *
 * Edge cases 1–13 describe the research version ("Turn & dice rules": a 1-2
 * gives a chosen double and an extra roll). They run with the preset whose
 * flags they name: `asodio.aceyDeuceyGreek` for the extra rolls, and
 * `asodio.aceyDeuceyAmerican` for `perChecker` and "any die re-enters".
 * Cases 14–19 are the owner version, `asodio.kafeneio` (the default).
 */

import { describe, expect, it } from 'vitest';

import { DISTINCT_ROLLS } from '../../dice';
import type { Dice } from '../../dice';
import { formatMove, formatTurn } from '../../move';
import type { Turn } from '../../move';
import { resolveRules } from '../../presets';
import type { PresetId } from '../../rules';
import type { GameState } from '../../state';
import { asodioState, formatAsodio, parseAsodioTurn } from '../../testing/asodio-notation';
import { applyGameAction, createGameFlow, legalNextMoves } from '../../flow/game-flow';
import type { GameFlow } from '../../flow/game-flow';
import { applyMatchAction, createMatchFlow, matchPhase, replay } from '../../flow/match-flow';
import type { MatchFlow } from '../../flow/match-flow';
import { createSeededRng } from '../../rng';
import { randomAction } from '../../testing/random-flow';
import { asodio } from './index';

const GREEK: PresetId = 'asodio.aceyDeuceyGreek';
const AMERICAN: PresetId = 'asodio.aceyDeuceyAmerican';

/** Every roll, as `[high, low]`. */
const ALL_ROLLS: readonly Dice[] = DISTINCT_ROLLS.map(({ dice }) => dice);

function turns(state: GameState, dice: Dice): string[] {
  return asodio.legalTurns(state, dice).map(formatTurn);
}

/** The boards after each legal play, in the test notation. */
function finals(state: GameState, dice: Dice): string[] {
  return asodio
    .legalTurns(state, dice)
    .map((turn) => formatAsodio(asodio.applyTurn({ ...state, dice }, turn).board))
    .sort();
}

function play(state: GameState, dice: Dice, text: string, capture: 'pin' | 'hit' = 'pin') {
  return asodio.applyTurn({ ...state, dice }, parseAsodioTurn(text, state.toMove, dice, capture));
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

/** Every first move offered for `dice`, in notation. */
function firstMoves(state: GameState, dice: Dice): string[] {
  return asodio.nextMoves(state, dice, []).map(formatMove);
}

describe('asodio.md edge cases (research version)', () => {
  it('asodio.md #1: start: 30 checkers outside, board empty', () => {
    for (const preset of ['asodio.kafeneio', GREEK, AMERICAN] as const) {
      const state = asodio.initialState({
        startingPlayer: 'black',
        rules: resolveRules(preset, {}),
      });
      expect(formatAsodio(state.board)).toBe('w: outx15 ; b: outx15');
      expect(state.board.points.every((p) => p.white === 0 && p.black === 0)).toBe(true);
      expect(state).toMatchObject({
        toMove: 'black',
        dice: null,
        turnNumber: 1,
        variantData: null,
      });
    }
    // The default preset is the owner version.
    expect(asodio.initialState({ startingPlayer: 'white' }).rules.presetId).toBe('asodio.kafeneio');
    // startPosition "opponentAcePoint" (RuleSet "allOnOwn24"): 15 on own 24, as in Plakoto.
    const stack = resolveRules(AMERICAN, {
      board: { startPosition: 'allOnOwn24' },
      entry: { firstEntryGate: false },
    });
    const state = asodio.initialState({ startingPlayer: 'white', rules: stack });
    expect(formatAsodio(state.board)).toBe('w: 24x15 ; b: 24x15');
    expect(turns(state, [6, 5])).toContain('24/18 24/19');
  });

  it('asodio.md #2: firstEntryGate: a first roll of 6-4 has no move', () => {
    const state = asodioState('w: outx15 ; b: outx15', { preset: GREEK });
    expect(turns(state, [6, 4])).toEqual(['-']);
    const next = play(state, [6, 4], '-');
    expect(next.toMove).toBe('black');
    // A move with the 6-4 is refused, even if every die is used.
    expect(codeOf(() => play(state, [6, 4], 'out/19 out/21'))).toBe('ILLEGAL_TURN');
    // Without the gate, any die enters.
    const american = asodioState('w: outx15 ; b: outx15', { preset: AMERICAN });
    expect(turns(american, [6, 4])).toContain('25/19 25/21');
  });

  it('asodio.md #3: firstEntryGate: a first roll of 3-3 enters four on own 22 (or enters and moves), then rolls again', () => {
    const state = asodioState('w: outx15 ; b: outx15', { preset: GREEK });
    expect(turns(state, [3, 3])).toContain('25/22 25/22 25/22 25/22');
    // The Greek preset lets entered checkers move (moveWhileLoading).
    expect(finals(state, [3, 3])).toContain('w: 19x2 outx13 ; b: outx15');
    const next = play(state, [3, 3], 'out/22 out/22 out/22 out/22');
    expect(formatAsodio(next.board)).toBe('w: 22x4 outx11 ; b: outx15');
    // doublesGiveExtraRoll: the same player rolls again.
    expect(next).toMatchObject({ toMove: 'white', dice: null, turnNumber: 2, variantData: null });
  });

  it('asodio.md #4: first roll 1-2 enters on 24 and 23 (or enters and moves), then a chosen double, then a new roll', () => {
    const state = asodioState('w: outx15 ; b: outx15', { preset: GREEK });
    expect(finals(state, [1, 2])).toEqual([
      'w: 22 outx14 ; b: outx15',
      'w: 24 23 outx13 ; b: outx15',
    ]);
    const chosen = play(state, [1, 2], 'out/24 out/23');
    expect(chosen.toMove).toBe('white');
    expect(asodio.prompt?.(chosen)).toEqual({
      player: 'white',
      kind: 'chooseDouble',
      choices: ['1', '2', '3', '4', '5', '6'],
    });
    // Nothing moves until the double is chosen.
    expect(codeOf(() => asodio.legalTurns(chosen, [5, 5]))).toBe('ILLEGAL_TURN');
    const five = asodio.answerPrompt?.(chosen, 'white', '5') as GameState;
    expect(five).toMatchObject({ dice: [5, 5], variantData: { chosenDouble: 5 } });
    expect(asodio.prompt?.(five)).toBeNull();
    // Only the chosen double can be played.
    expect(codeOf(() => asodio.legalTurns(five, [6, 6]))).toBe('ILLEGAL_TURN');
    const after = play(five, [5, 5], 'out/20 out/20 out/20 out/20');
    expect(formatAsodio(after.board)).toBe('w: 24 23 20x4 outx9 ; b: outx15');
    // aceDeuceExtraRoll: a new roll for the same player.
    expect(after).toMatchObject({ toMove: 'white', dice: null, variantData: null });
  });

  it('asodio.md #5: after one checker is on the board, a 6-4 enters on 19 and 21', () => {
    const greek = asodioState('w: 24 outx14 ; b: outx15', { preset: GREEK });
    expect(turns(greek, [6, 4])).toContain('25/19 25/21');
    // Owner version: entered checkers wait, so every die enters.
    const owner = asodioState('w: 24 outx14 ; b: outx15');
    expect(turns(owner, [6, 4])).toEqual(['25/19 25/21']);
  });

  it('asodio.md #6: 1-2 with the 1 blocked: play the 2, the turn ends, no chosen double, no extra roll', () => {
    // Black's doors on own 1 and 3 (White's 24 and 22) block every 1.
    const state = asodioState('w: outx15 ; b: 1x2 3x2 6x11', { preset: GREEK });
    expect(turns(state, [1, 2])).toEqual(['25/23']);
    const next = play(state, [1, 2], 'out/23');
    expect(next).toMatchObject({ toMove: 'black', variantData: null });
    expect(asodio.prompt?.(next)).toBeNull();
  });

  it('asodio.md #7: 1-2, chosen double 6-6 with only two sixes playable: play two, no extra roll', () => {
    // Black's door on White's 19 (black 6) blocks the entry; 14/8/2 is open.
    const state = asodioState('w: 14 outx14 ; b: 6x2 outx13', {
      preset: GREEK,
      dice: [6, 6],
      variantData: { chosenDouble: 6 },
    });
    expect(turns(state, [6, 6])).toEqual(['14/8 8/2']);
    const next = play(state, [6, 6], '14/8 8/2');
    expect(next).toMatchObject({ toMove: 'black', variantData: null });
    // A chosen double with no playable move at all is a pass, and the turn ends too.
    const none = asodioState('w: 2 outx14 ; b: 6x2 outx13', {
      preset: GREEK,
      dice: [6, 6],
      variantData: { chosenDouble: 6 },
    });
    expect(turns(none, [6, 6])).toEqual(['-']);
    expect(play(none, [6, 6], '-').toMove).toBe('black');
  });

  it('asodio.md #8: 1-2, chosen double fully played: roll again; a new 1-2 repeats this', () => {
    let state = asodioState('w: 24x2 outx13 ; b: outx15', { preset: GREEK });
    for (let round = 0; round < 2; round += 1) {
      state = play(state, [2, 1], 'out/23 out/24');
      expect(asodio.prompt?.(state)?.kind).toBe('chooseDouble');
      state = asodio.answerPrompt?.(state, 'white', '1') as GameState;
      state = play(state, [1, 1], 'out/24 out/24 out/24 out/24');
      expect(state).toMatchObject({ toMove: 'white', variantData: null, dice: null });
    }
    expect(formatAsodio(state.board)).toBe('w: 24x12 23x2 out ; b: outx15');
    expect(state.turnNumber).toBe(5);
  });

  it('asodio.md #9: a hit checker on the bar enters before other moves; unentered start checkers do not block', () => {
    const rules = resolveRules(AMERICAN, {});
    const hit = asodioState('w: bar 13 outx13 ; b: outx15', { rules });
    for (const turn of asodio.legalTurns(hit, [3, 1])) expect(turn.moves[0]?.from).toBe('bar');
    expect(new Set(asodio.nextMoves(hit, [3, 1], []).map((m) => m.from))).toEqual(new Set(['bar']));
    // Checkers that never entered have no such priority: 13/10/9 is legal.
    const start = asodioState('w: 13 outx14 ; b: outx15', { rules });
    expect(turns(start, [3, 1])).toContain('13/10 10/9');
    // Greek folk flag barEntryNeedsSpecial: a hit checker waits for a 1-2 or a double.
    const greek = asodioState('w: bar 13 outx13 ; b: outx15', { preset: GREEK });
    expect(turns(greek, [3, 1])).toEqual(['-']);
    expect(turns(greek, [2, 1]).every((t) => t.startsWith('25/'))).toBe(true);
  });

  it('asodio.md #10: an entry point that is an opponent door: that die cannot enter', () => {
    // Black's 6 = White's 19 is a door.
    const owner = asodioState('w: 24 outx14 ; b: 6x2 outx13');
    expect(turns(owner, [6, 4])).toEqual(['25/21']);
    const american = asodioState('w: outx15 ; b: 6x2 outx13', { preset: AMERICAN });
    expect(turns(american, [6, 6])).toEqual(['-']);
    // A lone opponent checker there is pinned (owner) or hit (American).
    const blot = asodioState('w: 24 outx14 ; b: 6 outx14');
    expect(asodio.legalTurns(blot, [6, 4])[0]?.moves.map((m) => m.capture)).toEqual([
      'pin',
      'none',
    ]);
    const hitBlot = asodioState('w: 24 outx14 ; b: 6 outx14', { preset: AMERICAN });
    expect(turns(hitBlot, [6, 4])).toContain('25/19* 25/21');
  });

  it('asodio.md #11: no bearing off while a checker is outside (unentered or hit)', () => {
    const outside = asodioState('w: 6x14 out ; b: 1x15', { preset: AMERICAN });
    for (const turn of asodio.legalTurns(outside, [6, 6])) {
      expect(turn.moves.some((m) => m.to === 'off')).toBe(false);
    }
    const onBar = asodioState('w: 6x14 bar ; b: 1x15', { preset: AMERICAN });
    for (const turn of asodio.legalTurns(onBar, [6, 5])) {
      expect(turn.moves.some((m) => m.to === 'off')).toBe(false);
    }
    // Once every checker is home, the 6 bears off.
    const home = asodioState('w: 6x15 ; b: 1x15', { preset: AMERICAN });
    expect(turns(home, [6, 5])).toEqual(['6/0 6/1']);
  });

  it('asodio.md #12: doublesGiveExtraRoll false: a normal double ends the turn', () => {
    for (const preset of [AMERICAN, 'asodio.kafeneio'] as const) {
      const state = asodioState('w: 13 outx14 ; b: outx15', { preset });
      const next = asodio.applyTurn(
        { ...state, dice: [3, 3] },
        asodio.legalTurns(state, [3, 3])[0] as Turn,
      );
      expect(next.toMove).toBe('black');
    }
    // With the flag, a double that is played only in part gives no extra roll.
    const partly = asodioState('w: 2 outx14 ; b: 6x2 outx13', { preset: GREEK });
    expect(turns(partly, [6, 6])).toEqual(['-']);
    expect(play(partly, [6, 6], '-').toMove).toBe('black');
    const three = asodioState('w: 4 outx14 ; b: 3x2 outx13', { preset: GREEK });
    expect(turns(three, [3, 3])).toEqual(['4/1']);
    expect(play(three, [3, 3], '4/1').toMove).toBe('black');
  });

  it('asodio.md #13: scoring "perChecker": a loser with 5 checkers left loses 5 points', () => {
    const state = asodioState('w: offx15 ; b: 6x3 outx2 offx10', { preset: AMERICAN });
    expect(asodio.result(state)).toEqual({ winner: 'white', points: 5, reason: 'borneOff' });
    // The default scoring: 1, or 2 (mars) when the loser bore off none (A4).
    expect(asodio.result(asodioState('w: offx15 ; b: 6x14 offx1'))).toEqual({
      winner: 'white',
      points: 1,
      reason: 'borneOff',
    });
    expect(asodio.result(asodioState('w: offx15 ; b: 6x15'))?.points).toBe(2);
    expect(asodio.result(asodioState('w: outx15 ; b: offx15'))?.points).toBe(2);
    const single = asodioState('w: offx15 ; b: 6x15', {
      rules: { scoring: { method: 'singleOnly' } },
    });
    expect(asodio.result(single)?.points).toBe(1);
  });
});

describe('asodio.md owner edge cases (kafeneio)', () => {
  it('asodio.md #14: kafeneio: a first roll of 5-3 is locked: no move, the turn passes', () => {
    const state = asodio.initialState({ startingPlayer: 'white' });
    expect(turns(state, [5, 3])).toEqual(['-']);
    // Only a 1-2 or a double opens the lock.
    for (const dice of ALL_ROLLS) {
      const open = dice[0] === dice[1] || (dice[0] === 2 && dice[1] === 1);
      expect(turns(state, dice).join() === '-', dice.join('-')).toBe(!open);
    }
    // In the turn flow the locked roll passes by itself.
    const flow = applyGameAction(createGameFlow({ state, starter: 'white' }), {
      type: 'roll',
      player: 'white',
      dice: [5, 3],
    });
    expect(flow.phase).toBe('awaiting-roll');
    expect(flow.state.toMove).toBe('black');
    expect(flow.lastTurn?.moves).toEqual([]);
  });

  it('asodio.md #15: kafeneio: a first roll of 1-2 enters one checker on spot 1 and one on spot 2', () => {
    const state = asodio.initialState({ startingPlayer: 'white' });
    expect(finals(state, [1, 2])).toEqual(['w: 24 23 outx13 ; b: outx15']);
    const next = play(state, [1, 2], 'out/24 out/23');
    // A3: no chosen double and no extra roll.
    expect(next).toMatchObject({ toMove: 'black', variantData: null });
    expect(asodio.prompt?.(next)).toBeNull();
    // A1: a double d-d enters four checkers on spot d.
    expect(finals(state, [4, 4])).toEqual(['w: 21x4 outx11 ; b: outx15']);
  });

  it('asodio.md #16: kafeneio: 14 checkers in the starting quarter and 1 outside: none may leave the quarter', () => {
    const state = asodioState('w: 24x4 22x5 20x5 out ; b: outx15');
    // Owner (A2): entered checkers do not move at all while loading.
    for (const dice of ALL_ROLLS) {
      for (const move of asodio.nextMoves(state, dice, [])) expect(move.from).toBe('outside');
    }
    // moveWhileLoading true: they move, but only inside the starting quarter.
    const moving = asodioState('w: 24x4 22x5 20x5 out ; b: outx15', {
      rules: { entry: { moveWhileLoading: true } },
    });
    const moves = ALL_ROLLS.flatMap((dice) => asodio.nextMoves(moving, dice, []));
    expect(moves.some((m) => typeof m.from === 'number')).toBe(true);
    for (const move of moves) {
      if (typeof move.from === 'number') expect(move.to as number).toBeGreaterThanOrEqual(19);
    }
    // Both entry points closed: the whole roll is lost.
    const blocked = asodioState('w: 24x4 23x5 22x5 out ; b: 6x2 5x2 outx11');
    expect(turns(blocked, [6, 5])).toEqual(['-']);
    expect(
      turns(
        asodioState('w: 24x4 23x5 22x5 out ; b: 6x2 5x2 outx11', {
          rules: { entry: { moveWhileLoading: true } },
        }),
        [6, 5],
      ),
    ).toEqual(['-']);
  });

  it('asodio.md #16: once the last checker is in, the rest of the same roll may advance (open question Q26)', () => {
    const state = asodioState('w: 24x4 22x5 20x5 out ; b: outx15');
    expect(turns(state, [6, 5])).toContain('25/19 20/15');
  });

  it('asodio.md #17: kafeneio: a checker in quarter 2 may not move on until all 15 are in quarter 2', () => {
    const front = asodioState('w: 18 20x14 ; b: outx15');
    for (const dice of ALL_ROLLS) {
      for (const turn of asodio.legalTurns(front, dice)) {
        expect(
          turn.moves.some((m) => m.from === 18),
          dice.join('-'),
        ).toBe(false);
      }
    }
    // Frozen in place (moveInsideFrozenQuarter false): not even 18/17.
    expect(firstMoves(front, [1, 3])).toEqual(['20/17', '20/19']);
    // The last checker joins with the 2; then the 1 may move any of them, into quarter 3 too.
    const last = asodioState('w: 18x14 20 ; b: outx15');
    expect(turns(last, [2, 1])).toEqual(['20/18 18/17']);
    expect(turns(asodioState('w: 13x14 14 ; b: outx15'), [2, 1])).toContain('14/12 13/12');
    // moveInsideFrozenQuarter: a frozen checker moves inside its quarter only.
    const inside = asodioState('w: 18 20x14 ; b: outx15', {
      rules: { quarters: { moveInsideFrozenQuarter: true } },
    });
    const moves = asodio.nextMoves(inside, [6, 1], []).filter((m) => m.from === 18);
    expect(moves.map((m) => m.to)).toEqual([17]);
  });

  it('asodio.md #18: kafeneio: landing on a lone opponent checker pins it; the pinned checker has no legal moves', () => {
    // Black's lone checker on own 9 = White's 16.
    const state = asodioState('w: 19x15 ; b: 9 10x14');
    const pinned = play(state, [3, 2], '19/16* 19/17');
    expect(formatAsodio(pinned.board)).toBe('w: 19x13 17 16 ; b: 10x14 9!');
    expect(pinned.toMove).toBe('black');
    for (const dice of ALL_ROLLS) {
      for (const move of asodio.nextMoves(pinned, dice, [])) expect(move.from).not.toBe(9);
    }
    // Only the pinner's checkers may land there: Black's 12/9 is closed.
    const blackOnPin = asodioState('w: 19x14 16 ; b: 12 10x13 9!', { toMove: 'black' });
    expect(asodio.nextMoves(blackOnPin, [3, 1], []).length).toBeGreaterThan(0);
    for (const move of asodio.nextMoves(blackOnPin, [3, 1], [])) expect(move.to).not.toBe(9);
    // The pinner leaves: the pinned checker is free again (phase 3.4).
    const free = asodioState('w: 17x14 16 ; b: 10x14 9!');
    const left = play(free, [6, 5], '16/10 17/12');
    expect(formatAsodio(left.board)).toBe('w: 17x13 12 10 ; b: 10x14 9');
    expect(asodio.nextMoves(left, [1, 2], []).some((m) => m.from === 9)).toBe(true);
    // No landing on 2+ opponent checkers (phase 3.5): Black's door on own 12 = White's 13.
    const door = asodioState('w: 16x15 ; b: 12x2 outx13');
    expect(turns(door, [3, 3])).toEqual(['-']);
    for (const turn of asodio.legalTurns(door, [3, 1])) {
      expect(turn.moves.some((m) => m.to === 13)).toBe(false);
    }
  });

  it('asodio.md #19: kafeneio: the last checker of a quarter is pinned: none of that army may leave it, the player passes (A6)', () => {
    // Black's last checker in quarter 2 (own 13) is pinned under White (White's 12).
    const state = asodioState('w: 12x2 6x13 ; b: 13! 10x14', { toMove: 'black' });
    for (const dice of ALL_ROLLS) expect(turns(state, dice), dice.join('-')).toEqual(['-']);
    // White can still move, so it is no deadlock.
    expect(asodio.result(state)).toBeNull();
    // White moves the pinners off: Black's army moves again.
    const freed = play({ ...state, toMove: 'white' }, [6, 6], '12/6 12/6 6/0 6/0');
    expect(formatAsodio(freed.board)).toBe('w: 6x13 offx2 ; b: 13 10x14');
    expect(turns(freed, [1, 2])).not.toEqual(['-']);
  });
});

describe('asodio: deadlock (A5)', () => {
  it('both armies frozen by pins: no one can ever move, a draw with 0 points', () => {
    // White's rear (13) is pinned by Black's 12; Black's rear (14) by White's 11.
    const state = asodioState('w: 13! 11x7 10x7 ; b: 14! 12x7 9x7');
    expect(asodio.result(state)).toEqual({ winner: null, points: 0, reason: 'deadlock' });
    expect(asodio.isGameOver(state)).toBe(true);
    expect(codeOf(() => asodio.legalTurns(state, [6, 5]))).toBe('ILLEGAL_TURN');
  });

  it('a player who only waits for a 1-2 or a double is not stuck', () => {
    expect(asodio.result(asodio.initialState({ startingPlayer: 'white' }))).toBeNull();
  });
});

describe('asodio: flags', () => {
  it('firstEntryGateRolls "doubleOnly": a 1-2 does not open the gate', () => {
    const state = asodioState('w: outx15 ; b: outx15', {
      rules: { entry: { firstEntryGateRolls: 'doubleOnly' } },
    });
    expect(turns(state, [1, 2])).toEqual(['-']);
    expect(turns(state, [2, 2])).toEqual(['25/23 25/23 25/23 25/23']);
  });

  it('exactBearOff: a die bears off only from its own point', () => {
    const state = asodioState('w: 4x2 offx13 ; b: 24x15');
    expect(turns(state, [6, 5])).toEqual(['4/0 4/0']);
    const exact = asodioState('w: 4x2 offx13 ; b: 24x15', {
      rules: { bearOff: { exactBearOff: true } },
    });
    expect(turns(exact, [6, 5])).toEqual(['-']);
    expect(turns(exact, [4, 1])).toEqual(['4/0 4/3']);
  });

  it('bearOffWhilePinned false (default): no bearing off while a checker is pinned in home (open question Q25)', () => {
    // White's lone 3 is pinned under Black's checkers on own 22.
    const state = asodioState('w: 6x14 3! ; b: 22x2 outx13');
    expect(asodio.legalTurns(state, [6, 5]).some((t) => t.moves.some((m) => m.to === 'off'))).toBe(
      false,
    );
    const allowed = asodioState('w: 6x14 3! ; b: 22x2 outx13', {
      rules: { bearOff: { bearOffWhilePinned: true } },
    });
    expect(turns(allowed, [6, 5])).toContain('6/0 6/1');
  });

  it('higherDieRule: when only one die can be played, it must be the higher one', () => {
    // Only one of the dice can be played: the 6 (13/7) or the 5 (13/8), not both.
    // Black's door on own 23 (White's 2) stops the second die.
    const state = asodioState('w: 13 6x14 ; b: 23x2 outx13');
    expect(turns(state, [6, 5])).toEqual(['13/7']);
    const free = asodioState('w: 13 6x14 ; b: 23x2 outx13', {
      rules: { movement: { higherDieRule: false } },
    });
    expect(turns(free, [6, 5]).sort()).toEqual(['13/7', '13/8']);
  });

  it('captureMode "hit" with the quarter lock: a hit checker re-enters and the rest of the army waits for it', () => {
    const rules = resolveRules('asodio.kafeneio', { capture: { captureMode: 'hit' } });
    const state = asodioState('w: 12x14 bar ; b: 24x15', { rules });
    for (const turn of asodio.legalTurns(state, [3, 1])) {
      expect(turn.moves.every((m) => m.from === 'bar' || (m.from as number) >= 19)).toBe(true);
    }
  });

  it('an extra roll after a 1-2 without a chosen double (aceDeuceExtraRoll)', () => {
    const state = asodioState('w: 13 outx14 ; b: outx15', {
      rules: { extraRolls: { aceDeuceExtraRoll: true } },
    });
    expect(play(state, [1, 2], 'out/24 out/23').toMove).toBe('white');
    // Not when only one of the dice was played.
    const blocked = asodioState('w: outx15 ; b: 1x2 2x2 6x11', {
      rules: { extraRolls: { aceDeuceExtraRoll: true } },
    });
    expect(turns(blocked, [1, 2])).toEqual(['-']);
  });

  it('a game that ends with a chain step ends: no extra roll after the last checker is off', () => {
    const state = asodioState('w: 1x4 offx11 ; b: outx15', { preset: GREEK });
    const next = play(state, [1, 1], '1/0 1/0 1/0 1/0');
    expect(asodio.result(next)).toEqual({ winner: 'white', points: 2, reason: 'borneOff' });
    expect(next.toMove).toBe('black');
  });
});

describe('asodio: rules errors', () => {
  it('flags of other games keep the preset value (RULES_CONFLICT)', () => {
    const bad = [
      resolveRules('asodio.kafeneio', { capture: { captureMode: 'none' } }),
      resolveRules('asodio.aceyDeuceyAmerican', {
        board: { startPosition: 'portes' },
        entry: { firstEntryGate: false },
      }),
      resolveRules('asodio.kafeneio', { primes: { p1NoPrimeOwnStart: true } }),
      resolveRules('asodio.kafeneio', { capture: { intermediatePinBlocks: true } }),
      resolveRules('asodio.aceyDeuceyAmerican', { capture: { noHitAndRunInHome: true } }),
    ];
    for (const rules of bad) {
      expect(codeOf(() => asodio.initialState({ startingPlayer: 'white', rules }))).toBe(
        'RULES_CONFLICT',
      );
    }
  });

  it('flags that are not built yet throw NOT_SUPPORTED', () => {
    const notYet = [
      resolveRules(GREEK, { capture: { nominateBlot: true } }),
      resolveRules(GREEK, { specialRolls: { complementaryDoubles: true } }),
      resolveRules(AMERICAN, { quarters: { quarterGathering: true } }),
      resolveRules('asodio.kafeneio', { scoring: { doublingCube: true } }),
    ];
    for (const rules of notYet) {
      expect(codeOf(() => asodio.initialState({ startingPlayer: 'white', rules }))).toBe(
        'NOT_SUPPORTED',
      );
    }
  });

  it('a board that cannot happen under the rules is INVALID_STATE', () => {
    const pinBar = asodioState('w: bar 24x14 ; b: outx15');
    expect(codeOf(() => asodio.legalTurns(pinBar, [6, 5]))).toBe('INVALID_STATE');
    const hitPin = asodioState('w: 13! 24x14 ; b: 12x2 outx13', { preset: AMERICAN });
    expect(codeOf(() => asodio.legalTurns(hitPin, [6, 5]))).toBe('INVALID_STATE');
    const bad = asodioState('w: outx15 ; b: outx15', { variantData: { nope: 1 } });
    expect(codeOf(() => asodio.legalTurns(bad, [6, 5]))).toBe('INVALID_STATE');
    // A chosen double needs aceDeuceChoosesDouble.
    const owner = asodioState('w: outx15 ; b: outx15', { variantData: { chooseDouble: true } });
    expect(codeOf(() => asodio.legalTurns(owner, [6, 5]))).toBe('INVALID_STATE');
  });

  it('applyTurn refuses bad turns', () => {
    const state = asodioState('w: 24 outx14 ; b: outx15', { dice: [6, 4] });
    expect(
      codeOf(() => asodio.applyTurn(state, { player: 'black', dice: [6, 4], moves: [] })),
    ).toBe('ILLEGAL_TURN');
    expect(codeOf(() => play(state, [6, 4], '24/18 out/21'))).toBe('ILLEGAL_TURN');
    expect(codeOf(() => play(state, [6, 4], 'out/21'))).toBe('ILLEGAL_TURN');
    const other = parseAsodioTurn('out/20 out/21', 'white', [5, 4]);
    expect(codeOf(() => asodio.applyTurn(state, other))).toBe('ILLEGAL_TURN');
    expect(codeOf(() => play(state, [6, 4], 'out/19* out/21'))).toBe('ILLEGAL_TURN');
    expect(play(state, [4, 6], 'out/21 out/19').board.outside.white).toBe(12);
  });

  it('answerPrompt checks the question, the player and the choice', () => {
    const state = asodioState('w: outx15 ; b: outx15', { preset: GREEK });
    expect(codeOf(() => asodio.answerPrompt?.(state, 'white', '3'))).toBe('ILLEGAL_ACTION');
    const chosen = play(state, [1, 2], 'out/24 out/23');
    expect(codeOf(() => asodio.answerPrompt?.(chosen, 'black', '3'))).toBe('ILLEGAL_ACTION');
    expect(codeOf(() => asodio.answerPrompt?.(chosen, 'white', '7'))).toBe('ILLEGAL_ACTION');
  });
});

describe('asodio: the turn flow', () => {
  function step(flow: GameFlow, action: Parameters<typeof applyGameAction>[1]): GameFlow {
    return applyGameAction(flow, action);
  }

  function playAll(flow: GameFlow): GameFlow {
    let current = flow;
    while (current.phase === 'moving') {
      const move = legalNextMoves(current)[0]?.moves[0];
      if (move === undefined) throw new Error('no move');
      current = step(current, { type: 'move', player: current.state.toMove, move });
    }
    return step(current, { type: 'confirm', player: current.state.toMove });
  }

  it('Greek preset: 1-2, choose a double, play it, roll again', () => {
    const state = asodio.initialState({ startingPlayer: 'white', rules: resolveRules(GREEK, {}) });
    let flow = step(createGameFlow({ state, starter: 'white' }), {
      type: 'roll',
      player: 'white',
      dice: [1, 2],
    });
    flow = playAll(flow);
    expect(flow.phase).toBe('awaiting-answer');
    flow = step(flow, { type: 'answer', player: 'white', choice: '3' });
    expect(flow.phase).toBe('moving');
    expect(flow.state.dice).toEqual([3, 3]);
    flow = playAll(flow);
    expect(flow.phase).toBe('awaiting-roll');
    expect(flow.state.toMove).toBe('white');
    expect(flow.lastTurn?.dice).toEqual([3, 3]);
  });

  it('a chosen double with no move passes by itself', () => {
    // 6-6: the entry on 19 is a door and the 2 cannot bear off.
    const state = asodioState('w: 2 outx14 ; b: 6x2 outx13', {
      preset: GREEK,
      variantData: { chooseDouble: true },
    });
    const start: GameFlow = {
      ...createGameFlow({ state, starter: 'white' }),
      phase: 'awaiting-answer',
    };
    const flow = step(start, { type: 'answer', player: 'white', choice: '6' });
    expect(flow.phase).toBe('awaiting-roll');
    expect(flow.state.toMove).toBe('black');
    expect(flow.lastTurn).toEqual({ player: 'white', dice: [6, 6], moves: [] });
  });

  it('random Asodio matches through the flow, with chosen doubles and undos, replay to the same JSON', () => {
    let answers = 0;
    let again = 0;
    (['asodio.kafeneio', GREEK, AMERICAN] as const).forEach((preset, seed) => {
      const rules = resolveRules(preset, { match: { targetPoints: 2 } });
      const dice = createSeededRng(seed + 20);
      const choices = createSeededRng(seed + 2020);
      let flow: MatchFlow = createMatchFlow({ rules, starter: null });
      for (let n = 0; n < 40_000 && matchPhase(flow) !== 'match-over'; n += 1) {
        const action = randomAction(flow, choices, { undo: 0.05 });
        if (action === null) break;
        if (action.type === 'answer') answers += 1;
        const mover = flow.game.state.toMove;
        flow = applyMatchAction(flow, action, { rng: dice });
        if (action.type === 'confirm' && flow.game.state.toMove === mover) again += 1;
      }
      expect(matchPhase(flow)).toBe('match-over');
      expect(JSON.stringify(replay(flow.log))).toBe(JSON.stringify(flow));
    });
    expect(answers).toBeGreaterThan(0);
    expect(again).toBeGreaterThan(0);
  }, 30_000);
});

describe('move origins', () => {
  it('takes only 1-24 as a numeric "from": entries must say "outside"', () => {
    const state = asodio.initialState({ startingPlayer: 'white' });
    const dice: Dice = [1, 2];
    const [turn] = asodio.legalTurns(state, dice);
    expect(turn?.moves.every((move) => move.from === 'outside')).toBe(true);
    const raw = { ...turn!, moves: turn!.moves.map((move) => ({ ...move, from: 25 as const })) };
    expect(codeOf(() => asodio.applyTurn({ ...state, dice }, raw as unknown as Turn))).toBe(
      'ILLEGAL_TURN',
    );
    expect(() => asodio.applyTurn({ ...state, dice }, turn!)).not.toThrow();
  });
});
