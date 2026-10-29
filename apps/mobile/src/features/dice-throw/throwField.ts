/**
 * Where thrown dice may roll on the drawn board (#183 spike): the whole
 * playing surface, both fields and what lies between them (`layout.fields`).
 * A swipe in any direction throws the dice that way, so they may land on any
 * side of the board.
 */
import { toScreenRect, type BoardGeometry, type ScreenRect } from '@/features/board/geometry';

import { throwBox, type Box, type ThrowBar } from './throwPath';

/** Side of a die on this board, in points (`layout.dice.size`). */
export function throwDieSize(geo: BoardGeometry): number {
  return geo.layout.dice.size * geo.width;
}

/** The playing surface: the smallest rect around all the fields, in points. */
export function throwField(geo: BoardGeometry): ScreenRect {
  const { fields } = geo.layout;
  if (fields.length === 0) return toScreenRect(geo, { x: 0, y: 0, w: 1, h: 1 });
  const left = Math.min(...fields.map((f) => f.x));
  const top = Math.min(...fields.map((f) => f.y));
  const right = Math.max(...fields.map((f) => f.x + f.w));
  const bottom = Math.max(...fields.map((f) => f.y + f.h));
  return toScreenRect(geo, { x: left, y: top, w: right - left, h: bottom - top });
}

/** The box a die center may use on this board. */
export function boardThrowBox(geo: BoardGeometry): Box {
  return throwBox(throwField(geo), throwDieSize(geo));
}

/**
 * The bar between the two fields, as the dice see it (`ThrowBar`): the gap
 * between the fields. `shelter` is the middle of the field that holds the
 * dice area (the player's side). `undefined` when a layout has no gap.
 */
export function throwBar(geo: BoardGeometry): ThrowBar | undefined {
  const { fields, diceArea } = geo.layout;
  const [first, second] = fields;
  if (fields.length !== 2 || first === undefined || second === undefined) return undefined;
  const [a, b] = [first, second].map((f) => toScreenRect(geo, f));
  if (a === undefined || b === undefined) return undefined;
  // Stacked (the tall board) or side by side (the classic board)?
  const stacked = Math.abs(a.y - b.y) > Math.abs(a.x - b.x);
  const axis = stacked ? 'y' : 'x';
  const [near, far] = (stacked ? a.y <= b.y : a.x <= b.x) ? [a, b] : [b, a];
  const from = stacked ? near.y + near.height : near.x + near.width;
  const to = stacked ? far.y : far.x;
  if (!(to > from)) return undefined;
  const dice = toScreenRect(geo, diceArea);
  const centre = stacked ? dice.y + dice.height / 2 : dice.x + dice.width / 2;
  const mine = centre >= to ? far : near;
  const shelter = stacked ? mine.y + mine.height / 2 : mine.x + mine.width / 2;
  return { axis, from, to, shelter };
}
