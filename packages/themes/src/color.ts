/**
 * Color helpers: palette token references and WCAG contrast.
 *
 * This file has no runtime imports, so Node can run it directly
 * (the preview tool does).
 */

import type { ThemeManifest } from './types';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const TOKEN_REF = /^\{([a-z0-9.-]+)\}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** Returns the token name for `{board.frame}`, or `null` if the value is not a reference. */
export function tokenRef(value: string): string | null {
  const m = TOKEN_REF.exec(value);
  return m ? (m[1] ?? null) : null;
}

/**
 * Returns a deep copy of the manifest where every `{token}` string is
 * replaced by its palette color. Unknown tokens throw.
 */
export function resolvePalette(theme: ThemeManifest): ThemeManifest {
  const palette = theme.palette;
  const walk = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') {
      const name = tokenRef(value);
      if (name === null) return value;
      const hex = palette[name];
      if (hex === undefined) throw new Error(`${path}: unknown palette token "${name}"`);
      return hex;
    }
    if (Array.isArray(value)) return value.map((v, i) => walk(v, `${path}[${i}]`));
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = k === 'palette' && path === '' ? v : walk(v, path ? `${path}.${k}` : k);
      }
      return out;
    }
    return value;
  };
  return walk(theme, '') as ThemeManifest;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of `#RRGGBB`. */
export function relativeLuminance(hex: string): number {
  if (!isHexColor(hex)) throw new Error(`Not a #RRGGBB color: ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
