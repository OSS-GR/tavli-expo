// Plays the web build in a real browser (Chromium) and fails on a problem
// (#677). CI runs it after `web:export`:
//
//   node tools/web-smoke.mjs [folder of the export, default web-dist]
//
// It checks, on the welcome flow, Home, a game vs the bot and the main
// routes:
// - no page error and no console error;
// - no screen has more than MAX_CANVASES Skia canvases, and the browser
//   never drops a WebGL context (it keeps about 16; each canvas is one);
// - sounds use one AudioContext and no <audio> element (#675);
// - a roll and a move work on the board.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

/** A browser keeps about 16 WebGL contexts. Stay well under it. */
const MAX_CANVASES = 12;
const ROUTES = [
  '/new-game',
  '/settings',
  '/settings/board',
  '/rules',
  '/rules/portes',
  '/history',
  '/whats-new',
  '/account',
  '/support',
  '/tutorial',
];
const TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.m4a': 'audio/mp4',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
};

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(app, process.argv[2] ?? 'web-dist');
if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`No web export in ${root}. Run "pnpm web:export" first.`);
  process.exit(1);
}

// A static server that answers an unknown path with the app page, as the site does.
const server = createServer((req, res) => {
  let file = path.join(root, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = path.join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 808 } });
  page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 300)}`));
  page.on('console', (m) => {
    const text = m.text();
    if (text.includes('Too many active WebGL contexts')) {
      problems.push('the browser dropped a WebGL context (too many canvases)');
    } else if (m.type() === 'error') {
      problems.push(`console error: ${text.slice(0, 300)}`);
    }
  });
  // Count what the page does with audio.
  await page.addInitScript(() => {
    const seen = { contexts: 0, starts: 0, audioElements: 0 };
    window.__smoke = seen;
    const Context = window.AudioContext;
    window.AudioContext = function (options) {
      seen.contexts += 1;
      return new Context(options);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      seen.starts += 1;
      return start.apply(this, args);
    };
    const create = document.createElement.bind(document);
    document.createElement = (tag, ...rest) => {
      if (String(tag).toLowerCase() === 'audio') seen.audioElements += 1;
      return create(tag, ...rest);
    };
    const Audio = window.Audio;
    window.Audio = function (...args) {
      seen.audioElements += 1;
      return new Audio(...args);
    };
  });

  const byId = (id) => page.locator(`[data-testid="${id}"]`).first();
  const tap = async (id, wait = 15000) => {
    await byId(id).waitFor({ timeout: wait });
    await byId(id).click();
  };
  const canvases = async (screen) => {
    const n = await page.evaluate(
      () => [...document.querySelectorAll('canvas')].filter((c) => c.width > 0).length,
    );
    console.log(`${String(n).padStart(3)} canvases  ${screen}`);
    if (n > MAX_CANVASES) problems.push(`${screen}: ${n} canvases (at most ${MAX_CANVASES})`);
  };

  // The welcome flow.
  await page.goto(base);
  await tap('welcome-language-continue', 60000);
  await tap('welcome-consent-deny');
  await byId('welcome-board-continue').waitFor();
  await page.waitForTimeout(800);
  await canvases('welcome: board');
  await tap('welcome-board-continue');
  await tap('tour-not-now');
  await byId('home-vs-bot').waitFor();
  await page.waitForTimeout(800);
  await canvases('home');

  // A game vs the bot: the opening roll, then rolls and moves until you moved once.
  await tap('home-vs-bot');
  await tap('new-game-start');
  await byId('game-board').waitFor({ timeout: 20000 });
  let moved = false;
  for (let step = 0; step < 14 && !moved; step += 1) {
    if (
      await byId('roll-button')
        .isVisible()
        .catch(() => false)
    ) {
      await byId('roll-button')
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(3200);
      continue;
    }
    const move = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-testid^="move-list-"]')]
          .map((e) => e.getAttribute('data-testid'))
          .find((id) => id.includes('>')) ?? null,
    );
    if (move) {
      await byId(move).click();
      moved = true;
      await page.waitForTimeout(1200);
      continue;
    }
    await page.waitForTimeout(2000);
  }
  if (!moved) problems.push('the game: no move was played in 14 steps');
  await canvases('game');
  const audio = await page.evaluate(() => window.__smoke);
  console.log(`audio: ${JSON.stringify(audio)}`);
  if (audio.audioElements > 0) problems.push(`sound made ${audio.audioElements} <audio> elements`);
  if (audio.contexts !== 1) problems.push(`sound made ${audio.contexts} AudioContexts (want 1)`);
  if (audio.starts === 0) problems.push('no sound started after a roll and a move');

  for (const route of ROUTES) {
    await page.goto(base + route);
    await page.waitForTimeout(1500);
    await canvases(route);
  }
} catch (e) {
  problems.push(`the walk stopped: ${String(e).slice(0, 400)}`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.error(`- ${p}`);
  process.exit(1);
}
console.log('\nThe web build works in Chromium.');
