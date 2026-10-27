/**
 * Runtime validation of a theme manifest.
 *
 * This works like a small JSON Schema: it checks shapes, types and ranges,
 * and it also checks rules a schema cannot express (24 unique points,
 * no overlapping points, every image and token reference exists).
 * It does not touch the file system. The tests check files on disk.
 */

import { isHexColor, tokenRef } from './color';
import { rectInsideUnit, rectsOverlap } from './geometry';
import type { FeedbackEvent, HapticKey, LayoutId, Rect, SoundKey, ThemeManifest } from './types';

export const LAYOUT_IDS: readonly LayoutId[] = ['portrait-rotated', 'landscape'];
/** Every game event a theme can give a sound and a haptic (see `FeedbackEvent`). */
export const FEEDBACK_EVENTS = [
  'checkerPickUp',
  'checkerPlace',
  'checkerHit',
  'bearOff',
  'diceShake',
  'diceRoll',
  'diceLand',
  'invalidMove',
  'turnStart',
  'gameWin',
  'matchWin',
] as const satisfies readonly FeedbackEvent[];
export const SOUND_KEYS: readonly SoundKey[] = FEEDBACK_EVENTS;
export const HAPTIC_KEYS: readonly HapticKey[] = FEEDBACK_EVENTS;
/** Sound files: `sounds/<kebab-name>.m4a` (or `.mp3`), inside the theme folder. */
export const SOUND_FILE_PATTERN = /^sounds\/[a-z0-9]+(-[a-z0-9]+)*\.(m4a|mp3)$/;
/** Most takes one sound may list. */
export const MAX_SOUND_TAKES = 8;
export const HAPTIC_STYLES = [
  'selection',
  'light',
  'medium',
  'heavy',
  'success',
  'warning',
  'error',
] as const;
/** Tokens every theme defines. The contrast tests and the app UI read them. */
export const REQUIRED_TOKENS = [
  'board.frame',
  'board.field',
  'board.point.dark',
  'board.point.light',
  'checker.light',
  'checker.dark',
  'ui.bg',
  'ui.bg.outer',
  'ui.text',
] as const;
const BLEND_MODES = ['srcOver', 'multiply', 'softLight', 'screen', 'overlay'];
const SIDES = ['left', 'right', 'top', 'bottom'];
const TOP_LEVEL_KEYS = [
  'id',
  'version',
  'name',
  'description',
  'kind',
  'license',
  'defaultLayout',
  'palette',
  'images',
  'layouts',
  'points',
  'checkers',
  'highlights',
  'dice',
  'sounds',
  'haptics',
  'accessibility',
];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export class ThemeValidationError extends Error {
  readonly errors: string[];
  constructor(id: string, errors: string[]) {
    super(`Theme "${id}" is not valid:\n- ${errors.join('\n- ')}`);
    this.name = 'ThemeValidationError';
    this.errors = errors;
  }
}

type Obj = Record<string, unknown>;

class Checker {
  readonly errors: string[] = [];
  palette: Obj = {};

