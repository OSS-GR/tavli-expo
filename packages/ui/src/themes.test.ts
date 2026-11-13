import { describe, expect, it } from 'vitest';

import { contrastRatio, luminance } from './contrast';
import { displayCaps } from './text';
import {
  DEFAULT_THEME_ID,
  isThemeChoice,
  isThemeId,
  MATCH_BOARD,
  resolveThemeId,
  THEME_CHOICES,
  THEME_IDS,
  themeForBoard,
  themes,
} from './themes';
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
        // The invite code's bone tiles (#516).
        ['tileText', 'tileFace'],
        ['tileText', 'tileFaceLight'],
        // Locked or disabled labels ("Coming soon", a disabled Undo). WCAG lets
        // disabled controls be fainter, but locked labels still carry meaning.
        ['textDisabled', 'background'],
        ['textDisabled', 'surface'],
        // Matching color themes (#528): the light theme turns these around,
        // so every theme checks them.
        ['textDim', 'surfaceRaised'],
        ['text', 'backgroundLamp'], // the top of every screen
        ['textDim', 'backgroundLamp'],
        ['text', 'backgroundFloor'], // the bottom of every screen
        ['textDim', 'backgroundFloor'],
        ['turnText', 'background'], // "Your turn", the turn pill text
        ['turnText', 'surface'],
        ['turnText', 'surfaceRaised'],
        ['turnText', 'backgroundDeep'],
        ['problem', 'surfaceRaised'],
        ['accent', 'surfaceRaised'], // brass or mahogany text buttons
        ['accentLight', 'surfaceSelected'],
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
        // Icons and rings (#528): the picked option's check, chevrons, the turn ring.
        expect(contrastRatio(colors.accent, colors.surfaceSelected)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.accent, colors.surfaceRaised)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.textFaint, colors.surface)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.textDim, colors.surfaceSunken)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.turn, colors.background)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.turn, colors.surface)).toBeGreaterThanOrEqual(3);
      });

      // The status bar and native parts follow `scheme` (#528).
      it('says light or dark to match its background', () => {
        const light = luminance(theme.colors.background) > 0.5;
        expect(theme.scheme).toBe(light ? 'light' : 'dark');
      });

      it('keeps the checkers apart (3:1)', () => {
        expect(contrastRatio(theme.checker.light, theme.checker.dark)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

describe('app colors choice (#528)', () => {
  it('lists Match the board first, then every theme', () => {
    expect(THEME_CHOICES).toEqual([MATCH_BOARD, ...THEME_IDS]);
    expect(isThemeChoice(MATCH_BOARD)).toBe(true);
    expect(isThemeChoice('olive-inlay')).toBe(true);
    expect(isThemeChoice('neon')).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });

  it('has app colors for each bundled board', () => {
    expect(themeForBoard('walnut-kafeneio')).toBe('walnut-kafeneio');
    expect(themeForBoard('olive-inlay')).toBe('olive-inlay');
    expect(themeForBoard('kafeneio-night')).toBe('kafeneio-night');
  });

  it('falls back to the default for a board with no colors of its own', () => {
    expect(themeForBoard('some-new-board')).toBe(DEFAULT_THEME_ID);
    expect(themeForBoard('toString')).toBe(DEFAULT_THEME_ID);
  });

  it('follows the board with Match the board', () => {
    expect(resolveThemeId(MATCH_BOARD, 'olive-inlay')).toBe('olive-inlay');
    expect(resolveThemeId(MATCH_BOARD, 'kafeneio-night')).toBe('kafeneio-night');
    expect(resolveThemeId(MATCH_BOARD, 'walnut-kafeneio')).toBe('walnut-kafeneio');
  });

  it('keeps a picked theme with any board', () => {
    for (const board of ['walnut-kafeneio', 'olive-inlay', 'kafeneio-night']) {
      expect(resolveThemeId('kafeneio-night', board)).toBe('kafeneio-night');
      expect(resolveThemeId('olive-inlay', board)).toBe('olive-inlay');
    }
  });
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
