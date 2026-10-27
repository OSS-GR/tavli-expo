/**
 * Fevga rules: one test per numbered edge case in `docs/rules/fevga.md`
 * (named `fevga.md #N: ...`; `rules-docs.test.ts` checks that every case has
 * one), the shared dice and bear-off cases of `tavli-match.md` as they play
 * in Fevga, every flag, and the errors.
 */

import { describe, expect, it } from 'vitest';

import { DIE_VALUES } from '../../dice';
import type { Dice } from '../../dice';
import { formatMove, formatTurn } from '../../move';
import type { Move } from '../../move';
import { createMatch, startNextGame } from '../../match';
import { otherPlayerPoint } from '../../numbering';
import type { PlayerId } from '../../player';
import { getPreset, resolveRules } from '../../presets';
import type { RuleOverrides, RuleSet } from '../../rules';
import type { GameState } from '../../state';
import { getVariant } from '../../variant';
import { fevgaState } from '../../testing/fevga-notation';
import { startBoard } from '../../testing/fixtures';
import { parseTurn } from '../../testing/position-notation';
import { VARIANT_REGISTRY } from '../index';
import { fevga } from './index';

const START = 'w: 24x15 ; b: 24x15';
const illegal = expect.objectContaining({ code: 'ILLEGAL_TURN' });

/**
 * #15–#17 use one position. Black's runner is on B18 (= W6) and its other
 * 14 checkers are on B24 (= W12), held there by Black's runner rule. The
 * runner's six landing points are W5–W1 and W24. White holds all six.
 */
const BLOCK = 'w: 24x10 5 4 3 2 1 ; b: 18 24x14';

/** The legal plays, as sorted notation. */
function plays(state: GameState, dice: Dice): string[] {
  return fevga
    .legalTurns(state, dice)
    .map(formatTurn)
    .sort((a, b) => a.localeCompare(b));
}

function next(state: GameState, dice: Dice, played: readonly Move[] = []): string[] {
  return fevga.nextMoves(state, dice, played).map(formatMove);
}

function play(state: GameState, text: string, dice: Dice): GameState {
  return fevga.applyTurn(state, parseTurn(text, state.toMove, dice));
}

function rules(overrides: RuleOverrides): RuleSet {
  return resolveRules('fevga', overrides);
}

/** Checkers of `player` on own point `p` (1–24). */
function at(state: GameState, player: PlayerId, p: number): number {
  const abs = player === 'white' ? p : otherPlayerPoint(p, 'parallel');
  return state.board.points[abs - 1]?.[player] ?? 0;
}

/** True when `player` has a checker on every own point from `low` to `high`. */
function holds(state: GameState, player: PlayerId, low: number, high: number): boolean {
  for (let p = low; p <= high; p += 1) if (at(state, player, p) === 0) return false;
  return true;
}

/** True when `player` (to move) has no legal move for any roll. */
function blockedForEveryRoll(state: GameState): boolean {
  return DIE_VALUES.every((a) =>
    DIE_VALUES.every((b) => fevga.legalTurns(state, [a, b]).every((t) => t.moves.length === 0)),
  );
}

