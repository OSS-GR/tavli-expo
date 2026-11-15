import {
  LEFT_RAIL,
  RIGHT_RAIL,
  boardModeOf,
  isLandscapeWindow,
  railWidths,
  screenLayoutFor,
} from './screenLayout';

describe('screenLayoutFor (#185)', () => {
  const phones = {
    se: { width: 375, height: 667 },
    proMax: { width: 440, height: 956 },
  };

  it.each(Object.entries(phones))('keeps the Board layout setting in portrait (%s)', (_, size) => {
    expect(isLandscapeWindow(size)).toBe(false);
    expect(screenLayoutFor(size, 'tall')).toBe('tall');
    expect(screenLayoutFor(size, 'classic')).toBe('classic');
  });

  it.each(Object.entries(phones))('uses the landscape layout on its side (%s)', (_, size) => {
    const turned = { width: size.height, height: size.width };
    expect(isLandscapeWindow(turned)).toBe(true);
    expect(screenLayoutFor(turned, 'tall')).toBe('landscape');
    expect(screenLayoutFor(turned, 'classic')).toBe('landscape');
  });

  it('treats a square window as portrait', () => {
    expect(screenLayoutFor({ width: 500, height: 500 }, 'tall')).toBe('tall');
  });

  it('draws the classic board in landscape', () => {
    expect(boardModeOf('landscape')).toBe('classic');
    expect(boardModeOf('classic')).toBe('classic');
    expect(boardModeOf('tall')).toBe('tall');
  });
});

describe('railWidths (#185)', () => {
  it('is LEFT_RAIL and RIGHT_RAIL at the normal font size, and never narrower', () => {
    expect(railWidths(1)).toEqual({ left: LEFT_RAIL, right: RIGHT_RAIL });
    expect(railWidths(0.85)).toEqual({ left: LEFT_RAIL, right: RIGHT_RAIL });
  });

  it('grows with a large font, up to a limit', () => {
    expect(railWidths(1.2).right).toBeGreaterThan(RIGHT_RAIL);
    expect(railWidths(1.2).left).toBeGreaterThan(LEFT_RAIL);
    expect(railWidths(3)).toEqual(railWidths(1.35));
    expect(railWidths(3).right).toBeLessThan(RIGHT_RAIL * 1.5);
  });

  it('leaves the board most of an iPhone 17 Pro on its side', () => {
    // 874 pt wide, 62 pt safe edges on each side: the board keeps the rest.
    const board = 874 - 2 * 62 - LEFT_RAIL - RIGHT_RAIL;
    expect(board).toBeGreaterThanOrEqual(580);
  });

  it('fits the longest seat name and button label in Greek', () => {
    // "Υπολογιστής" (the bot) at 13 pt, about 80 pt.
    expect(LEFT_RAIL).toBeGreaterThanOrEqual(80);
    // "Επιβεβαίωση" (Confirm) at 12 pt, about 75 pt.
    expect(RIGHT_RAIL).toBeGreaterThanOrEqual(75);
  });
});
