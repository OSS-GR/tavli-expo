import { describe, expect, it } from 'vitest';

import { DISTINCT_ROLLS } from '../../dice';
import type { Dice } from '../../dice';
import { formatMove, formatTurn } from '../../move';
import { getPreset, resolveRules } from '../../presets';
import type { RuleOverrides, RuleSet } from '../../rules';
import type { GameState } from '../../state';
import { formatPlakoto, parsePlakotoTurn, plakotoState } from '../../testing/plakoto-notation';
import { getVariant } from '../../variant';
import { VARIANT_REGISTRY, plakoto } from '../index';
import { PLAKOTO_START } from './index';

type Rules = RuleSet | RuleOverrides;

const FEDERATION = getPreset('plakoto.federation');
const INSTANT = resolveRules('plakoto', { mother: { motherRule: 'instant' } });

function state(text: string, rules: Rules = {}, toMove: 'white' | 'black' = 'white'): GameState {
  return plakotoState(text, { rules, toMove });
}

/** The legal turns in notation, in the order the generator returns them. */
function plays(text: string, dice: Dice, rules: Rules = {}, toMove?: 'white' | 'black'): string[] {
  return plakoto.legalTurns(state(text, rules, toMove), dice).map(formatTurn);
}

/** Plays `turn` (notation) and returns the new state. */
function play(s: GameState, dice: Dice, turn: string): GameState {
  return plakoto.applyTurn(s, parsePlakotoTurn(turn, s.toMove, dice));
}

function after(text: string, dice: Dice, turn: string, rules: Rules = {}): string {
  return formatPlakoto(play(state(text, rules), dice, turn).board);
}

function allRolls(): readonly Dice[] {
  return DISTINCT_ROLLS.map(({ dice }) => dice);
}

const illegal = expect.objectContaining({ code: 'ILLEGAL_TURN' });

