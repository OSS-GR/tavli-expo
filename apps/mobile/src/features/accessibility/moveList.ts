/**
 * The move list (#134): every legal next move as one button, so a screen
 * reader user can play without touching the board. Pure TypeScript.
 *
 * The moves come from the engine (`legalNextMoves`); this file only names
 * them. A `Move` is already in the mover's own numbering (24 = start,
 * 1 = the last point of home), so the labels use the mover's own point
 * numbers, like the rest of the screen.
 */
import { locationNumber, type Move, type SourceMoves } from '@tavli/engine';
import type { TFunction } from 'i18next';

import { pathKey, type MovePath } from '@/features/board/combined';

/** How far a move goes along the mover's path: bar and outside count as 25, off as 0. */
const distance = (move: Move) => locationNumber(move.from) - locationNumber(move.to);

/**
 * The moves to offer, one per source and target. When two dice reach the
 * same target (bearing off), the lower die is used, so the higher one stays
 * for later (the same rule as the board's tap-tap, `buildSources`).
 * Order: the checker furthest back first (bar, outside, then point 24 down
 * to 1); for one checker, the shortest move first.
 */
export function moveChoices(legal: readonly SourceMoves[]): Move[] {
  const byKey = new Map<string, Move>();
  for (const group of legal) {
    for (const move of group.moves) {
      const key = `${String(move.from)}>${String(move.to)}`;
      const old = byKey.get(key);
      if (old === undefined || move.die < old.die) byKey.set(key, move);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => locationNumber(b.from) - locationNumber(a.from) || distance(a) - distance(b),
  );
}

/** A stable key for a move in a list. */
export const moveKey = (move: Move) => `${String(move.from)}>${String(move.to)}:${move.die}`;

/**
 * What a screen reader says for a move: "Checker from point 13 to point 8,
 * hits", "From the bar to point 22", "Enter on point 22" (Asodio),
 * "Bear off from point 6".
 */
export function moveLabel(t: TFunction, move: Move): string {
  const to = move.to === 'off' ? null : move.to;
  let base: string;
  if (move.from === 'outside' && to !== null) base = t('game.moveList.enter', { to });
  else if (move.from === 'bar' && to !== null) base = t('game.moveList.fromBar', { to });
  else if (to === null) base = t('game.moveList.bearOff', { from: locationNumber(move.from) });
  else base = t('game.moveList.move', { from: locationNumber(move.from), to });
  if (move.capture === 'hit') return t('game.moveList.hits', { move: base });
  if (move.capture === 'pin') return t('game.moveList.pins', { move: base });
  return base;
}

/** The short text on the button: "13 → 8", "Bar → 22", "6 → Off", with "hit" or "pin". */
export function moveShortLabel(t: TFunction, move: Move): string {
  const to = move.to === 'off' ? null : move.to;
  let base: string;
  if (move.from === 'outside' && to !== null) base = t('game.moveList.short.enter', { to });
  else if (move.from === 'bar' && to !== null) base = t('game.moveList.short.fromBar', { to });
  else if (to === null)
    base = t('game.moveList.short.bearOff', { from: locationNumber(move.from) });
  else base = t('game.moveList.short.move', { from: locationNumber(move.from), to });
  if (move.capture === 'hit') return t('game.moveList.short.hit', { move: base });
  if (move.capture === 'pin') return t('game.moveList.short.pin', { move: base });
  return base;
}

// ---------------------------------------------------------------------------
// One checker with several dice (#180).

/** One button: a single move, or the steps of one checker moved with several dice. */
export interface MoveChoice {
  readonly key: string;
  /** In the order they are played. One for a single move. */
  readonly moves: readonly Move[];
}

/**
 * The buttons to offer: the single moves (`moveChoices`) and the combined
 * paths (`flowPaths`, the board's "2+3" targets). Order: the checker
 * furthest back first; for one checker, the shortest move first, and a
 * single move before a path of the same length.
 */
export function listChoices(
  legal: readonly SourceMoves[],
  paths: readonly MovePath[] = [],
): MoveChoice[] {
  const singles = moveChoices(legal).map((move) => ({ key: moveKey(move), moves: [move] }));
  const combined = paths.map((path) => ({ key: pathKey(path), moves: path.steps }));
  const from = (c: MoveChoice) => locationNumber(c.moves[0]?.from ?? 'off');
  const to = (c: MoveChoice) => locationNumber(c.moves[c.moves.length - 1]?.to ?? 'off');
  return [...singles, ...combined].sort(
    (a, b) =>
      from(b) - from(a) || from(a) - to(a) - (from(b) - to(b)) || a.moves.length - b.moves.length,
  );
}

/** The capture of a path: a hit or a pin anywhere on it. */
function pathCapture(moves: readonly Move[]): Move['capture'] {
  if (moves.some((m) => m.capture === 'hit')) return 'hit';
  if (moves.some((m) => m.capture === 'pin')) return 'pin';
  return 'none';
}

/**
 * What a screen reader says for a choice. A path reads each step: "Checker
 * from point 13 to point 10, then to point 5", with "hits" or "pins" after
 * the step that does it.
 */
export function choiceLabel(t: TFunction, moves: readonly Move[]): string {
  const [first, ...rest] = moves;
  if (first === undefined) return '';
  let label = moveLabel(t, first);
  for (const step of rest) {
    let next =
      step.to === 'off' ? t('game.moveList.thenOff') : t('game.moveList.thenTo', { to: step.to });
    if (step.capture === 'hit') next = t('game.moveList.hits', { move: next });
    if (step.capture === 'pin') next = t('game.moveList.pins', { move: next });
    label = t('game.moveList.then', { move: label, next });
  }
  return label;
}

/** The short text on the button: "13 → 10 → 5", with "hit" or "pin" when a step does it. */
export function choiceShortLabel(t: TFunction, moves: readonly Move[]): string {
  const [first, ...rest] = moves;
  if (first === undefined) return '';
  if (rest.length === 0) return moveShortLabel(t, first);
  let label = moveShortLabel(t, { ...first, capture: 'none' });
  for (const step of rest) {
    label =
      step.to === 'off'
        ? t('game.moveList.short.thenOff', { move: label })
        : t('game.moveList.short.then', { move: label, to: step.to });
  }
  const capture = pathCapture(moves);
  if (capture === 'hit') return t('game.moveList.short.hit', { move: label });
  if (capture === 'pin') return t('game.moveList.short.pin', { move: label });
  return label;
}