  fail(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  obj(v: unknown, path: string): Obj | null {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v as Obj;
    this.fail(path, 'must be an object');
    return null;
  }

  arr(v: unknown, path: string): unknown[] | null {
    if (Array.isArray(v)) return v;
    this.fail(path, 'must be an array');
    return null;
  }

  str(v: unknown, path: string, pattern?: RegExp): string | null {
    if (typeof v !== 'string' || v.length === 0) {
      this.fail(path, 'must be a non-empty string');
      return null;
    }
    if (pattern && !pattern.test(v)) this.fail(path, `must match ${String(pattern)}`);
    return v;
  }

  num(v: unknown, path: string, min = -Infinity, max = Infinity, int = false): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.fail(path, 'must be a number');
      return null;
    }
    if (v < min || v > max) this.fail(path, `must be between ${min} and ${max}`);
    if (int && !Number.isInteger(v)) this.fail(path, 'must be an integer');
    return v;
  }

  oneOf(v: unknown, path: string, options: readonly string[]): void {
    if (typeof v !== 'string' || !options.includes(v)) {
      this.fail(path, `must be one of ${options.join(', ')}`);
    }
  }

  color(v: unknown, path: string): void {
    if (typeof v !== 'string') {
      this.fail(path, 'must be a color string');
      return;
    }
    const ref = tokenRef(v);
    if (ref !== null) {
      if (!isHexColor(this.palette[ref])) this.fail(path, `unknown palette token "${ref}"`);
    } else if (!isHexColor(v)) {
      this.fail(path, 'must be #RRGGBB or a {palette.token}');
    }
  }

  text(v: unknown, path: string): void {
    const o = this.obj(v, path);
    if (!o) return;
    this.str(o['en'], `${path}.en`);
    this.str(o['el'], `${path}.el`);
  }

  rect(v: unknown, path: string): Rect | null {
    const o = this.obj(v, path);
    if (!o) return null;
    const x = this.num(o['x'], `${path}.x`);
    const y = this.num(o['y'], `${path}.y`);
    const w = this.num(o['w'], `${path}.w`);
    const h = this.num(o['h'], `${path}.h`);
    if (x === null || y === null || w === null || h === null) return null;
    const r = { x, y, w, h };
    if (!rectInsideUnit(r)) this.fail(path, 'must lie inside 0..1 and have a positive size');
    return r;
  }

  stops(v: unknown, path: string): void {
    const a = this.arr(v, path);
    if (!a) return;
    if (a.length < 2) this.fail(path, 'needs at least 2 stops');
    let last = -Infinity;
    a.forEach((s, i) => {
      const o = this.obj(s, `${path}[${i}]`);
      if (!o) return;
      const off = this.num(o['offset'], `${path}[${i}].offset`, 0, 1);
      if (off !== null && off < last) this.fail(`${path}[${i}].offset`, 'stops must be in order');
      if (off !== null) last = off;
      this.color(o['color'], `${path}[${i}].color`);
      this.num(o['opacity'], `${path}[${i}].opacity`, 0, 1);
    });
  }

  radial(v: unknown, path: string): void {
    const o = this.obj(v, path);
    if (!o) return;
    if (o['type'] !== 'radial') this.fail(`${path}.type`, 'must be "radial"');
    for (const k of ['cx', 'cy']) this.num(o[k], `${path}.${k}`);
    for (const k of ['rx', 'ry']) this.num(o[k], `${path}.${k}`, 1e-6);
    this.stops(o['stops'], `${path}.stops`);
  }

  linear(v: unknown, path: string): void {
    const o = this.obj(v, path);
    if (!o) return;
    if (o['type'] !== 'linear') this.fail(`${path}.type`, 'must be "linear"');
    for (const k of ['x1', 'y1', 'x2', 'y2']) this.num(o[k], `${path}.${k}`);
    this.stops(o['stops'], `${path}.stops`);
  }

  shadow(v: unknown, path: string): void {
    const o = this.obj(v, path);
    if (!o) return;
    this.num(o['dx'], `${path}.dx`);
    this.num(o['dy'], `${path}.dy`);
    this.num(o['blur'], `${path}.blur`, 0);
    this.color(o['color'], `${path}.color`);
    this.num(o['opacity'], `${path}.opacity`, 0, 1);
  }

  stroke(v: unknown, path: string): void {
    const o = this.obj(v, path);
    if (!o) return;
    this.color(o['color'], `${path}.color`);
    this.num(o['opacity'], `${path}.opacity`, 0, 1);
    this.num(o['width'], `${path}.width`, 0);
  }

  slot(v: unknown, path: string): Rect | null {
    const o = this.obj(v, path);
    if (!o) return null;
    this.oneOf(o['base'], `${path}.base`, SIDES);
    return this.rect(o['rect'], `${path}.rect`);
  }

  groove(v: unknown, path: string): void {
    const o = this.obj(v, path);
    if (!o) return;
    this.num(o['radius'], `${path}.radius`, 0, 1);
    this.num(o['width'], `${path}.width`, 0);
    this.color(o['color'], `${path}.color`);
    this.num(o['opacity'], `${path}.opacity`, 0, 1);
    const l = this.obj(o['light'], `${path}.light`);
    if (l) {
      this.num(l['opacity'], `${path}.light.opacity`, 0, 1);
      this.num(l['width'], `${path}.light.width`, 0);
      this.num(l['dx'], `${path}.light.dx`);
      this.num(l['dy'], `${path}.light.dy`);
    }
  }
}

