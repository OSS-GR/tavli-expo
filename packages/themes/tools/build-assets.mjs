/* global console, process */
// Builds the images and the layout block of every theme.
//
//   pnpm --filter @tavli/themes build:assets            # all themes
//   pnpm --filter @tavli/themes build:assets -- <id>    # one theme
//
// For each theme in THEMES, `tools/<id>/design.mjs` describes the art. This
// script:
//   1. computes the board layouts (portrait-rotated and landscape) in points,
//   2. draws each image layer as SVG from the same geometry,
//   3. renders the layers with headless Chromium at @1x, @2x and @3x as WebP,
//   4. saves the point wood textures as WebP tiles,
//   5. writes `layouts` and `images` into theme.json. Other keys stay as they are.
// The output is the same on every run with the same Chromium version.
//
// Needs Playwright with Chromium on the machine (`require('playwright')`).

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { launch, renderPng, svgPage, toWebp } from './lib/render.mjs';

const THEMES = ['walnut-kafeneio', 'olive-inlay', 'kafeneio-night'];
const SCALES = [1, 2, 3];

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PKG, '..', '..');

const fileName = (base, scale) => (scale === 1 ? `${base}.webp` : `${base}@${scale}x.webp`);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

async function formatJson(file, text) {
  const req = createRequire(path.join(REPO, 'package.json'));
  const mod = await import(pathToFileURL(req.resolve('prettier')).href);
  const prettier = mod.default ?? mod;
  const options = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(text, { ...options, filepath: file });
}

async function buildTheme(browser, id) {
  const design = await import(`./${id}/design.mjs`);
  const { BUILD } = design;
  const themeDir = path.join(PKG, id);
  const texDir = path.join(PKG, 'tools', id, 'textures');
  const tex = {};
  for (const [name, file] of Object.entries(BUILD.textures)) {
    tex[name] =
      `data:image/jpeg;base64,${fs.readFileSync(path.join(texDir, file)).toString('base64')}`;
  }

  // Start clean, so no stale image stays behind.
  for (const f of fs.readdirSync(themeDir)) {
    if (f.endsWith('.webp')) fs.rmSync(path.join(themeDir, f));
  }

  const images = {};
  const layouts = {};
  const written = [];
  const save = (name, buf) => {
    fs.writeFileSync(path.join(themeDir, name), buf);
    written.push([name, buf.length]);
  };

  for (const g of design.geometries()) {
    layouts[g.id] = design.layoutBlock(g);
    for (const layer of BUILD.layers) {
      const base = `${layer.kind}-${g.orientation}`;
      const html = svgPage(layer.svg(g, tex));
      for (const s of SCALES) {
        const png = await renderPng(browser, html, g.width, g.height, s);
        save(fileName(base, s), await toWebp(browser, png, 'image/png', layer.quality));
      }
      images[`${layer.kind}${cap(g.orientation)}`] = {
        file: `${base}.webp`,
        scales: SCALES,
        width: g.width,
        height: g.height,
      };
    }
  }
  for (const t of BUILD.tiles) {
    const jpg = fs.readFileSync(path.join(texDir, t.src));
    for (const s of SCALES) {
      const px = t.size * s;
      save(
        fileName(t.file, s),
        await toWebp(browser, jpg, 'image/jpeg', BUILD.tileQuality, px, px),
      );
    }
    images[t.key] = { file: `${t.file}.webp`, scales: SCALES, width: t.size, height: t.size };
  }

  const manifestPath = path.join(themeDir, 'theme.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.images = images;
  manifest.layouts = layouts;
  fs.writeFileSync(manifestPath, await formatJson(manifestPath, JSON.stringify(manifest)));

  let total = 0;
  console.log(`\n${id}`);
  for (const [name, bytes] of written) {
    total += bytes;
    console.log(`  ${name.padEnd(28)} ${(bytes / 1024).toFixed(1).padStart(7)} KB`);
  }
  console.log(`  ${'total'.padEnd(28)} ${(total / 1024).toFixed(1).padStart(7)} KB`);
  console.log(`  wrote ${path.relative(REPO, manifestPath)}`);
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const ids = wanted.length ? wanted : THEMES;
  for (const id of ids) {
    if (!THEMES.includes(id)) throw new Error(`Unknown theme "${id}". Known: ${THEMES.join(', ')}`);
  }
  const browser = await launch();
  try {
    for (const id of ids) await buildTheme(browser, id);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