describe('plakoto.md edge cases', () => {
  it('plakoto.md #1: start with 15 on own 24 each; the first moves come from 24 only', () => {
    const start = plakoto.initialState({ startingPlayer: 'white' });
    expect(formatPlakoto(start.board)).toBe('w: 24x15 ; b: 24x15');
    // In White's numbering, Black is on White's 1.
    expect(start.board.points[23]).toEqual({ white: 15, black: 0, pinned: null });
    expect(start.board.points[0]).toEqual({ white: 0, black: 15, pinned: null });
    expect(start).toMatchObject({ variant: 'plakoto', dice: null, turnNumber: 1 });
    expect(start.variantData).toBeNull();
    for (const dice of allRolls()) {
      for (const turn of plakoto.legalTurns(start, dice)) {
        expect(turn.moves[0]?.from).toBe(24);
      }
    }
  });

  it('plakoto.md #2: landing on a single opponent checker pins it; it cannot move', () => {
    // Black's 17 is White's 8.
    const text = 'w: 24x14 13 ; b: 24x14 17';
    expect(plays(text, [5, 1])).toContain('13/8* 24/23');
    const pinned = after(text, [5, 1], '13/8* 24/23');
    expect(pinned).toBe('w: 24x13 23 8 ; b: 24x14 17!');
    for (const dice of allRolls()) {
      const moves = plays(pinned, dice, {}, 'black').join(' ');
      expect(moves).not.toMatch(/(^| )17\//);
    }
  });

  it('plakoto.md #3: landing on a point with 2+ opponent checkers is illegal', () => {
    const text = 'w: 24x14 13 ; b: 24x13 17x2';
    expect(plays(text, [5, 1]).join(' ')).not.toMatch(/\/8\b/);
    expect(() => after(text, [5, 1], '13/8 24/23')).toThrow(illegal);
  });

  it('plakoto.md #4: landing where the opponent pins our checker is illegal', () => {
    // Black's lone checker on its 17 (White's 8) pins White's checker there.
    const text = 'w: 24x13 13 8! ; b: 24x14 17';
    expect(plays(text, [5, 1]).join(' ')).not.toMatch(/\/8\b/);
    expect(() => after(text, [5, 1], '13/8 24/23')).toThrow(illegal);
  });

  it('plakoto.md #5: landing where we pin an opponent checker is legal (the stack grows)', () => {
    const text = 'w: 24x13 13 8 ; b: 24x14 17!';
    expect(plays(text, [5, 1])).toContain('13/8 24/23');
    expect(after(text, [5, 1], '13/8 24/23')).toBe('w: 24x12 23 8x2 ; b: 24x14 17!');
  });

  it('plakoto.md #6: the pinner moves away → the pinned checker can move next turn', () => {
    const s = state('w: 24x14 8 ; b: 24x14 17!');
    const next = play(s, [3, 1], '8/5 24/23');
    expect(formatPlakoto(next.board)).toBe('w: 24x13 23 5 ; b: 24x14 17');
    expect(plakoto.legalTurns(next, [6, 5]).map(formatTurn)).toContain('17/11 11/6');
  });

  it('plakoto.md #7: two pinners, one leaves → still pinned; both leave → free', () => {
    const text = 'w: 24x13 8x2 ; b: 24x14 17!';
    expect(after(text, [3, 1], '8/5 24/23')).toBe('w: 24x12 23 8 5 ; b: 24x14 17!');
    expect(after(text, [3, 3], '8/5 8/5 24/21 24/21')).toBe('w: 24x11 21x2 5x2 ; b: 24x14 17');
  });

  it('plakoto.md #8: a pinned checker cannot move, so it does not count for the higher-die rule', () => {
    // White's 10 is pinned (by Black's 15). Its 6 (10/4) would be open.
    // From 7 the 6 is blocked (White's 1 = Black's 24), so only the 5 plays.
    const pinned = 'w: 10! 7x14 ; b: 15 24x14';
    expect(plays(pinned, [6, 5])).toEqual(['7/2']);
    // The same checker free (Black now on its 16) could play the 6.
    const free = 'w: 10 7x14 ; b: 16 24x14';
    expect(plays(free, [6, 5])).toContain('10/4 7/2');
  });

  it('plakoto.md #9: 6-5 through a lone opponent checker passes and does not pin it (default)', () => {
    // Black's 18 = White's 7 (one checker). White's 8 is closed, so 13/8/2 is not possible.
    const text = 'w: 24x14 13 ; b: 24x12 18 17x2';
    expect(plays(text, [6, 5])).toContain('13/7* 7/2');
    expect(after(text, [6, 5], '13/7* 7/2')).toBe('w: 24x14 2 ; b: 24x12 18 17x2');
  });

  it('plakoto.md #9: with intermediatePinBlocks=true that combined move is illegal', () => {
    const text = 'w: 24x14 13 ; b: 24x12 18 17x2';
    const rules = { capture: { intermediatePinBlocks: true } };
    const turns = plays(text, [6, 5], rules);
    expect(turns).not.toContain('13/7* 7/2');
    expect(turns).toContain('13/7* 24/19');
    expect(() => after(text, [6, 5], '13/7* 7/2', rules)).toThrow(illegal);
    const s = state(text, rules);
    const pin = parsePlakotoTurn('13/7*', 'white', [6, 5]).moves;
    expect(plakoto.nextMoves(s, [6, 5], pin).map((m) => m.from)).not.toContain(7);
    // A second checker on the pin may move on: the pin stays.
    const two = 'w: 24x13 13 12 ; b: 24x12 18 17x2';
    expect(plays(two, [6, 5], rules)).toContain('13/7* 12/7');
  });

  it('plakoto.md #10: B pins the mother with none left on own 24 → B +2 at once, mid-turn', () => {
    // Black's 1 = White's 24. Black has no checker on its 24.
    const text = 'w: 24 6x14 ; b: 10x14 3';
    const s = state(text, FEDERATION, 'black');
    const turns = plakoto.legalTurns(s, [5, 2]).map(formatTurn);
    // The game ends at the pin; the rest of the roll is not played.
    expect(turns).toContain('3/1*');
    expect(turns).toContain('10/5 3/1*');
    expect(turns).not.toContain('3/1* 10/5');
    const over = play(s, [5, 2], '3/1*');
    expect(formatPlakoto(over.board)).toBe('w: 24! 6x14 ; b: 10x14 1');
    expect(plakoto.result(over)).toEqual({ winner: 'black', points: 2, reason: 'motherPinned' });
    expect(plakoto.isGameOver(over)).toBe(true);
    expect(() => play(s, [5, 2], '3/1* 10/5')).toThrow(illegal);
    // One move at a time: after the pin the turn is complete.
    const pin = parsePlakotoTurn('3/1*', 'black', [5, 2]).moves;
    expect(plakoto.nextMoves(s, [5, 2], pin)).toEqual([]);
  });

  it('plakoto.md #11: B still has checkers on own 24 → the game continues', () => {
    const s = state('w: 24 6x14 ; b: 24 10x13 3', FEDERATION, 'black');
    expect(plakoto.legalTurns(s, [5, 2]).map(formatTurn)).toContain('10/5 3/1*');
    const next = play(s, [5, 2], '3/1* 10/5');
    expect(formatPlakoto(next.board)).toBe('w: 24! 6x14 ; b: 24 10x12 5 1');
    expect(plakoto.result(next)).toBeNull();
    expect(plakoto.prompt?.(next)).toBeNull();
  });

  it('plakoto.md #12: later B moves the last checker off own 24 while pinning → B +2 at that moment', () => {
    const s = state('w: 24! 6x14 ; b: 24 10x13 1', FEDERATION, 'black');
    const turns = plakoto.legalTurns(s, [6, 5]).map(formatTurn);
    expect(turns).toContain('24/18');
    expect(turns).toContain('10/5 24/18');
    const over = play(s, [6, 5], '24/18');
    expect(plakoto.result(over)).toEqual({ winner: 'black', points: 2, reason: 'motherPinned' });
    // With endOfTurn the check waits for the end of the turn.
    const late = state(
      'w: 24! 6x14 ; b: 24 10x13 1',
      {
        mother: { motherRule: 'federation', motherCheckTiming: 'endOfTurn' },
      },
      'black',
    );
    expect(plakoto.legalTurns(late, [6, 5]).map(formatTurn)).not.toContain('24/18');
    const atEnd = play(late, [6, 5], '24/18 18/13');
    expect(plakoto.result(atEnd)).toEqual({ winner: 'black', points: 2, reason: 'motherPinned' });
  });

  it('plakoto.md #13: then A pins B’s mother → both pinned → draw, 0 points', () => {
    // White's mother is pinned; Black's lone checker on its 24 is White's 1.
    const s = state('w: 24! 6x13 3 ; b: 24 10x13 1', FEDERATION);
    const turns = plakoto.legalTurns(s, [5, 2]).map(formatTurn);
    expect(turns).toContain('3/1*');
    const draw = play(s, [5, 2], '3/1*');
    expect(plakoto.result(draw)).toEqual({ winner: null, points: 0, reason: 'bothMothersPinned' });
  });

  it('plakoto.md #14: B moves the pinner away → A’s mother is free; no special result', () => {
    // The pinner sits on B's own point 1, so it can only leave by bearing
    // off, and that needs B's 24 empty: in the position of #11 it cannot
    // move at all.
    const s11 = state('w: 24! 6x14 ; b: 24 10x13 1', FEDERATION, 'black');
    for (const dice of allRolls()) {
      expect(plakoto.legalTurns(s11, dice).map(formatTurn).join(' ')).not.toMatch(/(^| )1\//);
    }
    // It can happen when the check is at the end of the turn: B pins and
    // bears the pinner off in the same turn.
    const rules = { mother: { motherRule: 'federation', motherCheckTiming: 'endOfTurn' } } as const;
    const s = state('w: 24 6x14 ; b: 3 2 offx13', rules, 'black');
    const free = play(s, [2, 1], '3/1* 1/0');
    expect(formatPlakoto(free.board)).toBe('w: 24 6x14 ; b: 2 offx14');
    expect(plakoto.result(free)).toBeNull();
    // With motherRule "none" the pinner leaves when B bears it off.
    const none = { mother: { motherRule: 'none' } } as const;
    const goesOn = play(state('w: 24! 6x14 ; b: 6 1 offx13', none, 'black'), [2, 1], '1/0 6/4');
    expect(formatPlakoto(goesOn.board)).toBe('w: 24 6x14 ; b: 4 offx14');
    expect(plakoto.result(goesOn)).toBeNull();
  });

  it('plakoto.md #15: A has 2+ checkers on own 24 → B cannot land there', () => {
    const text = 'w: 24x2 6x13 ; b: 10x14 3';
    for (const dice of allRolls()) {
      expect(plays(text, dice, FEDERATION, 'black').join(' ')).not.toMatch(/\/1\b/);
    }
  });

  it('plakoto.md #16: all home but one home checker pinned → no bearing off; other moves or pass', () => {
    // White's 5 is pinned by Black's 20. White's 1 is Black's 24 (closed).
    const text = 'w: 5! 4x5 3x5 2x4 ; b: 20 24x14';
    expect(plays(text, [6, 5])).toEqual(['-']);
    const small = plays(text, [2, 1]);
    expect(small.length).toBeGreaterThan(0);
    expect(small.join(' ')).not.toContain('/0');
    // The flag bearOffWhilePinned allows it.
    const flag = { bearOff: { bearOffWhilePinned: true } };
    expect(plays(text, [4, 3], flag)).toContain('4/0 3/0');
    expect(plays(text, [4, 3]).join(' ')).not.toContain('/0');
  });

  it('plakoto.md #17: B pins an A checker in A’s home during bear-off → A stops bearing off', () => {
    const text = 'w: 6 3x5 2x4 offx5 ; b: 24x15';
    expect(plays(text, [6, 5]).join(' ')).toContain('6/0');
    // Black 24/19 lands on White's 6 and pins it.
    const pinned = play(state(text, {}, 'black'), [5, 3], '24/19* 24/21');
    expect(formatPlakoto(pinned.board)).toBe('w: 6! 3x5 2x4 offx5 ; b: 24x13 21 19');
    expect(plakoto.legalTurns(pinned, [6, 5]).map(formatTurn)).toEqual(['-']);
    const small = plakoto.legalTurns(pinned, [2, 1]).map(formatTurn).join(' ');
    expect(small).not.toContain('/0');
  });

  it('plakoto.md #18: the winner bears off the last checker, the loser has 0 off → 2 points', () => {
    const over = play(state('w: 1 ; b: 10x15'), [2, 1], '1/0:2');
    expect(plakoto.result(over)).toEqual({ winner: 'white', points: 2, reason: 'borneOff' });
    const single = play(state('w: 1 ; b: 10x14 offx1'), [2, 1], '1/0:2');
    expect(plakoto.result(single)).toEqual({ winner: 'white', points: 1, reason: 'borneOff' });
  });

  it('plakoto.md #19: a player with no legal move (pinned or blocked) passes', () => {
    // White's 13s face six black doors (White's 12–7), and White's 20 is pinned.
    const text = 'w: 20! 13x14 ; b: 18x2 17x2 16x2 15x2 14x2 13x2 5 24x2';
    for (const dice of allRolls()) expect(plays(text, dice)).toEqual(['-']);
    const s = state(text);
    const next = plakoto.applyTurn(s, { player: 'white', dice: [6, 6], moves: [] });
    expect(next).toMatchObject({ toMove: 'black', turnNumber: 2, board: s.board });
  });

  it('plakoto.md #20: motherRule="instant" → pinning the mother wins +2 at once; no draw', () => {
    const s = state('w: 24 6x14 ; b: 24 10x13 3', INSTANT, 'black');
    const turns = plakoto.legalTurns(s, [5, 2]).map(formatTurn);
    expect(turns).toContain('3/1*');
    const over = play(s, [5, 2], '3/1*');
    expect(plakoto.result(over)).toEqual({ winner: 'black', points: 2, reason: 'motherPinned' });
    // The position of #13 cannot happen: one pinned mother already ended the game.
    const s13 = state('w: 24! 6x13 3 ; b: 24 10x13 1', INSTANT);
    expect(plakoto.result(s13)).toEqual({ winner: 'black', points: 2, reason: 'motherPinned' });
    expect(() => plakoto.legalTurns(s13, [5, 2])).toThrow(illegal);
  });
});

describe('Plakoto variant', () => {
  it('is in the registry and starts from the plakoto preset', () => {
    expect(getVariant(VARIANT_REGISTRY, 'plakoto')).toBe(plakoto);
    expect(PLAKOTO_START).toEqual({ points: { 24: 15 } });
    const start = plakoto.initialState({ startingPlayer: 'black' });
    expect(start.rules).toEqual(getPreset('plakoto'));
    expect(start.toMove).toBe('black');
    const federation = plakoto.initialState({ startingPlayer: 'white', rules: FEDERATION });
    expect(federation.rules.mother.motherRule).toBe('federation');
  });

  it('rejects flags of other games and the unbuilt replay option', () => {
    expect(() =>
      plakoto.initialState({
        startingPlayer: 'white',
        rules: resolveRules('plakoto', { scoring: { backgammonScores3: true } }),
      }),
    ).toThrow(
      expect.objectContaining({ code: 'RULES_CONFLICT', path: 'rules.scoring.backgammonScores3' }),
    );
    expect(() =>
      plakoto.initialState({ startingPlayer: 'white', rules: getPreset('portes') }),
    ).toThrow(expect.objectContaining({ code: 'RULES_CONFLICT' }));
    for (const motherRule of ['offerConcede', 'federation'] as const) {
      expect(() =>
        plakoto.initialState({
          startingPlayer: 'white',
          rules: resolveRules('plakoto', { mother: { motherRule, mutualMotherPin: 'replay' } }),
        }),
      ).toThrow(
        expect.objectContaining({ code: 'NOT_SUPPORTED', path: 'rules.mother.mutualMotherPin' }),
      );
    }
    // With "instant" or "none" both mothers are never pinned, so the flag does nothing.
    const rules = resolveRules('plakoto', {
      mother: { motherRule: 'instant', mutualMotherPin: 'replay' },
    });
    expect(plakoto.initialState({ startingPlayer: 'white', rules }).rules).toEqual(rules);
  });

  // #179: a checker leaves a door, pins a blot, and moves on with the other die.
  it('after a pin, the pinner may play the other die, in both dice orders', () => {
    // White's door on 13. A Black blot on White's 8 (Black's 17).
    const s = state('w: 13x2 6x13 ; b: 17 24x14');
    const next = (dice: Dice, played: string) =>
      plakoto
        .nextMoves(s, dice, played === '' ? [] : parsePlakotoTurn(played, 'white', dice).moves)
        .map(formatMove);
    for (const dice of [
      [5, 3],
      [3, 5],
    ] as Dice[]) {
      expect(next(dice, '')).toContain('13/8*');
      expect(next(dice, '13/8*')).toContain('8/5');
      expect(next(dice, '13/8* 8/5')).toEqual([]);
      // The pinned checker is free again once its pinner moves on.
      expect(after('w: 13x2 6x13 ; b: 17 24x14', dice, '13/8* 8/5')).toBe(
        'w: 13 6x13 5 ; b: 24x14 17',
      );
    }
  });

  it('higherDieRule=false lets the player choose the lower die', () => {
    // Either die alone, not both: 13/7 (6) or 13/8 (5); then everything is closed.
    const text = 'w: 13 1x14 ; b: 23x2 20x13';
    expect(plays(text, [6, 5])).toEqual(['13/7']);
    expect(plays(text, [6, 5], { movement: { higherDieRule: false } })).toEqual(['13/7', '13/8']);
  });

  it('applyTurn checks the turn and never changes the state', () => {
    const s = plakoto.initialState({ startingPlayer: 'white' });
    const copy = JSON.stringify(s);
    const next = play(s, [6, 5], '24/18 24/19');
    expect(JSON.stringify(s)).toBe(copy);
    expect(next).toMatchObject({ toMove: 'black', dice: null, turnNumber: 2, variantData: null });
    expect(() => play(s, [6, 5], '24/18')).toThrow(illegal);
    expect(() => play(s, [6, 5], '24/18 24/18')).toThrow(illegal);
    expect(() => play(s, [6, 5], '24/18* 24/19')).toThrow(illegal);
    expect(() =>
      plakoto.applyTurn(s, { ...parsePlakotoTurn('24/18 24/19', 'black', [6, 5]) }),
    ).toThrow(illegal);
    expect(() => play({ ...s, dice: [4, 4] }, [6, 5], '24/18 24/19')).toThrow(illegal);
  });

  it('rejects a board with checkers on the bar', () => {
    const s = plakoto.initialState({ startingPlayer: 'white' });
    const bad: GameState = {
      ...s,
      board: {
        ...s.board,
        points: s.board.points.map((p, i) => (i === 23 ? { ...p, white: 14 } : p)),
        bar: { white: 1, black: 0 },
      },
    };
    expect(() => plakoto.legalTurns(bad, [6, 5])).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    );
  });
});
