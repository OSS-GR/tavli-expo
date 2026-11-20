// SPIKE (phase 0, #637): web entry. CanvasKit must load before any screen draws.
// SPIKE (#640): Skia draws every canvas at the screen's pixel density. On a
// large high-density screen (a MacBook) the board is about 4000 x 2200 real
// pixels, and Safari lags on the dice throw and the checker flights. This
// caps the density by the window width (a phone keeps its own). Test knobs:
// open with `?pd=full` for the real density, or `?pd=1.5` for a fixed one.
(() => {
  if (typeof window === 'undefined') return;
  const real = window.devicePixelRatio || 1;
  let knob: string | null = null;
  try {
    knob = new URLSearchParams(window.location.search).get('pd');
    if (knob === null) knob = window.sessionStorage.getItem('pd');
    else window.sessionStorage.setItem('pd', knob);
  } catch {
    // No storage: use the default.
  }
  if (knob === 'full') return;
  const fixed = knob === null ? NaN : Number(knob);
  const pick = (): number =>
    Number.isFinite(fixed) && fixed > 0
      ? fixed
      : Math.min(real, Math.max(1, 2200 / Math.max(1, window.innerWidth)));
  try {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: pick });
  } catch {
    // The browser keeps its own value.
  }
})();

// SPIKE (#640): `?hud=1` shows a frame meter: frames per second, and the
// longest frame of the last 3 seconds (a long frame is a visible stutter).
(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  let on = false;
  try {
    const q = new URLSearchParams(window.location.search).get('hud');
    if (q !== null) window.sessionStorage.setItem('spike.hud', q);
    on = (q ?? window.sessionStorage.getItem('spike.hud')) === '1';
  } catch {
    // No storage: no meter.
  }
  if (!on) return;
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:50%;top:4px;transform:translateX(-50%);z-index:99999;padding:3px 8px;' +
    'border-radius:8px;background:#000c;color:#0f0;font:12px/1.3 monospace;pointer-events:none;white-space:pre';
  const frames: { t: number; d: number }[] = [];
  let last = performance.now();
  let shown = 0;
  const tick = (t: number): void => {
    frames.push({ t, d: t - last });
    last = t;
    while (frames.length > 0 && t - (frames[0]?.t ?? t) > 3000) frames.shift();
    if (t - shown > 250) {
      shown = t;
      const recent = frames.filter((f) => t - f.t <= 1000);
      const worst = frames.reduce((m, f) => Math.max(m, f.d), 0);
      const slow = frames.filter((f) => f.d > 34).length;
      box.textContent = `${recent.length} fps  worst ${Math.round(worst)} ms  slow ${slow}`;
      box.style.color = worst > 100 ? '#f55' : worst > 34 ? '#fd0' : '#0f0';
    }
    requestAnimationFrame(tick);
  };
  const start = (): void => {
    document.body.appendChild(box);
    requestAnimationFrame(tick);
  };
  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start);
})();

import '@expo/metro-runtime';
import './src/features/crash/start';
import './src/theme/unistyles';
import './src/i18n';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

const t0 = performance.now();
LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  (globalThis as { __skiaLoadMs?: number }).__skiaLoadMs = performance.now() - t0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { App } = require('expo-router/build/qualified-entry');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderRootComponent } = require('expo-router/build/renderRootComponent');
  renderRootComponent(App);
});
