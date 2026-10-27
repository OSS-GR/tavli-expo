import { getTheme } from '@tavli/themes';

import { boardLayout } from './BoardCanvas';
import { MIN_BOARD_DIE, boardDiceBox } from './boardDice';
import { dicePlaces } from './diceMotion';
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
            const row = dicePlaces(count, box.size);
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
});