describe('fevga.md edge cases', () => {
  it('fevga.md #1: start — White 15 on W24, Black 15 on W12 (= B24)', () => {
    const state = fevga.initialState({ startingPlayer: 'black' });
    expect(state).toMatchObject({ variant: 'fevga', toMove: 'black', dice: null, turnNumber: 1 });
    expect(state.board).toEqual(startBoard('fevga'));
    expect(state.board.points[23]).toEqual({ white: 15, black: 0, pinned: null });
    expect(state.board.points[11]).toEqual({ white: 0, black: 15, pinned: null });
    expect(state.board).toEqual(fevgaState(START).board);
  });

  it('fevga.md #2: first turn, any roll — only the runner may move', () => {
    const start = fevgaState(START);
    for (const a of DIE_VALUES) {
      for (const b of DIE_VALUES) {
        if (b > a || (a === 5 && b === 5)) continue; // 5-5 passes 11 mid-turn (#6)
        for (const turn of fevga.legalTurns(start, [a, b])) {
          // One checker: the first move leaves 24, each next move goes on from there.
          turn.moves.forEach((move, i) => {
            expect(move.from).toBe(i === 0 ? 24 : turn.moves[i - 1]?.to);
          });
        }
      }
    }
    // After the first move, only the runner is offered.
    const first = parseTurn('24/19', 'white', [5, 3]).moves;
    expect(next(start, [5, 3], first)).toEqual(['19/16']);
  });

  it('fevga.md #3: opening 6-6 — 24/18, then 12 is held; only one 6 is played', () => {
    const start = fevgaState(START);
    expect(plays(start, [6, 6])).toEqual(['24/18']);
    expect(next(start, [6, 6])).toEqual(['24/18']);
    expect(next(start, [6, 6], parseTurn('24/18', 'white', [6, 6]).moves)).toEqual([]);
  });

  it('fevga.md #4: opening 4-4 — 24/20/16; the third 4 would land on 12', () => {
    expect(plays(fevgaState(START), [4, 4])).toEqual(['24/20 20/16']);
  });

  it('fevga.md #5: opening 3-3 — 24/21/18/15; the fourth 3 would land on 12', () => {
    expect(plays(fevgaState(START), [3, 3])).toEqual(['24/21 21/18 18/15']);
  });

  it('fevga.md #6: opening 5-5 — 24/19/14/9 passes 12; any checker plays the fourth 5', () => {
    const start = fevgaState(START);
    expect(plays(start, [5, 5])).toEqual(['24/19 19/14 14/9 24/19', '24/19 19/14 14/9 9/4']);
    const three = parseTurn('24/19 19/14 14/9', 'white', [5, 5]).moves;
    expect(next(start, [5, 5], three)).toEqual(['24/19', '9/4']);
  });

  it('fevga.md #7: opening 6-5 — runner 24/13 (via 18 or 19); the restriction stays on', () => {
    const start = fevgaState(START);
    expect(plays(start, [6, 5])).toEqual(['24/18 18/13']);
    const after = play(start, '24/19 19/13', [6, 5]);
    expect(after.board).toEqual(fevgaState('w: 24x14 13 ; b: 24x15').board);
    // White's next turn: 13 > 11, so only the runner may start.
    const again = { ...after, toMove: 'white' as const };
    expect(next(again, [4, 3])).toEqual(['13/9', '13/10']);
  });

  it('fevga.md #8: runner on 13, roll 2-1 — 13/11 first, then the 1 with any checker', () => {
    const state = fevgaState('w: 24x14 13 ; b: 24x15');
    expect(plays(state, [2, 1])).toEqual(['13/11 11/10', '13/11 24/23']);
    expect(next(state, [2, 1])).toEqual(['13/11']);
    expect(next(state, [2, 1], parseTurn('13/11', 'white', [2, 1]).moves)).toEqual([
      '24/23',
      '11/10',
    ]);
    expect(() => play(state, '13/12 12/11', [2, 1])).toThrow(illegal);
    expect(() => play(state, '24/23 13/11', [2, 1])).toThrow(illegal);
  });

  it('fevga.md #9: runner on 13, roll 1-1, opponent still on 12 — no move, pass', () => {
    const state = fevgaState('w: 24x14 13 ; b: 24x15');
    expect(plays(state, [1, 1])).toEqual(['-']);
    expect(next(state, [1, 1])).toEqual([]);
    expect(play(state, '-', [1, 1]).board).toEqual(state.board);
  });

  it('fevga.md #10: landing on a point with one opponent checker is illegal', () => {
    // One Black checker on W7 (= B19).
    const state = fevgaState('w: 13 10x14 ; b: 19 24x14');
    const turns = fevga.legalTurns(state, [3, 2]);
    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) for (const move of turn.moves) expect(move.to).not.toBe(7);
    expect(next(state, [3, 2])).not.toContain('10/7');
    expect(() => play(state, '10/7 13/11', [3, 2])).toThrow(illegal);
  });

  it('fevga.md #11: a combined move through an opponent-held point is illegal (6-1 from 20)', () => {
    // Black on W14 (= B2) and W19 (= B7). 13 is free, but 20/14 and 20/19 are not.
    const state = fevgaState('w: 20 10x14 ; b: 7 2 24x13');
    for (const turn of fevga.legalTurns(state, [6, 1])) {
      for (const move of turn.moves) expect(move.from).not.toBe(20);
    }
    expect(next(state, [6, 1]).filter((m) => m.startsWith('20/'))).toEqual([]);
    expect(() => play(state, '20/14 14/13', [6, 1])).toThrow(illegal);
    expect(() => play(state, '20/19 19/13', [6, 1])).toThrow(illegal);
  });

  it('fevga.md #12: a play that ends holding 19–24 is illegal (P1); then one die only', () => {
    // Black holds W18–W14 (= B6–B2). Every two-dice play of 5-4 ends on 19–24.
    const state = fevgaState('w: 24x9 23x2 22 21 20 2 ; b: 6 5 4 3 2 24x10');
    expect(plays(state, [5, 4])).toEqual(['24/20']);
    expect(() => play(state, '24/19 24/20', [5, 4])).toThrow(illegal);
    expect(() => play(state, '24/19', [5, 4])).toThrow(illegal); // 24/19 alone is P1 too
    // Without P1 the full play is fine.
    const off = rules({ primes: { p1NoPrimeOwnStart: false } });
    expect(() => play({ ...state, rules: off }, '24/19 24/20', [5, 4])).not.toThrow();
  });

  it('fevga.md #12: ... or a different full play that does not end on 19–24', () => {
    // 14 is free now, and 23 has one checker.
    const state = fevgaState('w: 24x10 23 22 21 20 2 ; b: 6 5 4 3 24x11');
    expect(plays(state, [5, 4])).toEqual(['23/19 19/14', '24/19 23/19']);
    expect(() => play(state, '24/19 24/20', [5, 4])).toThrow(illegal);
  });

  it('fevga.md #13: a play that ends holding own 6–11 is illegal (P2)', () => {
    const state = fevgaState('w: 24x9 13 10 9 8 7 6 ; b: 5x15');
    for (const turn of fevga.legalTurns(state, [2, 1])) {
      expect(holds(fevga.applyTurn(state, turn), 'white', 6, 11)).toBe(false);
    }
    expect(() => play(state, '13/11 24/23', [2, 1])).toThrow(illegal);
    expect(() => play(state, '13/12 12/11', [2, 1])).toThrow(illegal);
    expect(play(state, '13/11 11/10', [2, 1]).toMove).toBe('black');
  });

  it('fevga.md #14: six held points elsewhere (13–18) are legal', () => {
    const state = fevgaState('w: 24x9 20 18 17 16 15 14 ; b: 10x15');
    for (const text of ['20/14 14/13', '20/19 19/13']) {
      const after = play(state, text, [6, 1]);
      expect(holds(after, 'white', 13, 18)).toBe(true);
    }
    expect(plays(state, [6, 1])).toContain('20/14 14/13');
  });

  it('fevga.md #15: P3 — a play that leaves the opponent a move beats one that does not', () => {
    const state = fevgaState(BLOCK);
    // 24/18 24/23 (or 24/18 18/17) keeps every landing point: Black could not move.
    expect(() => play(state, '24/18 24/23', [6, 1])).toThrow(illegal);
    expect(() => play(state, '24/18 18/17', [6, 1])).toThrow(illegal);
    // So White must open a home point.
    expect(plays(state, [6, 1])).toEqual(['24/18 2/1', '24/18 3/2', '24/18 4/3', '24/18 5/4']);
    const after = play(state, '24/18 5/4', [6, 1]);
    expect(blockedForEveryRoll(after)).toBe(false);
  });

  it('fevga.md #16: P3 — if every play leaves the opponent no move, any is legal; they pass', () => {
    const state = fevgaState(BLOCK);
    // 6-6: the home checkers cannot move 6 (not all home), 18/12 lands on Black.
    expect(plays(state, [6, 6])).toEqual(['24/18 24/18 24/18 24/18']);
    // 6-5: both plays keep the block.
    expect(plays(state, [6, 5])).toEqual(['24/18 18/13', '24/18 24/19']);
    for (const dice of [
      [6, 6],
      [6, 5],
    ] as const) {
      for (const turn of fevga.legalTurns(state, dice)) {
        expect(blockedForEveryRoll(fevga.applyTurn(state, turn))).toBe(true);
      }
    }
  });

  it('fevga.md #17: an opponent stuck by their own runner rule counts as "no legal move" for P3', () => {
    const state = fevgaState(BLOCK);
    // Black's 14 checkers on B24 could move without the runner rule...
    const noRunner = { ...state, rules: rules({ movement: { runnerRule: false } }) };
    expect(play(noRunner, '24/18 24/23', [6, 1]).toMove).toBe('black');
    // ...but with it, only Black's runner may move, and it is blocked.
    expect(() => play(state, '24/18 24/23', [6, 1])).toThrow(illegal);
    const after = play(state, '24/18 24/18 24/18 24/18', [6, 6]);
    expect(blockedForEveryRoll(after)).toBe(true);
    expect(fevga.legalTurns(after, [3, 1])).toEqual([{ player: 'black', dice: [3, 1], moves: [] }]);
  });

  it('fevga.md #18: bearing off follows the shared rules; a checker never leaves home', () => {
    const black = 'b: 24x15';
    // tavli-match.md #14: die 6, highest checker on 4 → bear off from 4.
    const high = fevgaState(`w: 4 2x14 ; ${black}`);
    expect(fevga.nextMoves(high, [6, 1], [])).toContainEqual({
      from: 4,
      to: 'off',
      die: 6,
      capture: 'none',
    });
    // tavli-match.md #15: die 3, point 3 empty, a checker on 5 → 5/2, not 2/0.
    expect(next(fevgaState(`w: 5 2x14 ; ${black}`), [3, 3])).toEqual(['5/2']);
    // tavli-match.md #16: with a 2, 6/4 is allowed instead of bearing off from 2.
    expect(next(fevgaState(`w: 6 2x14 ; ${black}`), [2, 2])).toEqual(['6/4', '2/0']);
    // tavli-match.md #17: the last checker comes home, then the other die bears off.
    const last = play(fevgaState(`w: 7 6x14 ; ${black}`), '7/6 6/0', [6, 1]);
    expect(last.board.off.white).toBe(1);
    // No bear-off while a checker is outside home.
    const out = fevgaState(`w: 8 6x14 ; ${black}`);
    expect(next(out, [6, 5]).some((m) => m.endsWith('/0'))).toBe(false);
    // All home: every move stays in home or goes off.
    const home = fevgaState(`w: 6x5 5x5 3x5 ; ${black}`);
    for (const a of DIE_VALUES) {
      for (const b of DIE_VALUES) {
        for (const turn of fevga.legalTurns(home, [a, b])) {
          for (const move of turn.moves) expect(move.to === 'off' || move.to <= 6).toBe(true);
        }
      }
    }
  });

  it('fevga.md #19: the winner bears off 15 while the loser has 0 off → 2 points', () => {
    const state = fevgaState('w: 1 ; b: 24x15');
    const won = play(state, '1/0:6', [6, 5]);
    expect(fevga.isGameOver(won)).toBe(true);
    expect(fevga.result(won)).toEqual({ winner: 'white', points: 2, reason: 'borneOff' });
    // The loser bore off at least one → single (1 point).
    const single = play(fevgaState('w: 1 ; b: 1x14'), '1/0:6', [6, 5]);
    expect(fevga.result(single)).toEqual({ winner: 'white', points: 1, reason: 'borneOff' });
    expect(() => fevga.legalTurns(won, [3, 1])).toThrow(illegal);
  });
});