function checkLayout(c: Checker, v: unknown, path: string, images: Obj): void {
  const o = c.obj(v, path);
  if (!o) return;
  c.oneOf(o['orientation'], `${path}.orientation`, ['portrait', 'landscape']);
  const aspect = c.num(o['aspectRatio'], `${path}.aspectRatio`, 0.1, 10);
  const ref = c.obj(o['referenceSize'], `${path}.referenceSize`);
  if (ref) {
    const w = c.num(ref['width'], `${path}.referenceSize.width`, 1);
    const h = c.num(ref['height'], `${path}.referenceSize.height`, 1);
    if (aspect !== null && w !== null && h !== null && Math.abs(w / h - aspect) > 1e-3) {
      c.fail(`${path}.aspectRatio`, 'must equal referenceSize.width / referenceSize.height');
    }
  }

  const layers = c.arr(o['layers'], `${path}.layers`) ?? [];
  if (layers.length === 0) c.fail(`${path}.layers`, 'needs at least one image layer');
  layers.forEach((l, i) => {
    const p = `${path}.layers[${i}]`;
    const lo = c.obj(l, p);
    if (!lo) return;
    c.str(lo['id'], `${p}.id`);
    const img = c.str(lo['image'], `${p}.image`);
    if (img !== null && !(img in images)) c.fail(`${p}.image`, `unknown image "${img}"`);
    c.oneOf(lo['z'], `${p}.z`, ['underPoints', 'overPoints']);
    c.oneOf(lo['blend'], `${p}.blend`, BLEND_MODES);
  });

  const fields = c.arr(o['fields'], `${path}.fields`) ?? [];
  if (fields.length !== 2) c.fail(`${path}.fields`, 'must have 2 rects');
  fields.forEach((f, i) => c.rect(f, `${path}.fields[${i}]`));

  // Points: exactly 1..24, inside 0..1, no overlaps.
  const points = c.arr(o['points'], `${path}.points`) ?? [];
  if (points.length !== 24) c.fail(`${path}.points`, `must have 24 points, has ${points.length}`);
  const seen = new Set<number>();
  const rects: { index: number; rect: Rect }[] = [];
  points.forEach((pt, i) => {
    const p = `${path}.points[${i}]`;
    const po = c.obj(pt, p);
    if (!po) return;
    const index = c.num(po['index'], `${p}.index`, 1, 24, true);
    if (index !== null) {
      if (seen.has(index)) c.fail(`${p}.index`, `point ${index} is listed twice`);
      seen.add(index);
    }
    c.oneOf(po['base'], `${p}.base`, SIDES);
    c.oneOf(po['tone'], `${p}.tone`, ['dark', 'light']);
    const r = c.rect(po['rect'], `${p}.rect`);
    if (r && index !== null) rects.push({ index, rect: r });
  });
  for (let n = 1; n <= 24; n++) if (!seen.has(n)) c.fail(`${path}.points`, `point ${n} is missing`);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a && b && rectsOverlap(a.rect, b.rect, 1e-6)) {
        c.fail(`${path}.points`, `points ${a.index} and ${b.index} overlap`);
      }
    }
  }

  const ps = c.obj(o['pointShape'], `${path}.pointShape`);
  if (ps) {
    c.num(ps['depth'], `${path}.pointShape.depth`, 0.1, 1);
    c.num(ps['baseInset'], `${path}.pointShape.baseInset`, 0, 0.45);
    c.stroke(ps['seam'], `${path}.pointShape.seam`);
    c.num(ps['tileSize'], `${path}.pointShape.tileSize`, 1e-4);
    c.num(ps['tileRotation'], `${path}.pointShape.tileRotation`, -360, 360);
  }

  const bar = c.obj(o['bar'], `${path}.bar`);
  if (bar) {
    c.rect(bar['rect'], `${path}.bar.rect`);
    c.slot(bar['player'], `${path}.bar.player`);
    c.slot(bar['opponent'], `${path}.bar.opponent`);
  }
  const trays = c.obj(o['trays'], `${path}.trays`);
  if (trays) {
    const a = c.slot(trays['player'], `${path}.trays.player`);
    const b = c.slot(trays['opponent'], `${path}.trays.opponent`);
    if (a && b && rectsOverlap(a, b)) c.fail(`${path}.trays`, 'the two trays overlap');
    for (const t of [a, b]) {
      if (!t) continue;
      for (const r of rects) {
        if (rectsOverlap(t, r.rect)) c.fail(`${path}.trays`, `a tray overlaps point ${r.index}`);
      }
    }
  }
  c.rect(o['diceArea'], `${path}.diceArea`);

  const ch = c.obj(o['checker'], `${path}.checker`);
  if (ch) {
    c.num(ch['radius'], `${path}.checker.radius`, 1e-4, 0.5);
    c.num(ch['stackSpacing'], `${path}.checker.stackSpacing`, 1e-4, 1);
    c.num(ch['stackInset'], `${path}.checker.stackInset`, 0, 0.5);
    c.num(ch['maxStackDepth'], `${path}.checker.maxStackDepth`, 0.1, 1);
    c.num(ch['maxVisible'], `${path}.checker.maxVisible`, 1, 15, true);
    c.num(ch['trayThickness'], `${path}.checker.trayThickness`, 1e-4, 0.5);
  }
  const dice = c.obj(o['dice'], `${path}.dice`);
  if (dice) {
    c.num(dice['size'], `${path}.dice.size`, 1e-4, 0.5);
    const tilt = c.arr(dice['tilt'], `${path}.dice.tilt`);
    if (tilt && tilt.length !== 2) c.fail(`${path}.dice.tilt`, 'must have 2 angles');
    tilt?.forEach((t, i) => c.num(t, `${path}.dice.tilt[${i}]`, -180, 180));
  }
  c.shadow(o['shadow'], `${path}.shadow`);
  if (o['overlay'] !== undefined) {
    const ov = c.obj(o['overlay'], `${path}.overlay`);
    if (ov) {
      c.radial(ov['gradient'], `${path}.overlay.gradient`);
      c.oneOf(ov['blend'], `${path}.overlay.blend`, BLEND_MODES);
    }
  }
}

