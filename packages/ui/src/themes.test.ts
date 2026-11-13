import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast';
import { displayCaps } from './text';
import { DEFAULT_THEME_ID, isThemeId, THEME_IDS, themes } from './themes';
import { spacing, touch } from './tokens';

const HEX = /^#[0-9A-F]{6}$/i;

describe('themes', () => {
  it('has the default theme', () => {
    expect(THEME_IDS).toContain(DEFAULT_THEME_ID);
    expect(isThemeId(DEFAULT_THEME_ID)).toBe(true);
    expect(isThemeId('toString')).toBe(false);
    expect(isThemeId(42)).toBe(false);
  });

  for (const id of THEME_IDS) {
    const theme = themes[id];

    describe(id, () => {
      it('uses its key as id', () => {
        expect(theme.id).toBe(id);
      });

      it('uses #RRGGBB colors', () => {
        const { you, ...woods } = theme.avatar;
        const groups = [
          theme.colors,
          theme.board,
          theme.checker,
          theme.highlight,
          theme.dice,
          ...Object.values(woods),
          { you },
        ];
        for (const group of groups) {
          for (const value of Object.values(group)) {
            expect(value).toMatch(HEX);
          }
        }
      });

      it('keeps text readable (WCAG AA, 4.5:1)', () => {
        const { colors } = theme;
        expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.text, colors.surfaceSelected)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.textDim, colors.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.textDim, colors.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
      });

      // Every other text and background pair the app uses (#134).
      it.each([
        ['textDim', 'surfaceSelected'], // a picked option's hint
        ['text', 'backgroundDeep'], // hints over the board, toasts, the sheet
        ['textDim', 'backgroundDeep'], // the tagline on Home
        ['accent', 'surface'], // the tutorial hint
        ['onAccent', 'turn'], // the turn pill
        ['onAccent', 'accentLight'], // the main button's gradient (#356)
        ['text', 'accentWash'], // the "Learn to play" banner on Home (#342)
        ['textDim', 'accentWash'],
        // Error popups and lines (#462).
        ['problem', 'problemWash'],
        ['text', 'problemWash'],
        ['textDim', 'problemWash'],
        ['problem', 'surface'],
        ['problem', 'background'],
        // Buttons (#491): the second button, a pressed one, brass text buttons.
        ['text', 'surfaceRaised'],
        ['onAccent', 'accentPressed'],
        ['problem', 'problemPressed'],
        ['accentLight', 'background'],
        ['accentLight', 'surface'],
        ['accentLight', 'surfaceRaised'],
        ['accentLight', 'backgroundDeep'],
        // Home's level chip and game tiles (#517).
        ['text', 'surfaceWell'],
        ['textDim', 'surfaceWell'],
        // Locked or disabled labels ("Coming soon", a disabled Undo). WCAG lets
        // disabled controls be fainter, but locked labels still carry meaning.
        ['textDisabled', 'background'],
        ['textDisabled', 'surface'],
      ] as const)('keeps %s on %s readable (WCAG AA, 4.5:1)', (fg, bg) => {
        expect(contrastRatio(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(4.5);
      });

      // Checker avatars (#495): the initials on each wood.
      it.each(['bone', 'maple', 'walnut', 'ebony'] as const)(
        'keeps the initials readable on a %s avatar (WCAG AA, 4.5:1)',
        (wood) => {
          const colors = theme.avatar[wood];
          expect(contrastRatio(colors.text, colors.face)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text, colors.center)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.text, colors.ring)).toBeGreaterThanOrEqual(4.5);
        },
      );

      it('keeps controls visible (WCAG 1.4.11, 3:1)', () => {
        const { colors } = theme;
        expect(contrastRatio(colors.accent, colors.background)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.accent, colors.surface)).toBeGreaterThanOrEqual(3);
        // The outline of an error popup (#462).
        expect(contrastRatio(colors.problemLine, colors.surface)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.switchThumb, colors.switchTrackOff)).toBeGreaterThanOrEqual(3);
        // Disabled buttons still read as buttons (#491). WCAG exempts their text.
        expect(contrastRatio(colors.onAccentMuted, colors.accentMuted)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.textFaint, colors.surfaceSunken)).toBeGreaterThanOrEqual(3);
      });

      it('keeps the checkers apart (3:1)', () => {
        expect(contrastRatio(theme.checker.light, theme.checker.dark)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

describe('tokens', () => {
  it('grows spacing from small to large', () => {
    const values = Object.values(spacing);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('keeps touch targets at 44 pt or more', () => {
    for (const value of Object.values(touch)) {
      expect(value).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('displayCaps', () => {
  it('drops the Greek tonos', () => {
    expect(displayCaps('Παιχνίδι')).toBe('ΠΑΙΧΝΙΔΙ');
    expect(displayCaps('Ήχος και δόνηση')).toBe('ΗΧΟΣ ΚΑΙ ΔΟΝΗΣΗ');
    expect(displayCaps('Εμφάνιση')).toBe('ΕΜΦΑΝΙΣΗ');
  });

  it('keeps the dialytika', () => {
    expect(displayCaps('Προϊόν')).toBe('ΠΡΟΪΟΝ');
    expect(displayCaps('ΐ')).toBe('Ϊ');
  });

  it('upper-cases English', () => {
    expect(displayCaps('Sound and feel')).toBe('SOUND AND FEEL');
  });
});