describe('Fevga: shared dice rules (tavli-match.md)', () => {
  // The runner on W13 can play 13/7 or 13/8 but not both: Black holds W2.
  const EITHER = 'w: 13 1x14 ; b: 14 24x14';

  it('tavli-match.md #10: either die alone but not both → must play the higher die', () => {
    expect(plays(fevgaState(EITHER), [6, 5])).toEqual(['13/7']);
    expect(next(fevgaState(EITHER), [6, 5])).toEqual(['13/7']);
    expect(() => play(fevgaState(EITHER), '13/8', [6, 5])).toThrow(illegal);
  });

  it('higherDieRule false: either die may be played', () => {
    const state = fevgaState(EITHER, { rules: rules({ movement: { higherDieRule: false } }) });
    expect(plays(state, [6, 5])).toEqual(['13/7', '13/8']);
  });

  it('tavli-match.md #11: the 6 is blocked first, but 5 then 6 works → must play both', () => {
    // Runner on 13 with 6-5: 13/7 is blocked (Black on W7), 13/8/2 is open.
    const state = fevgaState('w: 24x14 13 ; b: 19 24x14');
    expect(plays(state, [6, 5])).toContain('13/8 8/2');
    expect(fevga.legalTurns(state, [6, 5]).every((t) => t.moves.length === 2)).toBe(true);
  });
});

