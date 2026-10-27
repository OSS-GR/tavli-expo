// Small SVG helpers that the theme designs share. Units are points (pt).

/** A number with at most two decimals, so the SVG stays short and stable. */
export const f2 = (n) => Math.round(n * 100) / 100;

/** `points` of a <polygon> from [x, y] pairs. */
export const poly = (pts) => pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ');

/** `x y width height` attributes of a rect. */
export const rectAttrs = (r) =>
  `x="${f2(r.x)}" y="${f2(r.y)}" width="${f2(r.w)}" height="${f2(r.h)}"`;

/** A <line> from `l.a` to `l.b`. */
export const lineSvg = (l, attrs) =>
  `<line x1="${f2(l.a[0])}" y1="${f2(l.a[1])}" x2="${f2(l.b[0])}" y2="${f2(l.b[1])}" ${attrs}/>`;

/** A pattern that tiles one texture image, turned and moved. */
export function texPattern(id, href, size, rotate = 0, dx = 0, dy = 0) {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"
    patternTransform="translate(${dx} ${dy}) rotate(${rotate})">
    <image href="${href}" width="${size}" height="${size}" preserveAspectRatio="none"/></pattern>`;
}

/**
 * The four mitered frame members between an outer and an inner rect, with
 * the grain pattern of each: `frameH` for the top and bottom, `frameV` for
 * the sides.
 */
export function framePieces(o, i) {
  const x0 = o.x;
  const y0 = o.y;
  const x1 = o.x + o.w;
  const y1 = o.y + o.h;
  const ix0 = i.x;
  const iy0 = i.y;
  const ix1 = i.x + i.w;
  const iy1 = i.y + i.h;
  // prettier-ignore
  return [
    ['frameH', [[x0, y0], [x1, y0], [ix1, iy0], [ix0, iy0]]],
    ['frameH', [[x0, y1], [x1, y1], [ix1, iy1], [ix0, iy1]]],
    ['frameV', [[x0, y0], [ix0, iy0], [ix0, iy1], [x0, y1]]],
    ['frameV', [[x1, y0], [ix1, iy0], [ix1, iy1], [x1, y1]]],
  ];
}

/** The frame grain that runs along a rect. */
export const grainFor = (r) => (r.w >= r.h ? 'frameH' : 'frameV');

/** A whole SVG document of the board size, clipped to the rounded board. */
export function svgDoc(g, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">
<defs>${defs}</defs>
<g clip-path="url(#boardClip)">
${body}
</g></svg>`;
}
