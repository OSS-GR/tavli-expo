/**
 * Fevga positions in the test notation of `position-notation.ts`, used only
 * in tests. Not exported from the package.
 *
 * ```
 * w: 24x14 13 ; b: 24x15
 * ```
 *
 * The same syntax, but for parallel movement: each side writes its **own**
 * point numbers, and Black's point `p` is White's `p > 12 ? p - 12 : p + 12`.
 * There is no bar. A missing `off` means "the rest are off".
 */

import { createBoard } from '../board';
import type { BoardState, SideLayout } from '../board';
import { CHECKERS_PER_PLAYER } from '../constants';
import { absoluteToOwn } from '../numbering';
import { PLAYERS } from '../player';
import type { PlayerId } from '../player';
import { getPreset } from '../presets';
import { GAME_STATE_SCHEMA_VERSION } from '../state';
import type { GameState } from '../state';
import type { PositionStateOptions } from './position-notation';

function bad(text: string, why: string): never {
  throw new Error(`bad Fevga position "${text}": ${why}`);
}

function parseSide(text: string, body: string): SideLayout {
  const points: Record<number, number> = {};
  let off: number | null = null;
  let listed = 0;
  for (const token of body.split(/\s+/).filter((t) => t.length > 0)) {
    const match = /^(off|\d+)(?:x(\d+))?$/.exec(token);
    if (match === null) bad(text, `bad token "${token}"`);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (match[1] === 'off') {
      off = (off ?? 0) + count;
      continue;
    }
    const p = Number(match[1]);
    if (p < 1 || p > 24) bad(text, `point ${p} is not 1 to 24`);
    points[p] = (points[p] ?? 0) + count;
    listed += count;
  }
  const rest = off ?? CHECKERS_PER_PLAYER - listed;
  if (rest < 0) bad(text, 'more than 15 checkers on one side');
  return { points, off: rest };
}

/** Parses the notation into a Fevga board (parallel movement). */
export function parseFevgaPosition(text: string): BoardState {
  const sides: Partial<Record<PlayerId, SideLayout>> = {};
  for (const part of text.split(';')) {
    const match = /^\s*([wb])\s*:(.*)$/s.exec(part);
    if (match === null) bad(text, `missing "w:" or "b:" in "${part.trim()}"`);
    const player: PlayerId = match[1] === 'w' ? 'white' : 'black';
    sides[player] = parseSide(text, match[2] as string);
  }
  const { white, black } = sides;
  if (white === undefined || black === undefined) bad(text, 'both sides are needed');
  return createBoard({ white, black }, 'parallel');
}

/** Writes a Fevga board in the notation: points high to low, then `off`. */
export function formatFevgaPosition(board: BoardState): string {
  return PLAYERS.map((player) => {
    const tokens: string[] = [];
    const counts: [number, number][] = [];
    board.points.forEach((point, index) => {
      if (point[player] > 0) {
        counts.push([absoluteToOwn(index + 1, player, 'parallel'), point[player]]);
      }
    });
    counts.sort((a, b) => b[0] - a[0]);
    for (const [p, n] of counts) tokens.push(n === 1 ? `${p}` : `${p}x${n}`);
    if (board.off[player] > 0) tokens.push(`offx${board.off[player]}`);
    return `${player[0]}: ${tokens.join(' ')}`.trimEnd();
  }).join(' ; ');
}

/** A Fevga `GameState` from the notation. White to move, `fevga` rules, no dice. */
export function fevgaState(text: string, options: PositionStateOptions = {}): GameState {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    variant: 'fevga',
    rules: options.rules ?? getPreset('fevga'),
    board: parseFevgaPosition(text),
    toMove: options.toMove ?? 'white',
    dice: options.dice ?? null,
    turnNumber: options.turnNumber ?? 1,
    variantData: null,
  };
}
