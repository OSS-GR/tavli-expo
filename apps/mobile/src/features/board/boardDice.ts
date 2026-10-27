/**
 * Where the dice sit (#184): in portrait on the board, in the middle of the
 * theme's dice area (`layout.diceArea`), so they follow the tall or the
 * classic layout and the home board side. In landscape (#185) they sit in
 * the right column, next to the board (`columnDiceBox`). The dice keep
 * their own canvas (`DiceRow`); this only says where its box goes and how
 * big a die is. Pure TypeScript.
 */
import { DIE_SIZE, dicePlaces } from './diceMotion';
import { toScreenRect, type BoardGeometry } from './geometry';

/**
 * The smallest die on the board, in points. The theme's die size is about
 * 25 pt on the tall board of an iPhone SE and 19 pt on the classic board,
 * too small to read at a glance; today's dice row used 40 pt.
 */
export const MIN_BOARD_DIE = 32;
/**
 * A double shows four dice in a 2 x 2 grid at about 0.6 of the size. They
 * get this much more room, so each of them stays near 25 pt.
 */
const DOUBLE_GROW = 1.25;

export interface BoardDiceBox {
  /** The top-left corner of the dice box, in board canvas points. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The `size` to give `DiceRow`. */
  readonly size: number;
}

/** The dice box for `count` dice, centred on the dice area of the drawn board. */
export function boardDiceBox(geo: BoardGeometry, count: number): BoardDiceBox {
  const area = toScreenRect(geo, geo.layout.diceArea);
  const die = Math.max(MIN_BOARD_DIE, geo.layout.dice.size * geo.width);
  const size = count === 4 ? die * DOUBLE_GROW : die;
  const { width, height } = dicePlaces(count, size);
  return {
    left: area.x + area.width / 2 - width / 2,
    top: area.y + area.height / 2 - height / 2,
    width,
    height,
    size,
  };
}

/** Room kept free on each side of the dice in the right column, in points. */
const COLUMN_MARGIN = 8;

/**
 * Landscape (#185): the dice box in the right column, next to the board.
 *
 * The box stays in the board's canvas coordinates (the board layer), so the
 * dice canvas keeps its native parent when the phone turns (#173): it only
 * moves to the right of the board, into the column that follows the board
 * layer. `column` is that column's width. The dice are as large as the
 * column allows, between `MIN_BOARD_DIE` and the dice row's 40 pt, and
 * centred in the column's height.
 */
export function columnDiceBox(geo: BoardGeometry, column: number, count: number): BoardDiceBox {
  // fitBoard centres the board, so the board layer is the board plus its margins.
  const layerWidth = 2 * geo.x + geo.width;
  const layerHeight = 2 * geo.y + geo.height;
  // Two dice side by side are `dicePlaces(2, 1).width` dice wide.
  const fit = (column - 2 * COLUMN_MARGIN) / dicePlaces(2, 1).width;
  const die = Math.min(DIE_SIZE, Math.max(MIN_BOARD_DIE, fit));
  const size = count === 4 ? die * DOUBLE_GROW : die;
  const { width, height } = dicePlaces(count, size);
  return {
    left: layerWidth + column / 2 - width / 2,
    top: layerHeight / 2 - height / 2,
    width,
    height,
    size,
  };
}