function checkCheckerStyle(c: Checker, v: unknown, path: string): void {
  const o = c.obj(v, path);
  if (!o) return;
  c.text(o['name'], `${path}.name`);
  c.color(o['fill'], `${path}.fill`);
  c.radial(o['highlight'], `${path}.highlight`);
  if (o['dish'] !== undefined) {
    const d = c.obj(o['dish'], `${path}.dish`);
    if (d) {
      c.num(d['radius'], `${path}.dish.radius`, 0, 1);
      c.radial(d['gradient'], `${path}.dish.gradient`);
      c.groove(d['groove'], `${path}.dish.groove`);
    }
  }
  (c.arr(o['grooves'], `${path}.grooves`) ?? []).forEach((g, i) =>
    c.groove(g, `${path}.grooves[${i}]`),
  );
  const bevel = c.obj(o['bevel'], `${path}.bevel`);
  if (bevel) {
    c.num(bevel['inset'], `${path}.bevel.inset`, 0, 1);
    c.num(bevel['width'], `${path}.bevel.width`, 0, 1);
    c.num(bevel['opacity'], `${path}.bevel.opacity`, 0, 1);
    c.linear(bevel['gradient'], `${path}.bevel.gradient`);
  }
  for (const k of ['ring', 'rim']) {
    if (k === 'ring' && o[k] === undefined) continue;
    const r = c.obj(o[k], `${path}.${k}`);
    if (!r) continue;
    c.color(r['color'], `${path}.${k}.color`);
    c.num(r['inset'], `${path}.${k}.inset`, 0, 1);
    c.num(r['width'], `${path}.${k}.width`, 0, 1);
  }
}

