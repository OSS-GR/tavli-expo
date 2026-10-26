/* global document, Image, Buffer */
// Headless Chromium helpers (Playwright). Chromium draws the SVG art and
// encodes WebP, so the tools need no native image library.
//
// Playwright with Chromium must be installed on the machine (it is not a
// dependency of this package): `require('playwright')` must work.

import { createRequire } from 'node:module';

const requireFromHere = createRequire(import.meta.url);

export async function launch() {
  let playwright;
  try {
    playwright = requireFromHere('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Install it with Chromium (npx playwright install chromium) and try again.',
    );
  }
  return playwright.chromium.launch();
}

/**
 * Draws `html` in a page of `width` x `height` CSS px at `scale` and returns
 * a PNG. With `transparent`, the page background stays transparent.
 */
export async function renderPng(browser, html, width, height, scale, transparent = true) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    return await page.screenshot({ omitBackground: transparent, type: 'png' });
  } finally {
    await ctx.close();
  }
}

/** An SVG string as a page body with no margins. */
export const svgPage = (svg) =>
  `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`;

let encoderPage = null;

async function encoder(browser) {
  if (!encoderPage) {
    const ctx = await browser.newContext();
    encoderPage = await ctx.newPage();
    await encoderPage.setContent('<!doctype html><html><body></body></html>');
  }
  return encoderPage;
}

export function closeEncoder() {
  encoderPage = null;
}

/**
 * Re-encodes an image buffer as WebP. With `width`/`height`, it is resized
 * first (high quality smoothing). `quality` is 0..1.
 */
export async function toWebp(browser, buffer, mime, quality, width, height) {
  const page = await encoder(browser);
  const src = `data:${mime};base64,${buffer.toString('base64')}`;
  const out = await page.evaluate(
    async ({ src, quality, width, height }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = width ?? img.naturalWidth;
      c.height = height ?? img.naturalHeight;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', quality);
    },
    { src, quality, width, height },
  );
  if (!out.startsWith('data:image/webp;base64,')) {
    throw new Error('This Chromium cannot encode WebP');
  }
  return Buffer.from(out.slice('data:image/webp;base64,'.length), 'base64');
}
