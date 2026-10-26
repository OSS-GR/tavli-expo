import { describe, expect, it } from 'vitest';

import { DIE_VALUES } from '../../dice';
import type { Dice } from '../../dice';
import { formatTurn } from '../../move';
import type { Turn } from '../../move';
import { getPreset, resolveRules } from '../../presets';
import type { RuleOverrides } from '../../rules';
import type { GameState } from '../../state';
import { formatPosition, parseTurn, portesState } from '../../testing/position-notation';
import { getVariant } from '../../variant';
import { VARIANT_REGISTRY, portes } from '../index';

const START = 'w: 24x2 13x5 8x3 6x5 ; b: 24x2 13x5 8x3 6x5';

function state(text: string, overrides: RuleOverrides = {}): GameState {
  return portesState(text, { rules: resolveRules('portes', overrides) });
}

/** The legal turns in notation, in the order the generator returns them. */
function plays(text: string, dice: Dice, overrides: RuleOverrides = {}): string[] {
  return portes.legalTurns(state(text, overrides), dice).map(formatTurn);
}

/** Plays `turn` (notation) for White and returns the new position in notation. */
function after(text: string, dice: Dice, turn: string, overrides: RuleOverrides = {}): string {
  const next = portes.applyTurn(state(text, overrides), parseTurn(turn, 'white', dice));
  return formatPosition(next.board);
}

function allRolls(): Dice[] {
  const rolls: Dice[] = [];
  for (const a of DIE_VALUES) for (const b of DIE_VALUES) if (b <= a) rolls.push([a, b]);
  return rolls;
}

const illegal = expect.objectContaining({ code: 'ILLEGAL_TURN' });

