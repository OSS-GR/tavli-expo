import { getLayout, getTheme, mirrorLayout } from '@tavli/themes';

import { fitBoardWithShadow, toScreenRect } from '@/features/board/geometry';

import { boardThrowBox, throwBar, throwDieSize, throwField } from './throwField';

describe('throwField', () => {
  const layout = getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated');
  const geo = fitBoardWithShadow(layout, { width: 360, height: 590 });

  // The whole playing surface: both fields, so the dice may land on any side.
  const around = (rects: readonly { x: number; y: number; width: number; height: number }[]) => ({
    left: Math.min(...rects.map((r) => r.x)),
    top: Math.min(...rects.map((r) => r.y)),
    right: Math.max(...rects.map((r) => r.x + r.width)),
    bottom: Math.max(...rects.map((r) => r.y + r.height)),
  });

  it('holds both fields and the dice area in portrait', () => {
    const field = throwField(geo);
    const [top, bottom] = layout.fields.map((f) => toScreenRect(geo, f));
    expect(field.y).toBeCloseTo(top!.y);
    expect(field.y + field.height).toBeCloseTo(bottom!.y + bottom!.height);
    expect(field.height).toBeGreaterThan(bottom!.height * 1.9);
    const dice = toScreenRect(geo, layout.diceArea);
    expect(dice.y).toBeGreaterThan(field.y);
    expect(dice.y + dice.height).toBeLessThan(field.y + field.height);
  });

  it('follows the mirrored layout (home board on the left)', () => {
    const left = fitBoardWithShadow(mirrorLayout(layout), { width: 360, height: 590 });
    expect(throwField(left).height).toBeCloseTo(throwField(geo).height);
    expect(throwField(left).width).toBeCloseTo(throwField(geo).width);
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

  it('holds both fields on the classic board too', () => {
    const wide = getLayout(getTheme('walnut-kafeneio'), 'landscape');
    const wideGeo = fitBoardWithShadow(wide, { width: 390, height: 260 });
    const field = throwField(wideGeo);
    const rects = wide.fields.map((f) => toScreenRect(wideGeo, f));
    const all = around(rects);
    expect(field.x).toBeCloseTo(all.left);
    expect(field.x + field.width).toBeCloseTo(all.right);
    expect(field.y).toBeCloseTo(all.top);
    expect(field.y + field.height).toBeCloseTo(all.bottom);
    const dice = toScreenRect(wideGeo, wide.diceArea);
    expect(dice.x).toBeGreaterThan(field.x);
    expect(dice.x + dice.width).toBeLessThan(field.x + field.width);
  });

  it('has the bar between the two fields: a gap across y on the tall board', () => {
    const bar = throwBar(geo)!;
    const [top, bottom] = layout.fields.map((f) => toScreenRect(geo, f));
    expect(bar.axis).toBe('y');
    expect(bar.from).toBeCloseTo(top!.y + top!.height);
    expect(bar.to).toBeCloseTo(bottom!.y);
    expect(bar.to).toBeGreaterThan(bar.from);
    // The shelter is the middle of the field with the dice area: the bottom one.
    expect(bar.shelter).toBeCloseTo(bottom!.y + bottom!.height / 2);
  });

  it('has the bar across x on the classic board, shelter in the right field', () => {
    const wide = getLayout(getTheme('walnut-kafeneio'), 'landscape');
    const wideGeo = fitBoardWithShadow(wide, { width: 390, height: 260 });
    const bar = throwBar(wideGeo)!;
    const [left, right] = wide.fields.map((f) => toScreenRect(wideGeo, f));
    expect(bar.axis).toBe('x');
    expect(bar.from).toBeCloseTo(left!.x + left!.width);
    expect(bar.to).toBeCloseTo(right!.x);
    expect(bar.shelter).toBeCloseTo(right!.x + right!.width / 2);
  });

  it('keeps the dice area clear of the bar', () => {
    const bar = throwBar(geo)!;
    const dice = toScreenRect(geo, layout.diceArea);
    expect(dice.y).toBeGreaterThan(bar.to);
  });
});
