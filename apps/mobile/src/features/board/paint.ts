/**
 * Small helpers that turn theme paint data into Skia props.
 * Pure functions with no Skia import, so they are easy to test.
 */
import type { GradientStop, LinearGradient, RadialGradient } from '@tavli/themes';

import type { ScreenPoint } from './geometry';

/** `#RRGGBB` plus an opacity (0..1) as a CSS `rgba()` string. Skia parses it. */
export function rgba(hex: string, opacity = 1): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 1000) / 1000;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function stops(list: readonly GradientStop[]): { colors: string[]; positions: number[] } {
  return {
    colors: list.map((s) => rgba(s.color, s.opacity)),
    positions: list.map((s) => s.offset),
  };
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Props for Skia's `<RadialGradient>`, for a gradient in a bounding box (like SVG). */
export function radialProps(g: RadialGradient, box: Box) {
  const c: ScreenPoint = { x: box.x + g.cx * box.width, y: box.y + g.cy * box.height };
  const r = Math.max(0.01, g.rx * box.width);
  const sy = (g.ry * box.height) / r;
  return {
    c,
    r,
    ...stops(g.stops),
    // An ellipse: scale the circle around its center.
    ...(Math.abs(sy - 1) > 1e-3 ? { origin: c, transform: [{ scaleY: sy }] } : {}),
  };
}

/** Props for Skia's `<LinearGradient>`, for a gradient in a bounding box. */
export function linearProps(g: LinearGradient, box: Box) {
  return {
    start: { x: box.x + g.x1 * box.width, y: box.y + g.y1 * box.height },
    end: { x: box.x + g.x2 * box.width, y: box.y + g.y2 * box.height },
    ...stops(g.stops),
  };
}