describe('portes.md edge cases', () => {
  it('portes.md #1: the start position has 15 checkers each on 24/13/8/6 = 2/5/3/5', () => {
    const start = portes.initialState({ startingPlayer: 'white' });
    expect(formatPosition(start.board)).toBe(START);
    // In White's numbering Black is on 1 (2), 12 (5), 17 (3), 19 (5).
    const black = start.board.points.map((p) => p.black);
    expect([black[0], black[11], black[16], black[18]]).toEqual([2, 5, 3, 5]);
    expect(black.reduce((a, b) => a + b, 0)).toBe(15);
    expect(start).toMatchObject({ variant: 'portes', dice: null, turnNumber: 1, toMove: 'white' });
  });

  it('portes.md #2: landing on an opponent door is illegal', () => {
    // Black has a door on White's 8 (Black's own 17).
    const turns = portes.legalTurns(state('w: 13 6x14 ; b: 17x2 24x13'), [5, 1]);
    const landings = turns.flatMap((t) => t.moves.map((m) => m.to));
    expect(landings).not.toContain(8);
    expect(() => after('w: 13 6x14 ; b: 17x2 24x13', [5, 1], '13/8 6/5')).toThrow(illegal);
  });

  it('portes.md #3: landing on an opponent blot hits it; it goes to the bar', () => {
    const text = 'w: 13 6x14 ; b: 17 24x14';
    expect(plays(text, [5, 1])).toContain('13/8* 6/5');
    expect(after(text, [5, 1], '13/8* 6/5')).toBe('w: 8 6x13 5 ; b: 24x14 bar');
  });

  it('portes.md #4: a checker on the bar that cannot enter loses the whole turn', () => {
    // 6-5 enters on White's 19 or 20 (Black's 6 and 5): both are doors.
    const text = 'w: bar 6x14 ; b: 13x11 6x2 5x2';
    expect(plays(text, [6, 5])).toEqual(['-']);
  });

  it('portes.md #5: two on the bar with 6-6 enter on 19, then any checkers play the other sixes', () => {
    const turns = plays('w: barx2 13x13 ; b: 1x15', [6, 6]);
    expect(turns.every((t) => t.startsWith('25/19 25/19 '))).toBe(true);
    expect(turns.every((t) => t.split(' ').length === 4)).toBe(true);
    expect(turns).toContain('25/19 25/19 19/13 19/13');
    expect(turns).toContain('25/19 25/19 13/7 13/7');
  });

  it('portes.md #6: two on the bar and only one die can enter → enter one, lose the other die', () => {
    // 6 enters on 19; 5 would enter on 20 = Black's own 5, a door.
    expect(plays('w: barx2 13x13 ; b: 5x2 24x13', [6, 5])).toEqual(['25/19']);
  });

  it('portes.md #7: the opponent holds 19–24 → the player passes every roll', () => {
    const text = 'w: bar 13x14 ; b: 6x2 5x2 4x2 3x2 2x2 1x2 24x3';
    for (const dice of allRolls()) expect(plays(text, dice)).toEqual(['-']);
  });

  it('portes.md #8: one checker may not use both dice when the middle point is a door (6-1: 13/7/6)', () => {
    // Doors on White's 7 (Black 18) and 12 (Black 13). 6 is White's own point.
    const text = 'w: 13 6x14 ; b: 18x2 13x2 24x11';
    expect(plays(text, [6, 1])).toEqual(['6/5']);
    expect(() => after(text, [6, 1], '13/7 7/6')).toThrow(illegal);
  });

  it('portes.md #9: hit and continue, 13/8*/5 with 5-3, is legal by default', () => {
    const text = 'w: 13 6x14 ; b: 17 24x14';
    expect(plays(text, [5, 3])).toContain('13/8* 8/5');
    expect(after(text, [5, 3], '13/8* 8/5')).toBe('w: 6x14 5 ; b: 24x14 bar');
  });

  it('portes.md #10: no bearing off while a checker is on the bar or outside home', () => {
    const offMoves = (text: string, dice: Dice): number =>
      portes
        .legalTurns(state(text), dice)
        .flatMap((t) => t.moves)
        .filter((m) => m.to === 'off').length;
    expect(offMoves('w: 9 6x14 ; b: 1x15', [2, 1])).toBe(0);
    expect(offMoves('w: bar 6x14 ; b: 1x15', [6, 6])).toBe(0);
    expect(offMoves('w: bar 6x14 ; b: 1x15', [6, 5])).toBe(0);
    expect(() => after('w: 9 6x14 ; b: 1x15', [6, 1], '6/0 9/8')).toThrow(illegal);
  });

  it('portes.md #11: a checker hit during bear-off must re-enter and come home first', () => {
    // White was bearing off and got hit. No bearing off until it is home again.
    const hit = 'w: bar 6x4 offx10 ; b: 1x15';
    const moves = portes.legalTurns(state(hit), [6, 5]).flatMap((t) => t.moves);
    expect(moves.some((m) => m.from === 'bar')).toBe(true);
    expect(moves.some((m) => m.to === 'off')).toBe(false);
    // Later: one checker still outside on 7. It comes home, then bearing off goes on.
    expect(plays('w: 7 6x4 offx10 ; b: 1x15', [6, 1])).toContain('7/1 1/0');
  });

  it('portes.md #12: loser has borne off 0, none on the bar or in the winner home → 2 points', () => {
    const final = state('w: offx15 ; b: 6x15');
    expect(portes.isGameOver(final)).toBe(true);
    expect(portes.result(final)).toEqual({ winner: 'white', points: 2, reason: 'borneOff' });
  });

  it('portes.md #13: loser has borne off 0 and has a checker on the bar → 2 by default, 3 with backgammonScores3', () => {
    for (const text of ['w: offx15 ; b: bar 6x14', 'w: offx15 ; b: 19 6x14']) {
      expect(portes.result(state(text))).toMatchObject({ winner: 'white', points: 2 });
      const triple = state(text, { scoring: { backgammonScores3: true } });
      expect(portes.result(triple)).toMatchObject({ winner: 'white', points: 3 });
    }
    // A plain mars stays 2 with the flag.
    const mars = state('w: offx15 ; b: 6x15', { scoring: { backgammonScores3: true } });
    expect(portes.result(mars)).toMatchObject({ points: 2 });
  });

  it('portes.md #14: loser has borne off 1+ → 1 point, even with a checker on the bar', () => {
    const final = state('w: offx15 ; b: bar 6x13 offx1', { scoring: { backgammonScores3: true } });
    expect(portes.result(final)).toEqual({ winner: 'white', points: 1, reason: 'borneOff' });
    expect(portes.result(state('w: offx15 ; b: 19 offx14'))).toMatchObject({ points: 1 });
  });

  it('portes.md #15: the opening roll uses the opening dice by default (the roll itself is #25)', () => {
    // The turn flow (#25) rolls the opening dice. The variant only starts
    // before the first roll and keeps the flag for it.
    const start = portes.initialState({ startingPlayer: 'black' });
    expect(start.rules.match.openingRoll).toBe('useOpeningDice');
    expect(start.dice).toBeNull();
    expect(start.toMove).toBe('black');
  });

  it('portes.md #16: doubles give 4 moves; a checker may enter and keep moving', () => {
    const turns = plays('w: bar 6x14 ; b: 1x15', [3, 3]);
    expect(turns).toContain('25/22 22/19 19/16 16/13');
    expect(turns.every((t) => t.startsWith('25/22') && t.split(' ').length === 4)).toBe(true);
  });
});

