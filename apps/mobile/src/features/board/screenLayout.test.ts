import el from '@/i18n/el.json';
import en from '@/i18n/en.json';

import {
  LEFT_RAIL,
  RAIL_WIDTHS,
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
    expect(874 - 2 * 62 - LEFT_RAIL - RIGHT_RAIL).toBeGreaterThanOrEqual(620);
    const greek = RAIL_WIDTHS.el;
    expect(874 - 2 * 62 - greek.left - greek.right).toBeGreaterThanOrEqual(580);
  });

  it('is wider in Greek, and grows the same way with the font', () => {
    expect(railWidths(1, 'el')).toEqual(RAIL_WIDTHS.el);
    expect(railWidths(1, 'en')).toEqual(RAIL_WIDTHS.en);
    expect(railWidths(3, 'el')).toEqual(railWidths(1.35, 'el'));
    expect(railWidths(1.2, 'el').left).toBeGreaterThan(RAIL_WIDTHS.el.left);
  });

  it('fits the longest one-word label of each rail, measured at the normal font size', () => {
    // Measured in the system font (see RAIL_WIDTHS): "Opponent" (13 pt) is
    // about 63 pt, "Υπολογιστής" (13 pt) about 82 pt, "Επιβεβαίωση" (12 pt)
    // about 78 pt.
    expect(RAIL_WIDTHS.en.left).toBeGreaterThanOrEqual(63);
    expect(RAIL_WIDTHS.en.right).toBeGreaterThanOrEqual(63);
    expect(RAIL_WIDTHS.el.left).toBeGreaterThanOrEqual(82);
    expect(RAIL_WIDTHS.el.right).toBeGreaterThanOrEqual(78);
  });

  it('has no rail word longer than the measured ones', () => {
    // A longer word needs a new measure and maybe a wider rail.
    const left = ['game.bot.name', 'game.you', 'online.opponent', 'online.guestName'];
    const right = [
      'game.controls.undoLabel',
      'game.controls.confirm',
      'game.hint.button',
      'game.hint.busy',
      'game.fastForward.button',
      'game.fastForward.stop',
      'game.roll.dice',
    ];
    const text = (strings: object, key: string): string => {
      const value = key
        .split('.')
        .reduce<unknown>((at, part) => (at as Record<string, unknown>)[part], strings);
      expect(typeof value).toBe('string');
      return String(value).replace(/\{\{[^}]*\}\}/g, '');
    };
    const longest = (strings: object, keys: readonly string[]): number =>
      Math.max(
        ...keys.flatMap((key) => text(strings, key).split(/\s+/)).map((word) => [...word].length),
      );
    expect(longest(en, left)).toBeLessThanOrEqual([...'Opponent'].length);
    expect(longest(en, right)).toBeLessThanOrEqual([...'Thinking…'].length);
    expect(longest(el, left)).toBeLessThanOrEqual([...'Υπολογιστής'].length);
    expect(longest(el, right)).toBeLessThanOrEqual([...'Επιβεβαίωση'].length);
  });
});
