/**
 * A short text notation for positions, used only in tests. Not exported
 * from the package.
 *
 * ```
 * w: 24x2 13x5 8x3 6x5 ; b: 24x2 13x5 8x3 6x5
 * w: 6x3 2 bar offx11 ; b: 19x2 1
 * ```
 *
 * - Two sides, `w:` (or `white:`) and `b:` (or `black:`), split by `;`.
 * - Each side uses its **own** point numbers (24 = start, 1 = deepest home).
 * - A token is `<point>` (one checker) or `<point>x<count>`. `bar` and
 *   `off` work the same way: `bar`, `barx2`, `offx11`.
 * - If `off` is left out, the side's other checkers (15 minus the listed
 *   ones) are borne off. Write `off` when the test is about borne-off counts.
 * - Contrary movement only (Portes, Plakoto, Asodio): Black's point `p` is
 *   White's `25 - p`. No pins.
 *
 * `formatPosition` writes the canonical form: points from high to low,
 * then `bar`, then `off` when it is not 0.
 */

import { createBoard } from '../board';
import type { BoardState, SideLayout } from '../board';
import { BAR_NUMBER, CHECKERS_PER_PLAYER, OFF_NUMBER } from '../constants';
import { isDieValue } from '../dice';
import type { Dice } from '../dice';
import type { Move, Turn } from '../move';
import { absoluteToOwn } from '../numbering';
import { PLAYERS } from '../player';
import type { PlayerId } from '../player';
import { getPreset } from '../presets';
import type { RuleSet } from '../rules';
import { GAME_STATE_SCHEMA_VERSION } from '../state';
import type { GameState } from '../state';

const SIDE_NAMES: Record<string, PlayerId> = {
  w: 'white',
  white: 'white',
  b: 'black',
  black: 'black',
};

function bad(text: string, why: string): never {
  throw new Error(`bad position "${text}": ${why}`);
}

function parseSide(text: string, body: string): SideLayout {
  const points: Record<number, number> = {};
  let bar = 0;
  let off: number | null = null;
  let listed = 0;
  for (const token of body.split(/\s+/).filter((t) => t.length > 0)) {
    const match = /^(bar|off|\d+)(?:x(\d+))?$/.exec(token);
    if (match === null) bad(text, `bad token "${token}"`);
    const where = match[1] as string;
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count < 1) bad(text, `bad count in "${token}"`);
    if (where === 'bar') {
      bar += count;
    } else if (where === 'off') {
      off = (off ?? 0) + count;
    } else {
      const p = Number(where);
      if (p < 1 || p > 24) bad(text, `point ${p} is not 1 to 24`);
      points[p] = (points[p] ?? 0) + count;
    }
    if (where !== 'off') listed += count;
  }
  const rest = off ?? CHECKERS_PER_PLAYER - listed;
  if (rest < 0) bad(text, 'more than 15 checkers on one side');
  return { points, bar, off: rest };
}

/** Parses the notation into a board. Throws on bad text or a bad board. */
export function parsePosition(text: string): BoardState {
  const sides: Partial<Record<PlayerId, SideLayout>> = {};
  for (const part of text.split(';')) {
    const match = /^\s*(\w+)\s*:(.*)$/s.exec(part);
    if (match === null) bad(text, `missing "w:" or "b:" in "${part.trim()}"`);
    const player = SIDE_NAMES[(match[1] as string).toLowerCase()];
    if (player === undefined) bad(text, `unknown side "${match[1]}"`);
    if (sides[player] !== undefined) bad(text, `side ${player} is written twice`);
    sides[player] = parseSide(text, match[2] as string);
  }
  const { white, black } = sides;
  if (white === undefined || black === undefined) bad(text, 'both sides are needed');
  return createBoard({ white, black }, 'contrary');
}

function formatSide(board: BoardState, player: PlayerId): string {
  const counts = new Map<number, number>();
  board.points.forEach((point, index) => {
    if (point[player] > 0) counts.set(absoluteToOwn(index + 1, player, 'contrary'), point[player]);
  });
  const token = (where: string | number, n: number): string =>
    n === 1 ? `${where}` : `${where}x${n}`;
  const tokens = [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([p, n]) => token(p, n));
  if (board.bar[player] > 0) tokens.push(token('bar', board.bar[player]));
  if (board.off[player] > 0) tokens.push(`offx${board.off[player]}`);
  return `${player[0]}: ${tokens.join(' ')}`.trimEnd();
}

/** Writes a board in the canonical notation. `parsePosition(formatPosition(b))` equals `b`. */
export function formatPosition(board: BoardState): string {
  return PLAYERS.map((player) => formatSide(board, player)).join(' ; ');
}

export interface PositionStateOptions {
  readonly toMove?: PlayerId;
  readonly dice?: Dice | null;
  readonly rules?: RuleSet;
  readonly turnNumber?: number;
}

/** A Portes `GameState` from the notation. White to move, default rules, no dice. */
export function portesState(text: string, options: PositionStateOptions = {}): GameState {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    variant: 'portes',
    rules: options.rules ?? getPreset('portes'),
    board: parsePosition(text),
    toMove: options.toMove ?? 'white',
    dice: options.dice ?? null,
    turnNumber: options.turnNumber ?? 1,
    variantData: null,
  };
}

/**
 * Parses a turn in move notation, for example `13/8* 8/5` or `-` (pass).
 * `25` is the bar and `0` is off. The die is `from - to`; for a bear-off
 * with a larger die, write it after a colon: `4/0:6`.
 */
export function parseTurn(text: string, player: PlayerId, dice: Dice): Turn {
  const trimmed = text.trim();
  if (trimmed === '-') return { player, dice, moves: [] };
  const moves = trimmed.split(/\s+/).map((token): Move => {
    const match = /^(\d+)\/(\d+)(\*?)(?::(\d))?$/.exec(token);
    if (match === null) throw new Error(`bad move "${token}"`);
    const from = Number(match[1]);
    const to = Number(match[2]);
    const die = Number(match[4] ?? from - to);
    if (!isDieValue(die)) throw new Error(`bad die in "${token}"`);
    return {
      from: from === BAR_NUMBER ? 'bar' : from,
      to: to === OFF_NUMBER ? 'off' : to,
      die,
      capture: match[3] === '*' ? 'hit' : 'none',
    };
  });
  return { player, dice, moves };
}
