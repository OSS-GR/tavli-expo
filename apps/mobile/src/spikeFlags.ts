/**
 * SPIKE (#640): test switches for the web lag hunt, read once from the
 * address (`?fx=noblur`, `?fx=flat`, `?hud=1`) and kept for the browser tab.
 * `?fx=off` and `?hud=0` clear them. Never ship this file.
 */
function knob(name: string): string | null {
  try {
    const w = globalThis as { location?: { search?: string }; sessionStorage?: Storage };
    const fromUrl = new URLSearchParams(w.location?.search ?? '').get(name);
    if (fromUrl !== null) w.sessionStorage?.setItem(`spike.${name}`, fromUrl);
    return fromUrl ?? w.sessionStorage?.getItem(`spike.${name}`) ?? null;
  } catch {
    return null;
  }
}

const fx = knob('fx');

export const SPIKE = {
  /** No blurred shadows under checkers, dice and the board. */
  noblur: fx === 'noblur' || fx === 'flat',
  /** Checkers are two plain circles: no gradients, no grooves. */
  flat: fx === 'flat',
  /** A frame meter in the corner. */
  hud: knob('hud') === '1',
};
