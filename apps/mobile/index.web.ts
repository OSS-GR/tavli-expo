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

// SPIKE (#640): `?hud=1` shows a frame meter. For the slowest frame of the
// last 5 seconds it splits the time: `anim` (animation callbacks: Skia and
// Reanimated), `react` (React's scheduler), `input` (touch and click
// handlers), `timer`, and `rest` (not JavaScript we can see: the browser,
// the graphics card, or a throttle). Tap the meter to copy the 12 slowest
// frames of this page load.
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

  type Kind = 'anim' | 'react' | 'input' | 'timer';
  const spent: Record<Kind, number> = { anim: 0, react: 0, input: 0, timer: 0 };
  let depth = 0;
  const timed = <A extends unknown[], R>(kind: Kind, fn: (...a: A) => R) =>
    function (this: unknown, ...args: A): R {
      if (depth > 0) return fn.apply(this, args);
      depth += 1;
      const t0 = performance.now();
      try {
        return fn.apply(this, args);
      } finally {
        spent[kind] += performance.now() - t0;
        depth -= 1;
      }
    };

  const w = window as unknown as Record<string, unknown>;
  const raf = window.requestAnimationFrame.bind(window);
  w.requestAnimationFrame = (cb: FrameRequestCallback) => raf(timed('anim', cb));
  const st = window.setTimeout.bind(window);
  w.setTimeout = (cb: unknown, ms?: number, ...rest: unknown[]) =>
    st(typeof cb === 'function' ? timed('timer', cb as () => void) : (cb as string), ms, ...rest);
  // React's scheduler posts itself a message for each slice of work.
  const desc = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
  if (desc?.set && desc.get) {
    const set = desc.set;
    Object.defineProperty(MessagePort.prototype, 'onmessage', {
      configurable: true,
      get: desc.get,
      set(fn: unknown) {
        set.call(this, typeof fn === 'function' ? timed('react', fn as () => void) : fn);
      },
    });
  }
  const add = EventTarget.prototype.addEventListener;
  const INPUT = /^(pointer|touch|mouse|click|key)/;
  EventTarget.prototype.addEventListener = function (
    type: string,
    fn: EventListenerOrEventListenerObject | null,
    opts?: boolean | AddEventListenerOptions,
  ) {
    const wrapped =
      typeof fn === 'function' && INPUT.test(type) ? timed('input', fn as (e: Event) => void) : fn;
    return add.call(this, type, wrapped, opts);
  };

  interface Frame {
    at: number;
    gap: number;
    anim: number;
    react: number;
    input: number;
    timer: number;
  }
  const recent: Frame[] = [];
  const worstEver: Frame[] = [];
  const line = (f: Frame): string => {
    const js = f.anim + f.react + f.input + f.timer;
    const r = (n: number): number => Math.round(n);
    return `${r(f.gap)}ms = anim ${r(f.anim)} react ${r(f.react)} input ${r(f.input)} timer ${r(f.timer)} rest ${r(Math.max(0, f.gap - js))}`;
  };
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:50%;top:2px;transform:translateX(-50%);z-index:99999;padding:6px 10px;' +
    'border-radius:8px;background:#000d;color:#0f0;font:11px/1.35 monospace;white-space:pre;text-align:center';
  // A tap opens the list on the page itself (the clipboard is not reliable
  // on iOS Safari): take a screenshot, or select the text.
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:0;right:0;top:0;bottom:0;z-index:100000;background:#000e;color:#fff;' +
    'font:13px/1.5 monospace;padding:48px 10px 10px;overflow:auto;white-space:pre-wrap;display:none;' +
    '-webkit-user-select:text;user-select:text';
  const report = (): string =>
    [
      'Slowest frames (ms). Screenshot this, then tap to close.',
      `${window.innerWidth}x${window.innerHeight} dpr ${window.devicePixelRatio}`,
      navigator.userAgent.replace(
        /^.*?(\(.*?\)).*?(Version\/[\d.]+|Chrome\/[\d.]+|Firefox\/[\d.]+).*$/,
        '$1 $2',
      ),
      '',
      ...(worstEver.length === 0
        ? ['No slow frame yet. Play a turn first.']
        : worstEver.map((f) => `at ${(f.at / 1000).toFixed(0)}s  ${line(f)}`)),
    ].join('\n');
  const open = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    panel.textContent = report();
    panel.style.display = 'block';
  };
  const close = (e: Event): void => {
    e.preventDefault();
    panel.style.display = 'none';
  };
  box.style.cursor = 'pointer';
  box.style.pointerEvents = 'auto';
  add.call(box, 'touchend', open, { passive: false });
  add.call(box, 'click', open);
  add.call(panel, 'touchend', close, { passive: false });
  add.call(panel, 'click', close);
  let last = performance.now();
  let shown = 0;
  const tick = (t: number): void => {
    const f: Frame = { at: t, gap: t - last, ...spent };
    spent.anim = 0;
    spent.react = 0;
    spent.input = 0;
    spent.timer = 0;
    last = t;
    recent.push(f);
    while (recent.length > 0 && t - (recent[0]?.at ?? t) > 5000) recent.shift();
    if (f.gap > 40 && t > 4000) {
      worstEver.push(f);
      worstEver.sort((x, y) => y.gap - x.gap);
      worstEver.length = Math.min(worstEver.length, 12);
    }
    if (t - shown > 300) {
      shown = t;
      const sec = recent.filter((x) => t - x.at <= 1000).length;
      const worst = recent.reduce((m, x) => (x.gap > m.gap ? x : m), f);
      const slow = recent.filter((x) => x.gap > 34).length;
      box.textContent = `${sec} fps   slow frames (5s): ${slow}\nworst ${line(worst)}\ntap for the list`;
      box.style.color = worst.gap > 100 ? '#f66' : worst.gap > 34 ? '#fd0' : '#0f0';
    }
    raf(tick);
  };
  const start = (): void => {
    document.body.appendChild(box);
    document.body.appendChild(panel);
    raf(tick);
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
