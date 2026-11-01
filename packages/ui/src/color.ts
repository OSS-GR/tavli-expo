/** Color helpers for styles. Pure. */

/**
 * A `#RRGGBB` color with an alpha, as `rgba(r, g, b, a)`. We write rgba
 * rather than `#RRGGBBAA`, since not every style path reads 8-digit hex.
 * Any other value comes back unchanged (no alpha): styles must never throw,
 * and Unistyles on the web hands themes over as CSS variables.
 */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return color;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part ?? '0', 16));
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
