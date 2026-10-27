/* global Buffer */
// Builds the Tavlaki app icon and splash images from SVG.
//
//   pnpm --filter @tavli/mobile build:icons                 # default concept
//   pnpm --filter @tavli/mobile build:icons -- --pick zari  # wire another concept
//
// Writes:
//   assets/icon/*.png          the icon and splash files that app.json uses
//   assets/icon-concepts/*.png small previews of every concept, for review
// The output is the same on every run with the same Chromium version.
//
// Needs Playwright with Chromium on the machine (`require('playwright')`).
// Textures and colors come from `@tavli/themes` (Walnut Kafeneio).

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONCEPTS, MOTIF_R, SIZE, background, defs, scaleAt } from './art.mjs';

/** The concept that app.json uses. Change it here or pass `--pick <id>`. */
const DEFAULT_PICK = 'pouli';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.resolve(TOOLS, '..');
const CONCEPT_DIR = path.resolve(ICON_DIR, '..', 'icon-concepts');
const REPO = path.resolve(ICON_DIR, '..', '..', '..', '..');
const THEME = path.join(REPO, 'packages', 'themes');

// Android adaptive icon: a 108 dp canvas. Masks show at least the middle
// 72 dp; the safe zone is a circle of 66 dp. The motif must fit in it.
const SAFE_R = (66 / 108 / 2) * SIZE; // 313 px
const K_ANDROID = SAFE_R / MOTIF_R;

// Splash: a round walnut medallion. Android 12+ shows the splash icon in a
// circle of 2/3 of the image, so the medallion stays inside that circle.
const SPLASH_R = 0.31 * SIZE;
const K_SPLASH = 0.66;
/** `imageWidth` of the splash image in app.json (pt / dp). */
const SPLASH_WIDTH = 240;

// ---------------------------------------------------------------------------
// Inputs

const palette = JSON.parse(
  fs.readFileSync(path.join(THEME, 'walnut-kafeneio', 'theme.json'), 'utf8'),
).palette;

const texture = (file) =>
  `data:image/jpeg;base64,${fs
    .readFileSync(path.join(THEME, 'tools', 'walnut-kafeneio', 'textures', file))
    .toString('base64')}`;

const TEX = {
  field: texture('field-walnut.jpg'),
  frame: texture('frame-worn-walnut.jpg'),
  bone: texture('point-bone.jpg'),
  ebony: texture('point-ebony.jpg'),
};

// ---------------------------------------------------------------------------
// SVG layers

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs>${defs(TEX, palette)}</defs>${inner}</svg>`;

const layers = (c) => ({
  /** iOS (and the generic `icon`): full bleed, opaque. */
  full: svg(background(c, palette) + c.motif(palette)),
  /** iOS dark appearance. */
  dark: svg(background(c, palette, { variant: 'dark' }) + c.motif(palette)),
  /** iOS tinted appearance: grayscale, the system adds the tint. */
  tinted: svg(`<rect width="${SIZE}" height="${SIZE}" fill="#000"/>${c.mono()}`),
  /** Android adaptive icon layers. */
  foreground: svg(`<g transform="${scaleAt(K_ANDROID)}">${c.motif(palette)}</g>`),
  background: svg(background(c, palette, { k: K_ANDROID })),
  monochrome: svg(`<g transform="${scaleAt(K_ANDROID)}">${c.mono()}</g>`),
  /** Splash: the medallion on a transparent square. */
  splash: svg(medallion(c, 'light')),
  splashDark: svg(medallion(c, 'dark')),
});

function medallion(c, variant) {
  const r = SPLASH_R;
  const half = SIZE / 2;
  return `
  <clipPath id="medal"><circle cx="${half}" cy="${half}" r="${r}"/></clipPath>
  <circle cx="${half + 8}" cy="${half + 16}" r="${r}" fill="#000" opacity="0.55" filter="url(#shadow-soft)"/>
  <g clip-path="url(#medal)">
    ${background(c, palette, { k: K_SPLASH, variant })}
    <g transform="${scaleAt(K_SPLASH)}">${c.motif(palette)}</g>
  </g>
  <circle cx="${half}" cy="${half}" r="${r - 9}" fill="none" stroke="#120A05" stroke-opacity="0.85" stroke-width="26"/>
  <circle cx="${half}" cy="${half}" r="${r - 9}" fill="none" stroke="url(#brass)" stroke-width="16"/>
  <circle cx="${half}" cy="${half}" r="${r - 13}" fill="none" stroke="#FFF" stroke-opacity="0.3" stroke-width="3"/>`;
}

// ---------------------------------------------------------------------------
// Rendering (headless Chromium)

async function launch() {
  const require = createRequire(import.meta.url);
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Install it with Chromium (npx playwright install chromium) and try again.',
    );
  }
  return playwright.chromium.launch();
}

const page = (body, bg = 'transparent') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${bg}}svg,img{display:block}</style></head><body>${body}</body></html>`;

/** Renders HTML at width x height and returns a PNG. */
async function shoot(browser, html, width, height, transparent) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: 'load' });
    await p.waitForTimeout(100);
    return await p.screenshot({ omitBackground: transparent, type: 'png' });
  } finally {
    await ctx.close();
  }
}

/** Resizes a PNG with high quality smoothing. */
async function resize(browser, png, size) {
  const ctx = await browser.newContext();
  try {
    const p = await ctx.newPage();
    const out = await p.evaluate(
      async ({ src, size }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        // Halve in steps for a clean downscale.
        let cur = img;
        let w = img.naturalWidth;
        while (w / 2 >= size) {
          w = Math.round(w / 2);
          const c = document.createElement('canvas');
          c.width = w;
          c.height = w;
          const g = c.getContext('2d');
          g.imageSmoothingQuality = 'high';
          g.drawImage(cur, 0, 0, w, w);
          cur = c;
        }
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(cur, 0, 0, size, size);
        return c.toDataURL('image/png');
      },
      { src: `data:image/png;base64,${png.toString('base64')}`, size },
    );
    return Buffer.from(out.split(',')[1], 'base64');
  } finally {
    await ctx.close();
  }
}

