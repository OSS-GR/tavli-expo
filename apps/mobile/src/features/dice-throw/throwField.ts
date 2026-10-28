/**
 * Where thrown dice may roll on the drawn board (#183 spike): the playing
 * field that holds the theme's dice area, from `layout.fields`.
 */
import { toScreenRect, type BoardGeometry, type ScreenRect } from '@/features/board/geometry';

import { throwBox, type Box } from './throwPath';

/** Side of a die on this board, in points (`layout.dice.size`). */
export function throwDieSize(geo: BoardGeometry): number {
  return geo.layout.dice.size * geo.width;
}

/** The field that holds the dice area (the bottom player's side), in points. */
export function throwField(geo: BoardGeometry): ScreenRect {
  const { fields, diceArea } = geo.layout;
  const cx = diceArea.x + diceArea.w / 2;
  const cy = diceArea.y + diceArea.h / 2;
  const field =
    fields.find((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) ??
    fields[fields.length - 1];
  return toScreenRect(geo, field ?? { x: 0, y: 0, w: 1, h: 1 });
}

/** The box a die center may use on this board. */
export function boardThrowBox(geo: BoardGeometry): Box {
  return throwBox(throwField(geo), throwDieSize(geo));
}
