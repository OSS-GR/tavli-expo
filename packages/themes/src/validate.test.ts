import { describe, expect, it } from 'vitest';

import walnut from '../walnut-kafeneio/theme.json';
import { assertTheme, ThemeValidationError, validateTheme } from './validate';

/** A deep copy of a valid manifest to break on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const copy = (): Record<string, any> => JSON.parse(JSON.stringify(walnut));

const errorsOf = (theme: unknown): string[] => validateTheme(theme).errors;

describe('validateTheme', () => {
  it('accepts the walnut theme', () => {
    expect(validateTheme(walnut)).toEqual({ ok: true, errors: [] });
  });

  it('rejects a value that is not an object', () => {
    expect(validateTheme(null).ok).toBe(false);
    expect(validateTheme([]).ok).toBe(false);
  });

  it('rejects unknown top-level keys and a bad id or version', () => {
    const t = copy();
    t['colour'] = {};
    t['id'] = 'Walnut Kafeneio';
    t['version'] = '1.0';
    const errors = errorsOf(t);
    expect(errors).toContain('colour: unknown key');
    expect(errors.some((e) => e.startsWith('id:'))).toBe(true);
    expect(errors.some((e) => e.startsWith('version:'))).toBe(true);
  });

  it('needs both languages in names', () => {
    const t = copy();
    delete t['name'].el;
    expect(errorsOf(t)).toContain('name.el: must be a non-empty string');
  });

  it('finds a missing point', () => {
    const t = copy();
    t['layouts']['portrait-rotated'].points = t['layouts']['portrait-rotated'].points.filter(
      (p: { index: number }) => p.index !== 7,
    );
    const errors = errorsOf(t);
    expect(errors).toContain('layouts.portrait-rotated.points: must have 24 points, has 23');
    expect(errors).toContain('layouts.portrait-rotated.points: point 7 is missing');
  });

  it('finds a point listed twice', () => {
    const t = copy();
    t['layouts'].landscape.points[3].index = 1;
    expect(errorsOf(t).some((e) => e.includes('point 1 is listed twice'))).toBe(true);
  });

  it('finds overlapping points', () => {
    const t = copy();
    const pts = t['layouts']['portrait-rotated'].points;
    pts[1].rect = { ...pts[0].rect, y: pts[0].rect.y + pts[0].rect.h / 2 };
    expect(errorsOf(t).some((e) => /points \d+ and \d+ overlap/.test(e))).toBe(true);
  });

  it('finds a rect outside 0..1', () => {
    const t = copy();
    t['layouts'].landscape.diceArea.x = 0.95;
    expect(errorsOf(t)).toContain(
      'layouts.landscape.diceArea: must lie inside 0..1 and have a positive size',
    );
  });

  it('finds a tray on top of a point', () => {
    const t = copy();
    const l = t['layouts']['portrait-rotated'];
    l.trays.player.rect = { ...l.points[0].rect };
    expect(errorsOf(t).some((e) => e.includes('a tray overlaps point'))).toBe(true);
  });

  it('checks the aspect ratio against the reference size', () => {
    const t = copy();
    t['layouts'].landscape.aspectRatio = 1;
    expect(errorsOf(t)).toContain(
      'layouts.landscape.aspectRatio: must equal referenceSize.width / referenceSize.height',
    );
  });

  it('finds unknown palette tokens and bad colors', () => {
    const t = copy();
    t['checkers'].light.fill = '{checker.ivory}';
    t['dice'].pip = 'black';
    const errors = errorsOf(t);
    expect(errors).toContain('checkers.light.fill: unknown palette token "checker.ivory"');
    expect(errors).toContain('dice.pip: must be #RRGGBB or a {palette.token}');
  });

  it('needs the required palette tokens', () => {
    const t = copy();
    delete t['palette']['board.field'];
    expect(errorsOf(t)).toContain('palette: needs the token "board.field"');
  });

  it('finds unknown images and bad scales', () => {
    const t = copy();
    t['layouts'].landscape.layers[0].image = 'boardSquare';
    t['points'].dark.texture = 'pointOak';
    t['images'].pointBone.scales = [2, 1];
    t['images'].pointEbony.file = 'point-ebony.png';
    const errors = errorsOf(t);
    expect(errors).toContain('layouts.landscape.layers[0].image: unknown image "boardSquare"');
    expect(errors).toContain('points.dark.texture: unknown image "pointOak"');
    expect(errors).toContain('images.pointBone.scales: must be unique and in order');
    expect(errors.some((e) => e.startsWith('images.pointEbony.file'))).toBe(true);
  });

  it('needs both layouts', () => {
    const t = copy();
    delete t['layouts'].landscape;
    expect(errorsOf(t)).toContain('layouts.landscape: must be an object');
  });

  it('checks sound and haptic keys', () => {
    const t = copy();
    t['sounds'].boom = null;
    t['haptics'].win = 'buzz';
    const errors = errorsOf(t);
    expect(errors).toContain('sounds.boom: unknown sound key');
    expect(errors.some((e) => e.startsWith('haptics.win: must be one of'))).toBe(true);
  });

  it('assertTheme throws with every error listed', () => {
    const t = copy();
    t['version'] = 'x';
    t['kind'] = '3d';
    try {
      assertTheme(t);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ThemeValidationError);
      expect((e as ThemeValidationError).errors).toHaveLength(2);
      expect((e as Error).message).toMatch(/walnut-kafeneio/);
    }
  });
});