describe('tavli-match.md edge cases (movement, dice, bear-off)', () => {
  it('tavli-match.md #9: 6-5 and only the 5 can be played → play the 5', () => {
    // Doors on White's 7 (13-6) and 2 (8-6).
    expect(plays('w: 13x15 ; b: 18x2 23x2 24x11', [6, 5])).toEqual(['13/8']);
  });

  it('tavli-match.md #10: 6-5, either die alone but not both → must play the 6', () => {
    // Doors on White's 7 and 8 lock the 13s. The checker on 10 can move once.
    const text = 'w: 13x14 10 ; b: 18x2 17x2 24x11';
    expect(plays(text, [6, 5])).toEqual(['10/4']);
    expect(plays(text, [5, 6])).toEqual(['10/4']);
    expect(() => after(text, [6, 5], '10/5')).toThrow(illegal);
    // With higherDieRule off, either die may be played.
    expect(plays(text, [6, 5], { movement: { higherDieRule: false } })).toEqual(['10/4', '10/5']);
  });

  it('tavli-match.md #11: 6-5, the 6 is blocked first but 5 then 6 works → must play both', () => {
    const text = 'w: 13x15 ; b: 18x2 24x13';
    expect(plays(text, [6, 5])).toEqual(['13/8 8/2']);
    expect(() => after(text, [6, 5], '13/8')).toThrow(illegal);
  });

  it('tavli-match.md #12: 3-3 with only two legal threes → play two, lose the rest', () => {
    // A door on White's 10 locks the 13s. The checker on 9 goes 9/6/3; it cannot bear off.
    expect(plays('w: 13x14 9 ; b: 15x2 24x13', [3, 3])).toEqual(['9/6 6/3']);
  });

  it('tavli-match.md #13: no legal move → the turn passes and the dice are kept in the turn', () => {
    const blocked = state('w: bar 13x14 ; b: 6x2 5x2 4x2 3x2 2x2 1x2 24x3');
    const turns = portes.legalTurns(blocked, [4, 2]);
    expect(turns).toEqual([{ player: 'white', dice: [4, 2], moves: [] }]);
    const next = portes.applyTurn({ ...blocked, dice: [4, 2] }, turns[0] as Turn);
    expect(next).toMatchObject({ toMove: 'black', dice: null, turnNumber: 2 });
    expect(next.board).toEqual(blocked.board);
  });

  it('tavli-match.md #14: bear off with a 6 when the highest checker is on 4 → bear off from 4', () => {
    const turns = portes.legalTurns(state('w: 4x2 2x3 offx10 ; b: 1x15'), [6, 1]);
    const sixes = turns.flatMap((t) => t.moves).filter((m) => m.die === 6);
    expect(sixes.length).toBeGreaterThan(0);
    expect(sixes.every((m) => m.from === 4 && m.to === 'off')).toBe(true);
  });

  it('tavli-match.md #15: die 3, point 3 empty, a checker on 5 → must move 5/2, not bear off from 2', () => {
    const text = 'w: 5 2x2 offx12 ; b: 1x15';
    expect(plays(text, [3, 3])).toEqual(['5/2 2/0 2/0 2/0']);
    expect(() => after(text, [3, 3], '2/0:3 5/2 2/0 2/0')).toThrow(illegal);
    expect(plays('w: 5 2 offx13 ; b: 1x15', [3, 1])).not.toContain('2/0 5/4');
  });

  it('tavli-match.md #16: with a 2 the player may move 6/4 instead of bearing off from 2', () => {
    const turns = portes.legalTurns(state('w: 6 2 offx13 ; b: 1x15'), [2, 1]);
    const twos = turns.flatMap((t) => t.moves).filter((m) => m.die === 2);
    expect(twos.some((m) => m.from === 6 && m.to === 4)).toBe(true);
    expect(twos.some((m) => m.from === 2 && m.to === 'off')).toBe(true);
  });

  it('tavli-match.md #17: the last checker comes home with the first die, the second die bears off', () => {
    const text = 'w: 7 6x4 offx10 ; b: 1x15';
    expect(plays(text, [6, 1])).toContain('7/1 1/0');
    // The other order reaches the same position, so applyTurn accepts it too.
    expect(after(text, [6, 1], '7/6 6/0')).toBe('w: 6x4 offx11 ; b: 1x15');
  });
});

