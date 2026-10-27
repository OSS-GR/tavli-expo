import { getTheme } from '@tavli/themes';

import { boardLayout } from './BoardCanvas';
import { MIN_BOARD_DIE, boardDiceBox, columnDiceBox } from './boardDice';
import { DIE_SIZE, dicePlaces, doublePlaces } from './diceMotion';
import { fitBoardWithShadow, toScreenRect } from './geometry';

const theme = getTheme('walnut-kafeneio');
const PHONES = {
  se: { tall: { width: 375, height: 520 }, classic: { width: 375, height: 230 } },
  proMax: { tall: { width: 440, height: 780 }, classic: { width: 440, height: 270 } },
};

describe('boardDiceBox (#184)', () => {
  for (const [phone, spaces] of Object.entries(PHONES)) {
    for (const mode of ['tall', 'classic'] as const) {
      for (const side of ['right', 'left'] as const) {
        it(`centres the dice on the dice area (${phone}, ${mode}, home ${side})`, () => {
          const geo = fitBoardWithShadow(boardLayout(theme, mode, side), spaces[mode]);
          const area = toScreenRect(geo, geo.layout.diceArea);
          for (const count of [2, 4]) {
            const box = boardDiceBox(geo, count);
            expect(box.left + box.width / 2).toBeCloseTo(area.x + area.width / 2, 6);
            expect(box.top + box.height / 2).toBeCloseTo(area.y + area.height / 2, 6);
            const row = dicePlaces(count, box.size, box.pairSize);
            expect([box.width, box.height]).toEqual([row.width, row.height]);
            // The box stays on the board.
            expect(box.left).toBeGreaterThanOrEqual(geo.x);
            expect(box.left + box.width).toBeLessThanOrEqual(geo.x + geo.width);
            expect(box.top).toBeGreaterThanOrEqual(geo.y);
            expect(box.top + box.height).toBeLessThanOrEqual(geo.y + geo.height);
          }
        });
      }
    }
  }

  it('keeps the dice easy to read: at least MIN_BOARD_DIE, more for a double', () => {
    const se = fitBoardWithShadow(boardLayout(theme, 'classic'), PHONES.se.classic);
    // The theme's die would be about 19 pt on the classic board of an iPhone SE.
    expect(se.layout.dice.size * se.width).toBeLessThan(MIN_BOARD_DIE);
    expect(boardDiceBox(se, 2).size).toBe(MIN_BOARD_DIE);
    // A double's four dice sit in a grid at about 0.6 of the size: they get more room.
    expect(boardDiceBox(se, 4).size).toBeGreaterThan(MIN_BOARD_DIE);
    const big = fitBoardWithShadow(boardLayout(theme, 'tall'), PHONES.proMax.tall);
    expect(boardDiceBox(big, 2).size).toBeCloseTo(big.layout.dice.size * big.width, 6);
  });

  it('shows the two dice of a double at the size of any roll (#177)', () => {
    for (const mode of ['tall', 'classic'] as const) {
      const geo = fitBoardWithShadow(boardLayout(theme, mode), PHONES.se[mode]);
      const two = boardDiceBox(geo, 2);
      const four = boardDiceBox(geo, 4);
      expect(four.pairSize).toBe(two.size);
      expect(two.pairSize).toBe(two.size);
      const { pair } = doublePlaces(four.size, four.pairSize);
      expect(pair.map((p) => p.size)).toEqual([two.size, two.size]);
    }
  });
});

describe('columnDiceBox (#185)', () => {
  // The board's space between the two side columns in landscape.
  const SPACES = {
    se: { width: 403, height: 363 },
    proMax: { width: 568, height: 407 },
  };

  for (const [phone, space] of Object.entries(SPACES)) {
    for (const side of ['right', 'left'] as const) {
      it(`puts the dice in the right column, centred (${phone}, home ${side})`, () => {
        const geo = fitBoardWithShadow(boardLayout(theme, 'classic', side), space);
        // fitBoard centres the board in its space, so the layer is the space.
        expect(2 * geo.x + geo.width).toBeCloseTo(space.width, 6);
        for (const column of [128, 160]) {
          for (const count of [2, 4]) {
            const box = columnDiceBox(geo, column, count);
            const row = dicePlaces(count, box.size, box.pairSize);
            expect([box.width, box.height]).toEqual([row.width, row.height]);
            // Right of the board layer, inside the column, in the middle.
            expect(box.left).toBeGreaterThanOrEqual(space.width);
            expect(box.left + box.width).toBeLessThanOrEqual(space.width + column);
            expect(box.left + box.width / 2).toBeCloseTo(space.width + column / 2, 6);
            expect(box.top + box.height / 2).toBeCloseTo(space.height / 2, 6);
          }
        }
      });
    }
  }

  it('makes the dice as big as the column allows, between MIN_BOARD_DIE and 40 pt', () => {
    const geo = fitBoardWithShadow(boardLayout(theme, 'classic'), SPACES.se);
    const narrow = columnDiceBox(geo, 128, 2).size;
    expect(narrow).toBeGreaterThanOrEqual(MIN_BOARD_DIE);
    expect(narrow).toBeLessThan(DIE_SIZE);
    expect(columnDiceBox(geo, 400, 2).size).toBe(DIE_SIZE);
    expect(columnDiceBox(geo, 60, 2).size).toBe(MIN_BOARD_DIE);
    // A double gets more room, as on the board.
    expect(columnDiceBox(geo, 128, 4).size).toBeGreaterThan(narrow);
  });
});
