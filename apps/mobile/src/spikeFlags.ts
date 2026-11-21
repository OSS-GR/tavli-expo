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

// Several switches join with a dot: `?fx=split.flat`.
const fx = new Set((knob('fx') ?? '').split('.'));

export const SPIKE = {
  /** No blurred shadows under checkers, dice and the board. */
  noblur: fx.has('noblur') || fx.has('flat'),
  /** Checkers are two plain circles: no gradients, no grooves. */
  flat: fx.has('flat'),
  /**
   * The moving parts (flights, the dragged checker, the dice throw) draw on
   * their own canvas over the board, so the board itself is not drawn again
   * on each frame of an animation.
   */
  split: fx.has('split'),
  /** A frame meter in the corner. */
  hud: knob('hud') === '1',
};
