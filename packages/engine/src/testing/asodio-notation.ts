/**
 * The test notation of `plakoto-notation.ts`, with the bar and checkers
 * outside, for Asodio. Used only in tests. Not exported from the package.
 *
 * ```
 * w: 24x2 23 outx12 ; b: outx15
 * w: 12! 18x14 ; b: 13x2 outx13
 * ```
 *
 * - Own point numbers per side, `x<count>`. A missing `off` means "the
 *   rest are borne off".
 * - `out` / `outx<n>`: checkers that have not entered yet. `bar` /
 *   `barx<n>`: hit checkers.
 * - `<point>!`: this side's lone checker on that point is pinned.
 * - Moves: `out/22` enters from outside, `bar/22` from the bar, `13/8*`
 *   pins or hits (`capture`), `4/0:6` bears off with a larger die.
 */

import { createBoard } from '../board';
import type { BoardState, SideLayout } from '../board';
import { CHECKERS_PER_PLAYER, OFF_NUMBER } from '../constants';
import { isDieValue } from '../dice';
import type { Dice } from '../dice';
import type { Capture, Move, Turn } from '../move';
import { absoluteToOwn } from '../numbering';
import { PLAYERS } from '../player';
import type { PlayerId } from '../player';
import { getPreset, resolveRules } from '../presets';
import type { PresetId, RuleOverrides, RuleSet } from '../rules';
import { GAME_STATE_SCHEMA_VERSION } from '../state';
import type { GameState, JsonObject } from '../state';

function bad(text: string, why: string): never {
  throw new Error(`bad position "${text}": ${why}`);
}

function parseSide(text: string, body: string): SideLayout {
  const points: Record<number, number> = {};
  const pinned: number[] = [];
  let off: number | null = null;
  let bar = 0;
  let outside = 0;
  let listed = 0;
  for (const token of body.split(/\s+/).filter((t) => t.length > 0)) {
    const match = /^(off|out|bar|\d+)(!)?(?:x(\d+))?$/.exec(token);
    if (match === null) bad(text, `bad token "${token}"`);
    const where = match[1] as string;
    const count = match[3] === undefined ? 1 : Number(match[3]);
    if (count < 1) bad(text, `bad count in "${token}"`);
    if (where === 'off') {
      off = (off ?? 0) + count;
      continue;
    }
    listed += count;
    if (where === 'out') {
      outside += count;
      continue;
    }
    if (where === 'bar') {
      bar += count;
      continue;
    }
    const p = Number(where);
    if (p < 1 || p > 24) bad(text, `point ${p} is not 1 to 24`);
    points[p] = (points[p] ?? 0) + count;
    if (match[2] === '!') pinned.push(p);
  }
  const rest = off ?? CHECKERS_PER_PLAYER - listed;
  if (rest < 0) bad(text, 'more than 15 checkers on one side');
  return { points, pinned, bar, outside, off: rest };
}

/** Parses the notation into a board. Throws on bad text or a bad board. */
export function parseAsodio(text: string): BoardState {
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
  const count = (name: string, n: number): void => {
    if (n > 0) out.push(n === 1 ? name : `${name}x${n}`);
  };
  count('bar', board.bar[player]);
  count('out', board.outside[player]);
  if (board.off[player] > 0) out.push(`offx${board.off[player]}`);
  return `${player[0]}: ${out.join(' ')}`.trimEnd();
}

/** Writes a board in the canonical notation. */
export function formatAsodio(board: BoardState): string {
  return PLAYERS.map((player) => formatSide(board, player)).join(' ; ');
}

export interface AsodioStateOptions {
  readonly toMove?: PlayerId;
  readonly dice?: Dice | null;
  /** The preset (default `asodio.kafeneio`). */
  readonly preset?: PresetId;
  /** A full `RuleSet`, or overrides on top of `preset`. */
  readonly rules?: RuleSet | RuleOverrides;
  readonly variantData?: JsonObject | null;
}

function isRuleSet(rules: RuleSet | RuleOverrides): rules is RuleSet {
  return 'presetId' in rules;
}

/** An Asodio `GameState` from the notation. White to move, `asodio.kafeneio`, no dice. */
export function asodioState(text: string, options: AsodioStateOptions = {}): GameState {
  const preset = options.preset ?? 'asodio.kafeneio';
  const rules = options.rules ?? {};
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    variant: 'asodio',
    rules: isRuleSet(rules)
      ? rules
      : Object.keys(rules).length === 0
        ? getPreset(preset)
        : resolveRules(preset, rules),
    board: parseAsodio(text),
    toMove: options.toMove ?? 'white',
    dice: options.dice ?? null,
    turnNumber: 1,
    variantData: options.variantData ?? null,
  };
}

/**
 * Parses a turn like `out/22 13/7*` or `-` (pass). `*` marks a capture of
 * kind `capture` (a pin by default). `0` is off.
 */
export function parseAsodioTurn(
  text: string,
  player: PlayerId,
  dice: Dice,
  capture: Exclude<Capture, 'none'> = 'pin',
): Turn {
  const trimmed = text.trim();
  if (trimmed === '-') return { player, dice, moves: [] };
  const moves = trimmed.split(/\s+/).map((token): Move => {
    const match = /^(out|bar|\d+)\/(\d+)(\*?)(?::(\d))?$/.exec(token);
    if (match === null) throw new Error(`bad move "${token}"`);
    const source = match[1] as string;
    const to = Number(match[2]);
    const fromNumber = source === 'out' || source === 'bar' ? 25 : Number(source);
    const die = Number(match[4] ?? fromNumber - to);
    if (!isDieValue(die)) throw new Error(`bad die in "${token}"`);
    return {
      from: source === 'out' ? 'outside' : source === 'bar' ? 'bar' : fromNumber,
      to: to === OFF_NUMBER ? 'off' : to,
      die,
      capture: match[3] === '*' ? capture : 'none',
    };
  });
  return { player, dice, moves };
}
