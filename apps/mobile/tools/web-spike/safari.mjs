// SPIKE (#640): plays the web spike in real Safari through safaridriver and
// prints the frame meter's numbers. Run on a Mac (the "Safari check"
// workflow does). No packages: it speaks the WebDriver protocol with fetch.
//
//   node safari.mjs [url] [variants, comma separated]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://tavlaki-play-dev.orestisstefanis.workers.dev').replace(
  /\/$/,
  '',
);
const VARIANTS = (process.argv[3] || 'fx=off,fx=noblur,fx=flat').split(',');
const OUT = process.env.OUT_DIR || '.';
const PORT = 4567;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const driver = spawn('safaridriver', ['-p', String(PORT)], { stdio: 'inherit' });
await sleep(1500);

async function wd(method, path, body) {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (json.value && json.value.error)
    throw new Error(`${path}: ${json.value.error}: ${json.value.message}`);
  return json.value;
}

async function play(variant) {
  const session = await wd('POST', '/session', {
    capabilities: { alwaysMatch: { browserName: 'safari' } },
  });
  const s = `/session/${session.sessionId}`;
  const js = (script, ...args) => wd('POST', `${s}/execute/sync`, { script, args });
  const has = (tid) =>
    js(
      'const e=document.querySelector(`[data-testid="${arguments[0]}"]`);return !!e&&e.getClientRects().length>0',
      tid,
    );
  const click = async (tid, wait = 4000) => {
    const end = Date.now() + wait;
    while (Date.now() < end && !(await has(tid))) await sleep(150);
    const found = await wd('POST', `${s}/elements`, {
      using: 'css selector',
      value: `[data-testid="${tid}"]`,
    });
    if (found.length === 0) return false;
    const id = Object.values(found[0])[0];
    try {
      await wd('POST', `${s}/element/${id}/click`, {});
      return true;
    } catch (e) {
      console.log(`  click ${tid} failed: ${String(e).slice(0, 120)}`);
      return false;
    }
  };
  const text = () => js('return document.body.innerText.replace(/\\n+/g," | ")');
  const shot = async (name) =>
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(await wd('GET', `${s}/screenshot`), 'base64'));
  try {
    await wd('POST', `${s}/window/rect`, { width: 1280, height: 860, x: 0, y: 0 }).catch(() => {});
    await wd('POST', `${s}/url`, { url: `${BASE}/?hud=1&${variant}` });
    if (!(await click('welcome-language-continue', 30000)))
      throw new Error('the app did not start');
    await click('welcome-consent-deny');
    await sleep(800);
    await click('welcome-board-continue');
    await sleep(1800);
    await click('tour-not-now');
    await sleep(800);
    await click('home-vs-bot');
    await click('new-game-start');
    await sleep(3000);
    console.log(
      `  ${await js(`const c=document.createElement('canvas');const g=c.getContext('webgl2');const x=g&&g.getExtension('WEBGL_debug_renderer_info');return (g&&x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):'no webgl info')+' | dpr '+devicePixelRatio+' | '+innerWidth+'x'+innerHeight`)}`,
    );
    await js('window.__spikeReset && window.__spikeReset()');
    let rolls = 0;
    let moves = 0;
    for (let i = 0; i < 30 && moves < 8; i++) {
      if (await has('roll-button')) {
        if (await click('roll-button', 500)) rolls += 1;
        await sleep(3200);
        continue;
      }
      const n = await js('return document.querySelectorAll(`[data-testid^="move-list-"]`).length');
      if (n > 2) {
        // Index 0 is the list, 1 is Hint: play the first real move.
        const tid = await js(
          'const b=[...document.querySelectorAll(`[data-testid^="move-list-"]`)].map(e=>e.getAttribute("data-testid")).filter(t=>t.includes(">"));return b[0]||null',
        );
        if (tid && (await click(tid, 500))) moves += 1;
        await sleep(1100);
        continue;
      }
      if (await has('confirm-button')) {
        await js('const e=document.querySelector(`[data-testid="confirm-button"]`);if(e)e.click()');
      }
      await sleep(2500);
    }
    await shot(`safari-${variant.replace(/\W+/g, '-')}`);
    const report = await js('return window.__spikeReport ? window.__spikeReport() : null');
    console.log(`  rolls ${rolls}, moves ${moves}`);
    if (!report) {
      console.log('  no meter on this page');
      return;
    }
    const t = report.totals;
    console.log(
      `  frames ${t.frames} in ${(t.ms / 1000).toFixed(1)} s (${((1000 * t.frames) / Math.max(1, t.ms)).toFixed(0)} fps) | over 34 ms: ${t.over34} | over 50 ms: ${t.over50} | over 100 ms: ${t.over100} | time in slow frames: ${Math.round(t.slowMs)} ms`,
    );
    const g = report.gl;
    if (g) {
      console.log(
        `  gl per frame: draws ${(g.draws / Math.max(1, t.frames)).toFixed(0)} | sync calls ${(g.sync / Math.max(1, t.frames)).toFixed(1)} | gl time ${(g.glMs / Math.max(1, t.frames)).toFixed(1)} ms || whole run: shader links ${g.links} | uploads ${g.texMb.toFixed(1)} MB | new contexts ${g.ctx}`,
      );
    }
    for (const l of report.worst.slice(0, Number(process.env.WORST || 8))) console.log(`    ${l}`);
  } catch (e) {
    console.log(`  FAILED: ${String(e).slice(0, 300)}`);
    await shot(`safari-failed-${variant.replace(/\W+/g, '-')}`).catch(() => {});
    console.log(`  page: ${String(await text().catch(() => '?')).slice(0, 300)}`);
  } finally {
    await wd('DELETE', s).catch(() => {});
  }
}

try {
  for (const v of VARIANTS) {
    console.log(`\n== ${v}`);
    await play(v);
  }
} finally {
  driver.kill();
}