describe('Fevga flags', () => {
  it('runnerRule false: two checkers may leave 24 at once', () => {
    const state = fevgaState(START, { rules: rules({ movement: { runnerRule: false } }) });
    expect(plays(state, [6, 5])).toEqual(['24/18 18/13', '24/18 24/19']);
  });

  it('runnerTarget reachQuarter: reaching own 12 frees the others (only when 12 is empty)', () => {
    // Black has left its start, so W12 is free.
    const text = 'w: 24x14 13 ; b: 2x15';
    expect(plays(fevgaState(text), [2, 1])).toEqual(['13/11 11/10', '13/11 24/23']);
    const quarter = rules({ movement: { runnerTarget: 'reachQuarter' } });
    expect(plays(fevgaState(text, { rules: quarter }), [2, 1])).toEqual([
      '13/11 11/10',
      '13/11 24/23',
      '13/12 24/22',
    ]);
  });

  it('p2Window 7-12: the P2 window moves to own 7–12', () => {
    const state = fevgaState('w: 24x9 13 11 10 9 8 7 ; b: 5x15');
    expect(play(state, '13/12 24/22', [2, 1]).toMove).toBe('black');
    const window = rules({ primes: { p2Window: '7-12' } });
    expect(() => play({ ...state, rules: window }, '13/12 24/22', [2, 1])).toThrow(illegal);
    // And 6–11 is allowed then.
    const sixToEleven = fevgaState('w: 24x9 13 10 9 8 7 6 ; b: 5x15', { rules: window });
    expect(play(sixToEleven, '13/11 24/23', [2, 1]).toMove).toBe('black');
  });

  it('p2NoPrimeFrontOfMother false: own 6–11 may be held', () => {
    const state = fevgaState('w: 24x9 13 10 9 8 7 6 ; b: 5x15', {
      rules: rules({ primes: { p2NoPrimeFrontOfMother: false } }),
    });
    expect(play(state, '13/11 24/23', [2, 1]).toMove).toBe('black');
  });

  it('p3MustLeaveMove false: a full block is allowed', () => {
    const state = fevgaState(BLOCK, {
      rules: rules({ primes: { p3MustLeaveMove: false } }),
    });
    expect(plays(state, [6, 1])).toContain('24/18 24/23');
  });

  it('p3Priority beforeDiceRule: same results when no shorter play avoids the block', () => {
    const state = fevgaState(BLOCK, {
      rules: rules({ primes: { p3Priority: 'beforeDiceRule' } }),
    });
    expect(plays(state, [6, 1])).toEqual(['24/18 2/1', '24/18 3/2', '24/18 4/3', '24/18 5/4']);
    // Black is already blocked before White moves, so no play (not even
    // giving up the dice) leaves a move: White plays the full roll.
    expect(plays(state, [6, 6])).toEqual(['24/18 24/18 24/18 24/18']);
  });

  it('primeRulesOff: P1, P2 and P3 are all off', () => {
    const off = rules({
      primes: {
        primeRulesOff: true,
        p1NoPrimeOwnStart: false,
        p2NoPrimeFrontOfMother: false,
        p3MustLeaveMove: false,
      },
    });
    const p1 = fevgaState('w: 24x9 23x2 22 21 20 2 ; b: 6 5 4 3 2 24x10', { rules: off });
    expect(plays(p1, [5, 4])).toContain('24/19 24/20');
    const p2 = fevgaState('w: 24x9 13 10 9 8 7 6 ; b: 5x15', { rules: off });
    expect(play(p2, '13/11 24/23', [2, 1]).toMove).toBe('black');
    expect(plays(fevgaState(BLOCK, { rules: off }), [6, 1])).toContain('24/18 24/23');
  });

  it('noPrimeOwnHome and primeCheckTiming "afterEachMove" are not built yet: NOT_SUPPORTED', () => {
    for (const [overrides, path] of [
      [{ primes: { noPrimeOwnHome: true } }, 'rules.primes.noPrimeOwnHome'],
      [{ primes: { primeCheckTiming: 'afterEachMove' } }, 'rules.primes.primeCheckTiming'],
    ] as const) {
      expect(() =>
        fevga.initialState({ startingPlayer: 'white', rules: rules(overrides) }),
      ).toThrow(expect.objectContaining({ code: 'NOT_SUPPORTED', path }));
    }
  });

  it('rejects flags of other games with RULES_CONFLICT', () => {
    const conflict = expect.objectContaining({ code: 'RULES_CONFLICT' });
    for (const preset of ['portes', 'plakoto', 'asodio.kafeneio']) {
      expect(() =>
        fevga.initialState({ startingPlayer: 'white', rules: getPreset(preset) }),
      ).toThrow(conflict);
    }
    for (const overrides of [
      { capture: { captureMode: 'pin' } },
      { bearOff: { exactBearOff: true } },
      { scoring: { method: 'perChecker' } },
    ] satisfies RuleOverrides[]) {
      const bad = rules(overrides);
      expect(() => fevga.initialState({ startingPlayer: 'white', rules: bad })).toThrow(conflict);
      expect(() => fevga.legalTurns(fevgaState(START, { rules: bad }), [3, 1])).toThrow(conflict);
    }
  });

  it('accepts match flags, which the match and turn flow read', () => {
    const own = rules({ match: { targetPoints: 5, rotation: ['fevga'] } });
    expect(fevga.initialState({ startingPlayer: 'white', rules: own }).rules).toEqual(own);
  });
});

