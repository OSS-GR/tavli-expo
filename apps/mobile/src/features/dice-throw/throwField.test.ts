import { getLayout, getTheme, mirrorLayout } from '@tavli/themes';

import { fitBoardWithShadow, toScreenRect } from '@/features/board/geometry';

import { boardThrowBox, throwDieSize, throwField } from './throwField';

describe('throwField', () => {
  const layout = getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated');
  const geo = fitBoardWithShadow(layout, { width: 360, height: 590 });

  it('is the field with the dice area: the bottom one in portrait', () => {
    const field = throwField(geo);
    expect(field).toEqual(toScreenRect(geo, layout.fields[1]!));
    const dice = toScreenRect(geo, layout.diceArea);
    expect(dice.y).toBeGreaterThan(field.y);
    expect(dice.y + dice.height).toBeLessThan(field.y + field.height);
  });

  it('follows the mirrored layout (home board on the left)', () => {
    const left = fitBoardWithShadow(mirrorLayout(layout), { width: 360, height: 590 });
    expect(throwField(left).height).toBeCloseTo(throwField(geo).height);
  });

  it('keeps a whole die inside the field', () => {
    const field = throwField(geo);
    const box = boardThrowBox(geo);
    const half = throwDieSize(geo) / 2;
    expect(box.left - half).toBeGreaterThanOrEqual(field.x);
    expect(box.right + half).toBeLessThanOrEqual(field.x + field.width);
    expect(box.top - half).toBeGreaterThanOrEqual(field.y);
    expect(box.bottom + half).toBeLessThanOrEqual(field.y + field.height);
  });
});
