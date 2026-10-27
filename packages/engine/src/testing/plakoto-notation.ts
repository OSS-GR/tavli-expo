/**
 * The test notation of `position-notation.ts`, with pins, for Plakoto. Used
 * only in tests. Not exported from the package.
 *
 * ```
 * w: 24x14 13 ; b: 12! 24x14
 * ```
 *
 * - Same as `position-notation.ts`: own point numbers per side, `x<count>`,
 *   `off`; a missing `off` means "the rest are borne off". No bar.
 * - `<point>!`: this side's lone checker on that point is pinned. The other
 *   side must have checkers on the same point (in its own numbering).
 *   Example: `w: 12! ; b: 13x2` (White's 12 = Black's 13).
 * - Moves: `13/7*` is a pin (not a hit).
 */

import { createBoard } from '../board';
import type { BoardState, SideLayout } from '../board';
import { CHECKERS_PER_PLAYER, OFF_NUMBER } from '../constants';
import { isDieValue } from '../dice';
import type { Dice } from '../dice';
import type { Move, Turn } from '../move';
import { absoluteToOwn } from '../numbering';
import { PLAYERS } from '../player';
import type { PlayerId } from '../player';
import { getPreset, resolveRules } from '../presets';
import type { RuleOverrides, RuleSet } from '../rules';
import { GAME_STATE_SCHEMA_VERSION } from '../state';
import type { GameState, JsonObject } from '../state';

function bad(text: string, why: string): never {
  throw new Error(`bad position "${text}": ${why}`);
}

function parseSide(text: string, body: string): SideLayout {
  const points: Record<number, number> = {};
  const pinned: number[] = [];
  let off: number | null = null;
  let listed = 0;
  for (const token of body.split(/\s+/).filter((t) => t.length > 0)) {
    const match = /^(off|\d+)(!)?(?:x(\d+))?$/.exec(token);
    if (match === null) bad(text, `bad token "${token}"`);
    const where = match[1] as string;
    const count = match[3] === undefined ? 1 : Number(match[3]);
    if (count < 1) bad(text, `bad count in "${token}"`);
    if (where === 'off') {
      off = (off ?? 0) + count;
      continue;
    }
    const p = Number(where);
    if (p < 1 || p > 24) bad(text, `point ${p} is not 1 to 24`);
    points[p] = (points[p] ?? 0) + count;
    if (match[2] === '!') pinned.push(p);
    listed += count;
  }
  const rest = off ?? CHECKERS_PER_PLAYER - listed;
  if (rest < 0) bad(text, 'more than 15 checkers on one side');
  return { points, pinned, off: rest };
}

/** Parses the notation into a board. Throws on bad text or a bad board. */
export function parsePlakoto(text: string): BoardState {
  const sides: Partial<Record<PlayerId, SideLayout>> = {};
  for (const part of text.split(';')) {
    const match = /^\s*([wb])\s*:(.*)$/s.exec(part);
    if (match === null) bad(text, `missing "w:" or "b:" in "${part.trim()}"`);
    const player: PlayerId = match[1] === 'w' ? 'white' : 'black';
    if (sides[player] !== undefined) bad(text, `side ${player} is written twice`);
    sides[player] = parseSide(text, match[2] as string);
  }
  const { white, black } = sides;
  if (white === undefined || black === undefined) bad(text, 'both sides are needed');
  return createBoard({ white, black }, 'contrary');
}

function formatSide(board: BoardState, player: PlayerId): string {
  const tokens: [number, string][] = [];
  board.points.forEach((point, index) => {
    const n = point[player];
    if (n === 0) return;
    const p = absoluteToOwn(index + 1, player, 'contrary');
    const pin = point.pinned === player ? '!' : '';
    tokens.push([p, n === 1 ? `${p}${pin}` : `${p}${pin}x${n}`]);
  });
  const out = tokens.sort((a, b) => b[0] - a[0]).map(([, token]) => token);
  if (board.off[player] > 0) out.push(`offx${board.off[player]}`);
  return `${player[0]}: ${out.join(' ')}`.trimEnd();
}

/** Writes a board in the canonical notation. */
export function formatPlakoto(board: BoardState): string {
  return PLAYERS.map((player) => formatSide(board, player)).join(' ; ');
}

export interface PlakotoStateOptions {
  readonly toMove?: PlayerId;
  readonly dice?: Dice | null;
  /** A full `RuleSet`, or overrides on top of the `plakoto` preset. */
  readonly rules?: RuleSet | RuleOverrides;
  readonly variantData?: JsonObject | null;
}

function isRuleSet(rules: RuleSet | RuleOverrides): rules is RuleSet {
  return 'presetId' in rules;
}

/** A Plakoto `GameState` from the notation. White to move, `plakoto` preset, no dice. */
export function plakotoState(text: string, options: PlakotoStateOptions = {}): GameState {
  const rules = options.rules ?? {};
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    variant: 'plakoto',
    rules: isRuleSet(rules)
      ? rules
      : Object.keys(rules).length === 0
        ? getPreset('plakoto')
        : resolveRules('plakoto', rules),
    board: parsePlakoto(text),
    toMove: options.toMove ?? 'white',
    dice: options.dice ?? null,
    turnNumber: 1,
    variantData: options.variantData ?? null,
  };
}

/**
 * Parses a turn like `13/7* 7/2` or `-` (pass). `*` marks a pin. `0` is off;
 * for a bear-off with a larger die, write the die after a colon: `4/0:6`.
 */
export function parsePlakotoTurn(text: string, player: PlayerId, dice: Dice): Turn {
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
      from,
      to: to === OFF_NUMBER ? 'off' : to,
      die,
      capture: match[3] === '*' ? 'pin' : 'none',
    };
  });
  return { player, dice, moves };
}
