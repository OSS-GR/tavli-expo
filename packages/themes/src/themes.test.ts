// Checks every bundled theme: manifest, layouts, files on disk and contrast.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { imageFileNames, imageFileName } from './assets';
import { contrastRatio } from './color';
import {
  diceCenters,
  getPoint,
  rectInsideUnit,
  rectsOverlap,
  stackCenters,
  trayRects,
} from './geometry';
import { DEFAULT_THEME_ID, getTheme, listThemeIds } from './registry';
import type { BoardLayout, LayoutId, Rect, ThemeManifest, Vec } from './types';
import { LAYOUT_IDS, validateTheme } from './validate';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_THEME_BYTES = 2 * 1024 * 1024;
const EPS = 1e-6;

/** Width and height of a WebP file, read from its header. */
function webpSize(buf: Buffer): { width: number; height: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - EPS &&
  inner.y >= outer.y - EPS &&
  inner.x + inner.w <= outer.x + outer.w + EPS &&
  inner.y + inner.h <= outer.y + outer.h + EPS;

/** Distance between two normalized points, in width units. */
const dist = (layout: BoardLayout, a: Vec, b: Vec): number =>
  Math.hypot(a.x - b.x, (a.y - b.y) / layout.aspectRatio);

/** The checker colors that can separate a checker from what is under it. */
const outlineColors = (theme: ThemeManifest, side: 'light' | 'dark'): string[] => {
  const s = theme.checkers[side];
  return [s.fill, s.rim.color, ...(s.ring ? [s.ring.color] : [])];
};

describe('theme registry', () => {
  it('lists the bundled themes and has a valid default', () => {
    expect(listThemeIds()).toContain('walnut-kafeneio');
    expect(listThemeIds()).toContain(DEFAULT_THEME_ID);
  });

  it('throws for an unknown theme', () => {
    expect(() => getTheme('no-such-theme')).toThrow(/Unknown theme/);
  });

  it('caches themes', () => {
    expect(getTheme(DEFAULT_THEME_ID)).toBe(getTheme(DEFAULT_THEME_ID));
  });
});

for (const id of listThemeIds()) {
  const dir = path.join(PKG, id);
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'));
  const theme = getTheme(id);

  describe(`theme ${id}: manifest`, () => {
    it('passes validation', () => {
      expect(validateTheme(raw).errors).toEqual([]);
    });

    it('has its folder name as id', () => {
      expect(theme.id).toBe(id);
    });

    it('resolves every palette token', () => {
      expect(JSON.stringify(theme)).not.toMatch(/"\{[^"]*\}"/);
    });

    it('names a license file that exists', () => {
      expect(fs.existsSync(path.join(PKG, theme.license.file))).toBe(true);
    });
  });

  describe(`theme ${id}: files`, () => {
    it('has every image file on disk, at the declared size', () => {
      for (const [key, asset] of Object.entries(theme.images)) {
        for (const s of asset.scales) {
          const file = path.join(dir, imageFileName(asset, s));
          expect(fs.existsSync(file), `${key} @${s}x: ${file}`).toBe(true);
          const size = webpSize(fs.readFileSync(file));
          expect(size, `${key} @${s}x`).toEqual({
            width: asset.width * s,
            height: asset.height * s,
          });
        }
      }
    });

    it('has no files that the manifest does not use', () => {
      const used = new Set(['theme.json']);
      for (const asset of Object.values(theme.images)) {
        for (const f of imageFileNames(asset)) used.add(f);
      }
      expect(fs.readdirSync(dir).filter((f) => !used.has(f))).toEqual([]);
    });

    it(`stays under ${MAX_THEME_BYTES / 1024 / 1024} MB`, () => {
      const total = fs
        .readdirSync(dir)
        .reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
      expect(total).toBeLessThan(MAX_THEME_BYTES);
    });

    it('uses every image it lists', () => {
      const used = new Set<string>([theme.points.dark.texture, theme.points.light.texture]);
      for (const l of Object.values(theme.layouts))
        for (const layer of l.layers) used.add(layer.image);
      expect(Object.keys(theme.images).filter((k) => !used.has(k))).toEqual([]);
    });
  });

  describe(`theme ${id}: contrast`, () => {
    const p = theme.palette;

    it('checker colors differ by at least 7:1', () => {
      const ratio = contrastRatio(theme.checkers.light.fill, theme.checkers.dark.fill);
      expect(ratio).toBeGreaterThanOrEqual(7);
      expect(theme.accessibility.checkerContrast).toBeCloseTo(ratio, 2);
    });

    for (const side of ['light', 'dark'] as const) {
      for (const tone of ['light', 'dark'] as const) {
        it(`${side} checker vs ${tone} point is at least 3:1 (fill or outline)`, () => {
          const point = theme.points[tone].fill;
          const best = Math.max(...outlineColors(theme, side).map((c) => contrastRatio(c, point)));
          expect(best).toBeGreaterThanOrEqual(3);
        });
      }

      it(`${side} checker fill vs the field is at least 3:1`, () => {
        expect(
          contrastRatio(theme.checkers[side].fill, p['board.field'] as string),
        ).toBeGreaterThanOrEqual(3);
      });
    }

    it('highlights stand out from their halo by at least 3:1', () => {
      const { select, target } = theme.highlights;
      expect(contrastRatio(select.color, select.halo.color)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(target.color, target.halo.color)).toBeGreaterThanOrEqual(3);
    });

    it('dice pips stand out from the face by at least 3:1', () => {
      expect(contrastRatio(theme.dice.pip, theme.dice.face)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.dice.acePip, theme.dice.face)).toBeGreaterThanOrEqual(3);
    });
  });

  for (const layoutId of LAYOUT_IDS) {
    const layout = theme.layouts[layoutId];
    describe(`theme ${id}: layout ${layoutId}`, () => {
      const rects: [string, Rect][] = [
        ...layout.fields.map((r, i): [string, Rect] => [`field ${i}`, r]),
        ...layout.points.map((pt): [string, Rect] => [`point ${pt.index}`, pt.rect]),
        ['bar', layout.bar.rect],
        ['bar.player', layout.bar.player.rect],
        ['bar.opponent', layout.bar.opponent.rect],
        ['trays.player', layout.trays.player.rect],
        ['trays.opponent', layout.trays.opponent.rect],
        ['diceArea', layout.diceArea],
      ];

      it('keeps every rect inside 0..1', () => {
        for (const [name, r] of rects) expect(rectInsideUnit(r), name).toBe(true);
      });

      it('has points 1 to 24, once each', () => {
        expect(layout.points.map((pt) => pt.index).sort((a, b) => a - b)).toEqual(
          Array.from({ length: 24 }, (_, i) => i + 1),
        );
      });

      it('has no overlapping points', () => {
        for (const a of layout.points) {
          for (const b of layout.points) {
            if (a.index < b.index) {
              expect(rectsOverlap(a.rect, b.rect, EPS), `${a.index} / ${b.index}`).toBe(false);
            }
          }
        }
      });

      it('puts every point inside a field, and nothing else on a point', () => {
        for (const pt of layout.points) {
          expect(
            layout.fields.some((f) => inside(pt.rect, f)),
            `point ${pt.index}`,
          ).toBe(true);
          for (const [name, r] of rects.filter(
            ([n]) => n.startsWith('tray') || n.startsWith('bar'),
          )) {
            expect(rectsOverlap(pt.rect, r, EPS), `point ${pt.index} / ${name}`).toBe(false);
          }
        }
      });

      it('keeps the bar halves on the bar and the dice on a field', () => {
        expect(inside(layout.bar.player.rect, layout.bar.rect)).toBe(true);
        expect(inside(layout.bar.opponent.rect, layout.bar.rect)).toBe(true);
        expect(layout.fields.some((f) => inside(layout.diceArea, f))).toBe(true);
        for (const c of [...diceCenters(layout, 2), ...diceCenters(layout, 4)]) {
          expect(c.x > layout.diceArea.x && c.x < layout.diceArea.x + layout.diceArea.w).toBe(true);
          expect(c.y > layout.diceArea.y && c.y < layout.diceArea.y + layout.diceArea.h).toBe(true);
        }
      });

      it('gives facing points different woods', () => {
        for (let n = 1; n <= 12; n++) {
          expect(getPoint(layout, n).tone).not.toBe(getPoint(layout, 25 - n).tone);
        }
      });

      it('fits a checker across a point', () => {
        for (const pt of layout.points) {
          const breadth =
            pt.base === 'left' || pt.base === 'right' ? pt.rect.h / layout.aspectRatio : pt.rect.w;
          expect(2 * layout.checker.radius).toBeLessThanOrEqual(breadth + EPS);
        }
      });

      it('keeps every stack inside its point, with a count badge above 5', () => {
        expect(layout.checker.maxVisible).toBe(5);
        for (const pt of layout.points) {
          for (let n = 1; n <= 15; n++) {
            const s = stackCenters(layout, pt, n);
            expect(s.centers.length).toBe(Math.min(n, 5));
            expect(s.badge).toBe(n > 5 ? n : null);
            const r = layout.checker.radius;
            for (const c of s.centers) {
              const box = {
                x: c.x - r,
                y: c.y - r * layout.aspectRatio,
                w: 2 * r,
                h: 2 * r * layout.aspectRatio,
              };
              const along =
                pt.base === 'left' || pt.base === 'right'
                  ? box.x >= pt.rect.x - EPS && box.x + box.w <= pt.rect.x + pt.rect.w + EPS
                  : box.y >= pt.rect.y - EPS && box.y + box.h <= pt.rect.y + pt.rect.h + EPS;
              expect(along, `point ${pt.index}, ${n} checkers`).toBe(true);
            }
          }
        }
      });

      it('keeps full stacks on facing points apart', () => {
        for (let n = 1; n <= 12; n++) {
          const a = stackCenters(layout, getPoint(layout, n), 5).centers.at(-1);
          const b = stackCenters(layout, getPoint(layout, 25 - n), 5).centers.at(-1);
          expect(a && b && dist(layout, a, b) >= 2 * layout.checker.radius).toBe(true);
        }
      });

      it('fits 15 borne-off checkers in each tray', () => {
        for (const side of ['player', 'opponent'] as const) {
          const slot = layout.trays[side];
          const slices = trayRects(layout, slot, 15);
          expect(slices).toHaveLength(15);
          for (const r of slices) expect(inside(r, slot.rect), side).toBe(true);
        }
      });
    });
  }

  describe(`theme ${id}: orientation`, () => {
    const home = (l: LayoutId) => [1, 2, 3, 4, 5, 6].map((n) => getPoint(theme.layouts[l], n).rect);

    it('portrait-rotated: your home and tray are at the bottom-left', () => {
      const l = theme.layouts['portrait-rotated'];
      expect(l.orientation).toBe('portrait');
      expect(l.aspectRatio).toBeLessThan(1);
      for (const r of home('portrait-rotated')) {
        expect(r.x + r.w).toBeLessThanOrEqual(0.5 + EPS);
        expect(r.y).toBeGreaterThan(l.bar.rect.y);
        expect(l.trays.player.rect.y).toBeGreaterThanOrEqual(r.y + r.h - EPS);
      }
      expect(l.trays.player.rect.x).toBeLessThan(l.trays.opponent.rect.x);
      // Point 1 is the lowest point of your home; 12 and 13 sit at the top.
      expect(getPoint(l, 1).rect.y).toBeGreaterThan(getPoint(l, 6).rect.y);
      expect(getPoint(l, 12).rect.y).toBeLessThan(getPoint(l, 7).rect.y);
      expect(getPoint(l, 13).rect.y).toBe(getPoint(l, 12).rect.y);
    });

    it('landscape: your home is bottom-right, trays on the right edge', () => {
      const l = theme.layouts.landscape;
      expect(l.orientation).toBe('landscape');
      expect(l.aspectRatio).toBeGreaterThan(1);
      for (const r of home('landscape')) {
        expect(r.x).toBeGreaterThan(l.bar.rect.x);
        expect(r.y).toBeGreaterThanOrEqual(0.5 - EPS);
        expect(l.trays.player.rect.x).toBeGreaterThanOrEqual(r.x + r.w - EPS);
      }
      expect(l.trays.player.rect.y).toBeGreaterThan(l.trays.opponent.rect.y);
      expect(getPoint(l, 1).rect.x).toBeGreaterThan(getPoint(l, 6).rect.x);
    });
  });
}