describe('Portes move generator', () => {
  it('lists each final position once and keeps the higher-die-first play', () => {
    const start = portes.initialState({ startingPlayer: 'white' });
    const turns = portes.legalTurns(start, [6, 5]);
    const texts = turns.map(formatTurn);
    // 13/7/2 and 13/8/2 end in the same position. The 6 goes first.
    expect(texts).toContain('13/7 7/2');
    expect(texts).not.toContain('13/8 8/2');
    expect(texts).toContain('24/18 18/13');
    const finals = turns.map((t) => formatPosition(portes.applyTurn(start, t).board));
    expect(new Set(finals).size).toBe(finals.length);
    // The other order is still accepted by applyTurn.
    const other = portes.applyTurn(start, parseTurn('13/8 8/2', 'white', [6, 5]));
    expect(formatPosition(other.board)).toBe('w: 24x2 13x4 8x3 6x5 2 ; b: 24x2 13x5 8x3 6x5');
  });

  it('works the same from Black’s side (own numbering)', () => {
    const white = portesState('w: 13 6x14 ; b: 17 24x14');
    const black = portesState('b: 13 6x14 ; w: 17 24x14', { toMove: 'black' });
    expect(portes.legalTurns(black, [5, 3]).map(formatTurn)).toEqual(
      portes.legalTurns(white, [5, 3]).map(formatTurn),
    );
    const turn = parseTurn('13/8* 8/5', 'black', [5, 3]);
    expect(formatPosition(portes.applyTurn(black, turn).board)).toBe('w: 24x14 bar ; b: 6x14 5');
  });

  it('bears off with a higher die only from the highest point', () => {
    expect(plays('w: 3 1 offx13 ; b: 1x15', [6, 5])).toEqual(['3/0 1/0']);
    expect(plays('w: 1 offx14 ; b: 1x15', [6, 5])).toEqual(['1/0']);
  });

  it('flag noHitAndRunInHome: a checker that hits in its own home stops there', () => {
    const text = 'w: 8 6x14 ; b: 20 24x14';
    expect(plays(text, [3, 2])).toContain('8/5* 5/3');
    const strict = plays(text, [3, 2], { capture: { noHitAndRunInHome: true } });
    expect(strict).not.toContain('8/5* 5/3');
    expect(strict).toContain('8/5* 6/4');
    expect(() => after(text, [3, 2], '8/5* 5/3', { capture: { noHitAndRunInHome: true } })).toThrow(
      illegal,
    );
    // A hit outside home may still continue.
    expect(
      plays('w: 13 6x14 ; b: 17 24x14', [5, 3], { capture: { noHitAndRunInHome: true } }),
    ).toContain('13/8* 8/5');
  });
});

