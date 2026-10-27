import {
  SIDE_COLUMN,
  boardModeOf,
  isLandscapeWindow,
  screenLayoutFor,
  sideColumnWidth,
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

describe('sideColumnWidth (#185)', () => {
  it('is SIDE_COLUMN at the normal font size, and never narrower', () => {
    expect(sideColumnWidth(1)).toBe(SIDE_COLUMN);
    expect(sideColumnWidth(0.85)).toBe(SIDE_COLUMN);
  });

  it('grows with a large font, up to a limit', () => {
    expect(sideColumnWidth(1.2)).toBeGreaterThan(SIDE_COLUMN);
    expect(sideColumnWidth(3)).toBe(sideColumnWidth(1.35));
    expect(sideColumnWidth(3)).toBeLessThan(SIDE_COLUMN * 1.5);
  });

  it('fits the longest label: Greek "Επιβεβαίωση" in a compact button', () => {
    // About 100 pt at 17 pt; the compact button adds 4 pt padding and a 2 pt
    // border on each side; the column adds 4 pt on each side.
    expect(SIDE_COLUMN - 2 * 4 - 2 * (4 + 2)).toBeGreaterThanOrEqual(104);
  });
});