const renderSvg = (browser, s, transparent) => shoot(browser, page(s), SIZE, SIZE, transparent);
const uri = (png) => `data:image/png;base64,${png.toString('base64')}`;

/** A review sheet: the concept at real sizes, in the masks and as a themed icon. */
function sheet(c, r) {
  const ios = uri(r.full);
  const fg = uri(r.foreground);
  const bg = uri(r.background);
  const mono = uri(r.monochrome);
  const adaptive = (size, radius, themed) => {
    // The 108 dp layers, cropped to the 72 dp visible area.
    const full = size * 1.5;
    const off = -size * 0.25;
    const layer = (src) =>
      `<img src="${src}" style="position:absolute;left:${off}px;top:${off}px;width:${full}px;height:${full}px">`;
    const inner = themed
      ? `<div style="position:absolute;inset:0;background:#D8E2F0"></div><div style="position:absolute;left:${off}px;top:${off}px;width:${full}px;height:${full}px;background:#1D3557;-webkit-mask:url(${mono}) center/contain no-repeat"></div>`
      : layer(bg) + layer(fg);
    return `<div style="position:relative;width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden;flex:none">${inner}</div>`;
  };
  const iosIcon = (size, src = ios) =>
    `<img src="${src}" style="width:${size}px;height:${size}px;border-radius:${size * 0.225}px;flex:none">`;
  const label = (t) =>
    `<div style="font:13px system-ui,sans-serif;color:#EADCC0;margin-top:8px">${t}</div>`;
  const cell = (inner, t) =>
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end">${inner}${label(t)}</div>`;
  // A 393 x 852 pt phone at 0.28 scale, with the splash image at SPLASH_WIDTH pt.
  const phone = (bgColor, src) =>
    `<div style="width:110px;height:238px;border-radius:16px;background:${bgColor};display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #6A4E35"><img src="${src}" style="width:${Math.round(SPLASH_WIDTH * 0.28)}px"></div>`;
  const body = `
  <div style="width:1460px;height:300px;padding:24px 28px;box-sizing:border-box;display:flex;gap:30px;align-items:flex-end;background:linear-gradient(135deg,#4F5D6E,#2B3440)">
    ${cell(iosIcon(180), 'iOS 180')}
    ${cell(adaptive(180, '50%'), 'Android circle')}
    ${cell(adaptive(180, '28%'), 'Android squircle')}
    ${cell(`<div style="display:flex;gap:14px;align-items:flex-end">${iosIcon(60)}${adaptive(60, '50%')}${iosIcon(40)}${adaptive(29, '50%')}</div>`, '60 / 40 / 29 px')}
    ${cell(`<div style="display:flex;gap:14px;align-items:flex-end">${adaptive(120, '50%', true)}${iosIcon(60, uri(r.dark))}${iosIcon(60, uri(r.tinted))}</div>`, 'Android themed / iOS dark, tinted')}
    ${cell(`<div style="display:flex;gap:10px">${phone(palette['ui.bg'], uri(r.splash))}${phone(palette['ui.bg.outer'], uri(r.splashDark))}</div>`, 'Splash light / dark')}
  </div>`;
  return page(body, '#2B3440');
}

// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  // Accept both `--pick zari` and `--pick=zari`.
  const pickIndex = args.indexOf('--pick');
  const pickArg = args.find((a) => a.startsWith('--pick='));
  const pick = pickArg
    ? pickArg.slice('--pick='.length)
    : pickIndex >= 0
      ? args[pickIndex + 1]
      : DEFAULT_PICK;
  if (!Object.hasOwn(CONCEPTS, pick)) {
    throw new Error(`Unknown concept "${pick}". Use one of: ${Object.keys(CONCEPTS).join(', ')}`);
  }
  fs.mkdirSync(CONCEPT_DIR, { recursive: true });

  const browser = await launch();
  try {
    for (const c of Object.values(CONCEPTS)) {
      const L = layers(c);
      const r = {};
      for (const [name, s] of Object.entries(L)) {
        const opaque = ['full', 'dark', 'tinted', 'background'].includes(name);
        r[name] = await renderSvg(browser, s, !opaque);
      }

      // Review files: a 256 px icon and a sheet.
      fs.writeFileSync(path.join(CONCEPT_DIR, `${c.id}.png`), await resize(browser, r.full, 256));
      fs.writeFileSync(
        path.join(CONCEPT_DIR, `${c.id}-sheet.png`),
        await shoot(browser, sheet(c, r), 1460, 300, false),
      );
      console.log(`concept ${c.id}: icon-concepts/${c.id}.png, ${c.id}-sheet.png`);

      if (c.id !== pick) continue;
      const out = {
        'icon.png': r.full,
        'icon-ios-dark.png': r.dark,
        'icon-ios-tinted.png': r.tinted,
        'android-foreground.png': r.foreground,
        'android-background.png': r.background,
        'android-monochrome.png': r.monochrome,
        'splash.png': r.splash,
        'splash-dark.png': r.splashDark,
      };
      for (const [file, png] of Object.entries(out)) {
        fs.writeFileSync(path.join(ICON_DIR, file), png);
        console.log(`icon/${file}  ${SIZE} x ${SIZE}  ${Math.round(png.length / 1024)} KB`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