describe('Portes applyTurn', () => {
  const start = portes.initialState({ startingPlayer: 'white' });

  it('returns the next state and does not change its input', () => {
    const rolled = { ...start, dice: [3, 1] as const };
    const before = JSON.stringify(rolled);
    const next = portes.applyTurn(rolled, parseTurn('8/5 6/5', 'white', [3, 1]));
    expect(JSON.stringify(rolled)).toBe(before);
    expect(next).toMatchObject({ toMove: 'black', dice: null, turnNumber: 2 });
    expect(formatPosition(next.board)).toBe('w: 24x2 13x5 8x2 6x4 5x2 ; b: 24x2 13x5 8x3 6x5');
  });

  it('rejects the wrong player, the wrong dice, bad moves and a finished game', () => {
    const rolled = { ...start, dice: [3, 1] as const };
    expect(() => portes.applyTurn(rolled, parseTurn('8/5 6/5', 'black', [3, 1]))).toThrow(illegal);
    expect(() => portes.applyTurn(rolled, parseTurn('8/4 6/5', 'white', [4, 1]))).toThrow(illegal);
    expect(() => portes.applyTurn(rolled, parseTurn('8/5', 'white', [3, 1]))).toThrow(illegal);
    const sevens = { player: 'white', dice: [7, 7], moves: [] } as unknown as Turn;
    expect(() => portes.applyTurn(start, sevens)).toThrow(illegal);
    expect(() => portes.applyTurn(rolled, parseTurn('8/5* 6/5', 'white', [3, 1]))).toThrow(illegal);
    expect(() => portes.applyTurn(rolled, parseTurn('8/5 5/4 6/5', 'white', [3, 1]))).toThrow(
      illegal,
    );
    expect(() => portes.applyTurn(rolled, parseTurn('-', 'white', [3, 1]))).toThrow(illegal);
    const over = state('w: offx15 ; b: 6x15');
    expect(() => portes.applyTurn(over, parseTurn('-', 'white', [3, 1]))).toThrow(illegal);
    expect(() => portes.legalTurns(over, [3, 1])).toThrow(illegal);
  });
});

describe('Portes rules', () => {
  it('is in the variant registry', () => {
    expect(getVariant(VARIANT_REGISTRY, 'portes')).toBe(portes);
    expect(portes.direction).toBe('contrary');
  });

  it('uses the portes preset by default', () => {
    expect(portes.initialState({ startingPlayer: 'white' }).rules).toEqual(getPreset('portes'));
  });

  it('rejects flags of other games with RULES_CONFLICT', () => {
    const conflict = expect.objectContaining({ code: 'RULES_CONFLICT' });
    for (const preset of ['plakoto', 'fevga', 'asodio.kafeneio']) {
      expect(() =>
        portes.initialState({ startingPlayer: 'white', rules: getPreset(preset) }),
      ).toThrow(conflict);
    }
    for (const overrides of [
      { capture: { captureMode: 'pin' } },
      { bearOff: { exactBearOff: true } },
      { specialRolls: { complementaryDoubles: true } },
    ] satisfies RuleOverrides[]) {
      const rules = resolveRules('portes', overrides);
      expect(() => portes.initialState({ startingPlayer: 'white', rules })).toThrow(conflict);
      expect(() => portes.legalTurns(portesState(START, { rules }), [3, 1])).toThrow(conflict);
    }
  });

  it('throws NOT_SUPPORTED for the doubling cube', () => {
    const rules = resolveRules('portes', { scoring: { doublingCube: true } });
    expect(() => portes.initialState({ startingPlayer: 'white', rules })).toThrow(
      expect.objectContaining({ code: 'NOT_SUPPORTED', path: 'rules.scoring.doublingCube' }),
    );
  });

  it('accepts match flags, which the turn flow reads', () => {
    const rules = resolveRules('portes', {
      match: { targetPoints: 7, openingRoll: 'rerollBoth', rotation: ['portes'] },
    });
    expect(portes.initialState({ startingPlayer: 'white', rules }).rules.match.targetPoints).toBe(
      7,
    );
  });
});
