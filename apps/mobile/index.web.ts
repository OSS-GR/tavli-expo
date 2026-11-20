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

import './spikeHud';
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