/** Checks a parsed `theme.json`. Returns every problem found, not only the first. */
export function validateTheme(value: unknown): ValidationResult {
  const c = new Checker();
  const t = c.obj(value, 'theme');
  if (!t) return { ok: false, errors: c.errors };

  for (const k of Object.keys(t)) {
    if (!TOP_LEVEL_KEYS.includes(k)) c.fail(k, 'unknown key');
  }
  c.str(t['id'], 'id', /^[a-z0-9]+(-[a-z0-9]+)*$/);
  c.str(t['version'], 'version', /^\d+\.\d+\.\d+$/);
  c.text(t['name'], 'name');
  c.text(t['description'], 'description');
  c.oneOf(t['kind'], 'kind', ['image', 'vector']);
  const lic = c.obj(t['license'], 'license');
  if (lic) for (const k of ['art', 'sources', 'file']) c.str(lic[k], `license.${k}`);

  const palette = c.obj(t['palette'], 'palette') ?? {};
  for (const [k, v] of Object.entries(palette)) {
    if (!/^[a-z0-9]+([.-][a-zA-Z0-9]+)*$/.test(k)) c.fail(`palette.${k}`, 'bad token name');
    if (!isHexColor(v)) c.fail(`palette.${k}`, 'must be #RRGGBB');
  }
  for (const k of REQUIRED_TOKENS) {
    if (!(k in palette)) c.fail('palette', `needs the token "${k}"`);
  }
  c.palette = palette;

  const images = c.obj(t['images'], 'images') ?? {};
  for (const [k, v] of Object.entries(images)) {
    const p = `images.${k}`;
    const o = c.obj(v, p);
    if (!o) continue;
    c.str(o['file'], `${p}.file`, /^[a-z0-9-]+\.webp$/);
    const scales = c.arr(o['scales'], `${p}.scales`);
    if (scales) {
      if (scales.length === 0) c.fail(`${p}.scales`, 'must list at least one scale');
      scales.forEach((s, i) => {
        if (s !== 1 && s !== 2 && s !== 3) c.fail(`${p}.scales[${i}]`, 'must be 1, 2 or 3');
        if (i > 0 && (s as number) <= (scales[i - 1] as number)) {
          c.fail(`${p}.scales`, 'must be unique and in order');
        }
      });
    }
    c.num(o['width'], `${p}.width`, 1, 8192, true);
    c.num(o['height'], `${p}.height`, 1, 8192, true);
  }

  c.oneOf(t['defaultLayout'], 'defaultLayout', LAYOUT_IDS);
  const layouts = c.obj(t['layouts'], 'layouts');
  if (layouts) {
    for (const id of LAYOUT_IDS) checkLayout(c, layouts[id], `layouts.${id}`, images);
    for (const k of Object.keys(layouts)) {
      if (!LAYOUT_IDS.includes(k as LayoutId)) c.fail(`layouts.${k}`, 'unknown layout id');
    }
  }

  const points = c.obj(t['points'], 'points');
  if (points) {
    for (const tone of ['dark', 'light']) {
      const p = c.obj(points[tone], `points.${tone}`);
      if (!p) continue;
      c.text(p['name'], `points.${tone}.name`);
      c.color(p['fill'], `points.${tone}.fill`);
      const tex = c.str(p['texture'], `points.${tone}.texture`);
      if (tex !== null && !(tex in images))
        c.fail(`points.${tone}.texture`, `unknown image "${tex}"`);
    }
  }

  const checkers = c.obj(t['checkers'], 'checkers');
  if (checkers) {
    checkCheckerStyle(c, checkers['light'], 'checkers.light');
    checkCheckerStyle(c, checkers['dark'], 'checkers.dark');
    c.shadow(checkers['shadow'], 'checkers.shadow');
    const b = c.obj(checkers['badge'], 'checkers.badge');
    if (b) {
      for (const k of ['fill', 'text', 'border']) c.color(b[k], `checkers.badge.${k}`);
      for (const k of ['radius', 'borderWidth', 'fontSize'])
        c.num(b[k], `checkers.badge.${k}`, 0, 2);
    }
  }

  const hl = c.obj(t['highlights'], 'highlights');
  if (hl) {
    for (const k of ['select', 'target']) {
      const h = c.obj(hl[k], `highlights.${k}`);
      if (!h) continue;
      c.color(h['color'], `highlights.${k}.color`);
      c.num(h['radius'], `highlights.${k}.radius`, 0, 2);
      c.num(h['width'], `highlights.${k}.width`, 0, 1);
      c.stroke(h['halo'], `highlights.${k}.halo`);
    }
    const target = c.obj(hl['target'], 'highlights.target');
    if (target) {
      c.num(target['fillOpacity'], 'highlights.target.fillOpacity', 0, 1);
      const dash = c.arr(target['dash'], 'highlights.target.dash');
      if (dash && dash.length !== 2) c.fail('highlights.target.dash', 'must have 2 lengths');
      dash?.forEach((d, i) => c.num(d, `highlights.target.dash[${i}]`, 0));
    }
  }

  const dice = c.obj(t['dice'], 'dice');
  if (dice) {
    for (const k of ['face', 'side', 'edge', 'pip', 'acePip']) c.color(dice[k], `dice.${k}`);
    for (const k of ['cornerRadius', 'faceInset', 'edgeWidth', 'pipRadius', 'pipSpacing']) {
      c.num(dice[k], `dice.${k}`, 0, 0.5);
    }
    c.radial(dice['highlight'], 'dice.highlight');
    c.num(dice['highlightOpacity'], 'dice.highlightOpacity', 0, 1);
    c.shadow(dice['shadow'], 'dice.shadow');
  }

  const sounds = c.obj(t['sounds'], 'sounds');
  if (sounds) {
    for (const [k, v] of Object.entries(sounds)) {
      const p = `sounds.${k}`;
      if (!(SOUND_KEYS as readonly string[]).includes(k)) c.fail(p, 'unknown sound key');
      if (v === null) continue;
      if (Array.isArray(v)) {
        if (v.length === 0 || v.length > MAX_SOUND_TAKES) {
          c.fail(p, `must list 1 to ${MAX_SOUND_TAKES} files`);
        }
        v.forEach((f, i) => c.str(f, `${p}[${i}]`, SOUND_FILE_PATTERN));
        if (new Set(v).size !== v.length) c.fail(p, 'lists a file twice');
      } else {
        c.str(v, p, SOUND_FILE_PATTERN);
      }
    }
  }
  const haptics = c.obj(t['haptics'], 'haptics');
  if (haptics) {
    for (const [k, v] of Object.entries(haptics)) {
      if (!(HAPTIC_KEYS as readonly string[]).includes(k))
        c.fail(`haptics.${k}`, 'unknown haptic key');
      c.oneOf(v, `haptics.${k}`, HAPTIC_STYLES);
    }
  }

  const a11y = c.obj(t['accessibility'], 'accessibility');
  if (a11y) {
    c.num(a11y['checkerContrast'], 'accessibility.checkerContrast', 1, 21);
    (c.arr(a11y['colorBlindChecked'], 'accessibility.colorBlindChecked') ?? []).forEach((v, i) =>
      c.oneOf(v, `accessibility.colorBlindChecked[${i}]`, [
        'protanopia',
        'deuteranopia',
        'tritanopia',
      ]),
    );
  }

  return { ok: c.errors.length === 0, errors: c.errors };
}

/** Validates and returns the manifest typed, or throws a `ThemeValidationError`. */
export function assertTheme(value: unknown): ThemeManifest {
  const result = validateTheme(value);
  if (!result.ok) {
    const id = (value as { id?: unknown } | null)?.id;
    throw new ThemeValidationError(typeof id === 'string' ? id : '?', result.errors);
  }
  return value as ThemeManifest;
}
