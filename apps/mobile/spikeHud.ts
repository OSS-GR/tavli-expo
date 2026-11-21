// SPIKE (#640): `?hud=1` shows a frame meter. For each slow frame it says
// how long the main thread was busy and how long it was free (a heartbeat
// timer tells them apart), and which script ran: `anim` (animation
// callbacks), `react` (React scheduler), `micro` (microtasks: React sync
// work, Reanimated mappers), `input`, `timer`. Tap the meter for the 12
// slowest frames of this page load. It is the first import of the web entry.
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

  type Kind = 'anim' | 'react' | 'micro' | 'input' | 'timer';
  const spent: Record<Kind, number> = { anim: 0, react: 0, micro: 0, input: 0, timer: 0 };
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
  // Microtasks run after the callback that queued them returns, so they
  // need their own clock: React flushes sync work there, and Reanimated's
  // web build runs its mappers there.
  const qm = window.queueMicrotask.bind(window);
  w.queueMicrotask = (cb: () => void) => qm(timed('micro', cb));
  const then = Promise.prototype.then;
  // eslint-disable-next-line no-extend-native
  Promise.prototype.then = function (this: Promise<unknown>, ok?: unknown, bad?: unknown) {
    return then.call(
      this,
      typeof ok === 'function' ? timed('micro', ok as (v: unknown) => unknown) : (ok as undefined),
      typeof bad === 'function'
        ? timed('micro', bad as (v: unknown) => unknown)
        : (bad as undefined),
    );
  } as typeof Promise.prototype.then;

  // A heartbeat: a timer that asks to run again at once (the browser allows
  // about every 4 ms). While the main thread is busy with anything (script,
  // layout, paint, a graphics call that waits) no beat gets through. So the
  // beats tell "the main thread was busy" from "it was free and the frame
  // was late anyway".
  let busy = 0;
  let lastBeat = performance.now();
  const beat = (): void => {
    const now = performance.now();
    const gap = now - lastBeat;
    if (gap > 12) busy += gap - 5;
    lastBeat = now;
    st(beat, 0);
  };
  st(beat, 0);

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
    micro: number;
    input: number;
    timer: number;
    busy: number;
  }
  const recent: Frame[] = [];
  const worstEver: Frame[] = [];
  // Totals since the page was 4 s old, for a test that reads them
  // (`window.__spikeReport()`).
  const totals = { frames: 0, over34: 0, over50: 0, over100: 0, ms: 0, slowMs: 0 };
  const line = (f: Frame): string => {
    const r = (n: number): number => Math.round(n);
    const busyMs = Math.min(f.gap, f.busy);
    return `${r(f.gap)}ms: busy ${r(busyMs)} free ${r(f.gap - busyMs)} | js: anim ${r(f.anim)} react ${r(f.react)} micro ${r(f.micro)} input ${r(f.input)} timer ${r(f.timer)}`;
  };
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:50%;top:2px;transform:translateX(-50%);z-index:99999;padding:6px 10px;' +
    'border-radius:8px;background:#000d;color:#0f0;font:10px/1.35 monospace;white-space:pre;text-align:center';
  // A tap opens the list on the page itself (the clipboard is not reliable
  // on iOS Safari): take a screenshot, or select the text.
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:0;right:0;top:0;bottom:0;z-index:100000;background:#000e;color:#fff;' +
    'font:13px/1.5 monospace;padding:48px 10px 10px;overflow:auto;white-space:pre-wrap;display:none;' +
    '-webkit-user-select:text;user-select:text';
  const report = (): string =>
    [
      'Slowest frames. busy = main thread busy, free = it was free and the frame was late anyway.',
      'Screenshot this, then tap to close.',
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
  (window as unknown as Record<string, unknown>).__spikeReport = () => ({
    totals: { ...totals },
    worst: worstEver.map((f) => `at ${(f.at / 1000).toFixed(0)}s  ${line(f)}`),
  });
  (window as unknown as Record<string, unknown>).__spikeReset = () => {
    totals.frames = totals.over34 = totals.over50 = totals.over100 = totals.ms = totals.slowMs = 0;
    worstEver.length = 0;
  };
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
    const f: Frame = { at: t, gap: t - last, ...spent, busy };
    spent.anim = 0;
    spent.react = 0;
    spent.micro = 0;
    spent.input = 0;
    spent.timer = 0;
    busy = 0;
    last = t;
    recent.push(f);
    while (recent.length > 0 && t - (recent[0]?.at ?? t) > 5000) recent.shift();
    if (t > 4000) {
      totals.frames += 1;
      totals.ms += f.gap;
      if (f.gap > 34) {
        totals.over34 += 1;
        totals.slowMs += f.gap;
      }
      if (f.gap > 50) totals.over50 += 1;
      if (f.gap > 100) totals.over100 += 1;
    }
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
      box.textContent = `${sec} fps  slow(5s) ${slow}  tap for the list\n${line(worst)}`;
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

export {};
