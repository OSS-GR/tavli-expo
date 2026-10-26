/* global console, process */
// Renders preview PNGs of a theme from its manifest:
//
//   pnpm --filter @tavli/themes preview            # writes preview/*.png
//   pnpm --filter @tavli/themes preview -- --debug # writes *-debug.png with every layout rect outlined
//
// Nothing is placed by hand. Point, bar, tray and dice positions come from
// the layout in theme.json, through the same functions the app uses
// (`src/geometry.ts`). If the picture looks right, the manifest is right.
//
// Needs Node 22.18+ (it imports the TypeScript source directly) and
// Playwright with Chromium (`require('playwright')`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { imageFileName, pickScale } from '../src/assets.ts';
import { resolvePalette } from '../src/color.ts';
import { diceCenters, getPoint, pointTriangle, stackCenters, trayRects } from '../src/geometry.ts';
import { drawScene } from './lib/canvas-renderer.mjs';
import { launch } from './lib/render.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(PKG, 'preview');
const DEBUG = process.argv.includes('--debug');
const MARGIN = 8;

// Positions use the bottom player's numbering. light = bottom player ("player").
const PORTES_START = {
  points: [
    [24, 'light', 2],
    [13, 'light', 5],
    [8, 'light', 3],
    [6, 'light', 5],
    [1, 'dark', 2],
    [12, 'dark', 5],
    [17, 'dark', 3],
    [19, 'dark', 5],
  ],
  bar: { player: 0, opponent: 0 },
  off: { player: 0, opponent: 0 },
};

// A later position that uses the bar, a tray and the count badge.
const MIDGAME = {
  points: [
    [6, 'light', 7],
    [8, 'light', 3],
    [13, 'light', 2],
    [2, 'light', 2],
    [19, 'dark', 3],
    [20, 'dark', 2],
    [21, 'dark', 2],
    [22, 'dark', 2],
    [23, 'dark', 1],
    [24, 'dark', 1],
  ],
  bar: { player: 1, opponent: 0 },
  off: { player: 0, opponent: 4 },
};

const SCENES = [
  {
    suffix: '',
    layout: 'portrait-rotated',
    dpr: 2,
    position: PORTES_START,
    dice: [5, 3],
    // You tapped the top checker on 13; with 5-3 it can go to 8 or 10.
    select: 13,
    targets: [10, 8],
  },
  {
    suffix: '-midgame',
    layout: 'portrait-rotated',
    dpr: 1,
    position: MIDGAME,
    dice: [6, 4],
  },
  {
    suffix: '-landscape',
    layout: 'landscape',
    dpr: 1,
    position: PORTES_START,
    dice: [5, 3],
  },
];

function buildScene(theme, dir, spec) {
  const layout = theme.layouts[spec.layout];
  const pos = spec.position;
  const checkers = [];
  const counts = new Map(pos.points.map(([p, , n]) => [p, n]));
  for (const [p, color, n] of pos.points) {
    const stack = stackCenters(layout, getPoint(layout, p), n);
    stack.centers.forEach((c, k) => {
      const last = k === stack.centers.length - 1;
      checkers.push({ ...c, color, badge: last ? stack.badge : null });
    });
  }
  for (const side of ['player', 'opponent']) {
    const color = side === 'player' ? 'light' : 'dark';
    const stack = stackCenters(layout, layout.bar[side], pos.bar[side]);
    for (const c of stack.centers) checkers.push({ ...c, color, badge: null });
  }
  const trays = [];
  for (const side of ['player', 'opponent']) {
    const color = side === 'player' ? 'light' : 'dark';
    for (const r of trayRects(layout, layout.trays[side], pos.off[side]))
      trays.push({ rect: r, color });
  }
  const highlights = [];
  if (spec.select) {
    const stack = stackCenters(layout, getPoint(layout, spec.select), counts.get(spec.select));
    highlights.push({ kind: 'select', ...stack.centers[stack.centers.length - 1] });
  }
  for (const t of spec.targets ?? []) {
    const n = (counts.get(t) ?? 0) + 1;
    const stack = stackCenters(layout, getPoint(layout, t), n);
    highlights.push({ kind: 'target', ...stack.centers[stack.centers.length - 1] });
  }
  const dice = diceCenters(layout, 2).map((c, i) => ({ ...c, value: spec.dice[i] }));
  const points = layout.points.map((p) => ({ tone: p.tone, triangle: pointTriangle(layout, p) }));

  // Images at the preview's pixel ratio (as the app would pick them), as data URLs.
  const images = {};
  const keys = [
    ...layout.layers.map((l) => l.image),
    theme.points.dark.texture,
    theme.points.light.texture,
  ];
  for (const key of keys) {
    const a = theme.images[key];
    const file = imageFileName(a, pickScale(a, spec.dpr));
    images[key] =
      `data:image/webp;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
  }
  return {
    theme,
    layout,
    images,
    dpr: spec.dpr,
    margin: MARGIN,
    debug: DEBUG,
    checkers,
    trays,
    highlights,
    dice,
    points,
  };
}

/** Every theme folder: a folder with a theme.json in it. */
function themeIds() {
  return fs
    .readdirSync(PKG, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PKG, d.name, 'theme.json')))
    .map((d) => d.name);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launch();
  try {
    for (const id of themeIds()) {
      const dir = path.join(PKG, id);
      const theme = resolvePalette(
        JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')),
      );
      for (const spec of SCENES) {
        const scene = buildScene(theme, dir, spec);
        const { width, height } = scene.layout.referenceSize;
        const ctx = await browser.newContext({
          viewport: { width: width + 2 * MARGIN, height: height + 2 * MARGIN },
          deviceScaleFactor: spec.dpr,
        });
        const page = await ctx.newPage();
        await page.setContent(
          '<!doctype html><html><head><style>html,body{margin:0}canvas{display:block}</style></head><body></body></html>',
        );
        await page.evaluate(drawScene, scene);
        const file = path.join(OUT, `${id}${spec.suffix}${DEBUG ? '-debug' : ''}.png`);
        await page.locator('canvas').screenshot({ path: file });
        await ctx.close();
        console.log(
          `wrote ${path.relative(PKG, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
