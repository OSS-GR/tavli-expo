// Geometry helpers for the asset tools. Units are points (pt) unless noted.

/** mulberry32: a small seeded RNG, so every build gives the same art. */
export function rng(seed) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rect = (x, y, w, h) => ({ x, y, w, h });

/**
 * Turns a portrait geometry (board turned 90°) into the classic landscape
 * board. A portrait point (x, y) goes to (y, W - x), where W is the
 * portrait width. Your home moves from bottom-left to bottom-right and the
 * trays move from the bottom edge to the right edge.
 *
 * Only shapes move. Light still comes from the top-left of the screen, so
 * the art is drawn again for the new orientation, not rotated as an image.
 */
export function toLandscape(g) {
  const W = g.width;
  const pt = ([x, y]) => [y, W - x];
  const r = ({ x, y, w, h }) => ({ x: y, y: W - x - w, w: h, h: w });
  const side = (s) => ({ left: 'bottom', right: 'top', top: 'left', bottom: 'right' })[s];
  const slot = (s) => ({ ...s, rect: r(s.rect), base: side(s.base) });
  const line = (l) => ({ ...l, a: pt(l.a), b: pt(l.b) });
  const circle = (c) => {
    const [cx, cy] = pt([c.cx, c.cy]);
    return { ...c, cx, cy };
  };
  const ellipse = (e) => ({ ...circle(e), rx: e.ry, ry: e.rx });
  const quad = (q) => ({ ...q, a: pt(q.a), c: pt(q.c), b: pt(q.b) });
  const hinge = (h) => ({
    plate: r(h.plate),
    knuckle: r(h.knuckle),
    knuckleLines: h.knuckleLines.map(line),
    screws: h.screws.map((s) => ({ ...circle(s), slot: line(s.slot) })),
  });
  return {
    ...g,
    id: 'landscape',
    orientation: 'landscape',
    width: g.height,
    height: g.width,
    boxes: g.boxes.map((b) => ({ outer: r(b.outer), inner: r(b.inner) })),
    seam: line(g.seam),
    seamLight: line(g.seamLight),
    fields: g.fields.map(r),
    rail: r(g.rail),
    divider: r(g.divider),
    trays: { player: slot(g.trays.player), opponent: slot(g.trays.opponent) },
    bar: { rect: r(g.bar.rect), player: slot(g.bar.player), opponent: slot(g.bar.opponent) },
    points: g.points.map((p) => ({ ...p, rect: r(p.rect), base: side(p.base) })),
    diceArea: r(g.diceArea),
    hinges: g.hinges.map(hinge),
    clasps: g.clasps.map((c) => ({ plate: r(c.plate), screw: circle(c.screw) })),
    corners: g.corners.map(([x, y]) => pt([x, y])),
    wear: {
      cornerRubs: g.wear.cornerRubs.map(circle),
      coffeeRing: circle(g.wear.coffeeRing),
      frameScratches: g.wear.frameScratches.map(line),
      fieldRubs: g.wear.fieldRubs.map((list) => list.map(ellipse)),
      fieldScratches: g.wear.fieldScratches.map((list) => list.map(quad)),
    },
    pointTileRotation: g.pointTileRotation + 90,
    overlay: g.landscapeOverlay,
  };
}

const round = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Normalizes a rect to 0..1. Edges are rounded first, so rects that touch
 * in points still touch exactly after rounding.
 */
export function normRect(r, W, H) {
  const x0 = round(r.x / W);
  const y0 = round(r.y / H);
  const x1 = round((r.x + r.w) / W);
  const y1 = round((r.y + r.h) / H);
  return { x: x0, y: y0, w: round(x1 - x0), h: round(y1 - y0) };
}

export { round };