describe('Fevga variant', () => {
  it('is in the variant registry and moves in parallel', () => {
    expect(getVariant(VARIANT_REGISTRY, 'fevga')).toBe(fevga);
    expect(fevga.direction).toBe('parallel');
  });

  it('uses the fevga preset by default', () => {
    expect(fevga.initialState({ startingPlayer: 'white' }).rules).toEqual(getPreset('fevga'));
  });

  it('plays a Fevga-only match', () => {
    const match = createMatch({ rules: rules({ match: { rotation: ['fevga'] } }) });
    expect(startNextGame(match, 'black')).toMatchObject({ variant: 'fevga', toMove: 'black' });
  });

  it('plays a turn for Black in Black’s own numbering', () => {
    const state = fevga.initialState({ startingPlayer: 'black' });
    expect(plays(state, [6, 5])).toEqual(['24/18 18/13']);
    const after = play(state, '24/18 18/13', [6, 5]);
    // Black 13 = White 1.
    expect(after.board.points[0]).toEqual({ white: 0, black: 1, pinned: null });
    expect(after).toMatchObject({ toMove: 'white', dice: null, turnNumber: 2 });
  });

  it('applyTurn rejects bad turns', () => {
    const state = fevgaState('w: 24x14 13 ; b: 24x15');
    const turn = parseTurn('13/11 24/23', 'white', [2, 1]);
    expect(() => fevga.applyTurn(state, { ...turn, player: 'black' })).toThrow(illegal);
    expect(() => fevga.applyTurn({ ...state, dice: [3, 1] }, turn)).toThrow(illegal);
    expect(() => fevga.applyTurn(state, { ...turn, dice: [7, 1] as unknown as Dice })).toThrow(
      illegal,
    );
    expect(() => play(state, '13/11', [2, 1])).toThrow(illegal); // too few dice
    expect(() => play(state, '13/10 24/23', [2, 1])).toThrow(illegal); // die 3 not rolled
    const marked = { ...turn, moves: turn.moves.map((m) => ({ ...m, capture: 'hit' as const })) };
    expect(() => fevga.applyTurn(state, marked)).toThrow(illegal);
    const wrongTo = {
      ...turn,
      moves: [{ ...turn.moves[0], to: 12 } as Move, turn.moves[1] as Move],
    };
    expect(() => fevga.applyTurn(state, wrongTo)).toThrow(illegal);
    expect(() =>
      fevga.applyTurn(state, { ...turn, moves: [{ ...turn.moves[0], from: 'bar' } as Move] }),
    ).toThrow(illegal);
    // Any order of a legal play is accepted.
    expect(play(state, '13/11 24/23', [1, 2]).toMove).toBe('black');
  });

  it('nextMoves throws for moves that are not a legal prefix', () => {
    const state = fevgaState('w: 24x14 13 ; b: 24x15');
    expect(() => fevga.nextMoves(state, [2, 1], parseTurn('24/23', 'white', [2, 1]).moves)).toThrow(
      illegal,
    );
    const three = parseTurn('13/11 11/10 10/9', 'white', [2, 1]).moves;
    expect(() => fevga.nextMoves(state, [2, 1], three)).toThrow(illegal);
    expect(() => fevga.nextMoves({ ...state, dice: [3, 1] }, [2, 1], [])).toThrow(illegal);
  });

  it('rejects boards Fevga never has', () => {
    const start = fevga.initialState({ startingPlayer: 'white' });
    const points = start.board.points.map((p, i) => (i === 23 ? { ...p, white: 14 } : p));
    const onBar = { ...start, board: { ...start.board, points, bar: { white: 1, black: 0 } } };
    expect(() => fevga.legalTurns(onBar, [3, 1])).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    );
    const pinned = start.board.points.map((p, i) =>
      i === 23
        ? { white: 14, black: 1, pinned: 'black' as const }
        : i === 11
          ? { ...p, black: 14 }
          : p,
    );
    expect(() =>
      fevga.legalTurns({ ...start, board: { ...start.board, points: pinned } }, [3, 1]),
    ).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
    expect(() => fevga.legalTurns(start, [0, 1] as unknown as Dice)).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
  });
});
