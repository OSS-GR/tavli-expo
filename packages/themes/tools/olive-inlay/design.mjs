// Olive Inlay: board art (SVG) for the second bundled theme, in points (pt).
//
// This is Concept A from issue #13 (`docs/design/style/src/build.js`), split
// into layers for the app (issue #138):
//   board-*.webp  olive frame and bar, dog-tooth banding, meander bands on
//                 the bar, trays and the empty olive field
//   shade-*.webp  the inlaid cores of the points (the other wood, with maple
//                 stringing) and the frame's inner shadow, drawn over the points
// Points, checkers and dice are vector shapes. The renderer draws them from
// theme.json.
//
// The board geometry is the one of Walnut Kafeneio, on purpose: both themes
// share one geometry contract (same points, bar, trays, checker size). Only
// the art differs.

import {
  layoutBlock as baseLayoutBlock,
  portraitGeometry as basePortraitGeometry,
  SIZES,
} from '../walnut-kafeneio/design.mjs';
import { toLandscape } from '../lib/geometry.mjs';
import {
  f2,
  framePieces,
  grainFor,
  lineSvg,
  poly,
  rectAttrs,
  svgDoc,
  texPattern,
} from '../lib/svg.mjs';

export const THEME_ID = 'olive-inlay';
export { SIZES };

/** Inlay sizes in pt (Concept A). */
const INLAY = {
  /** Dog-tooth banding: height of the band, set in the middle of the frame. */
  band: 4.4,
  /** Meander (Greek key) band height. Two bands, one on each half of the fold. */
  meander: 9,
  /** Core of each point: gap from the base, gap from each side, length. */
  coreBase: 3.2,
  coreSide: 7.5,
  coreLength: SIZES.pointLength - 30,
  /** Maple stringing around the core. */
  stringing: 1,
  /** Size of one wood tile in the cores and the field. */
  coreTile: 150,
  fieldTile: 230,
  frameTile: 260,
  trayTile: 220,
};

export function geometries() {
  const portrait = basePortraitGeometry();
  return [portrait, toLandscape(portrait)];
}

/** The `layouts.<id>` block of theme.json. Same as Walnut Kafeneio, with daylight instead of a lamp. */
export function layoutBlock(g) {
  const block = baseLayoutBlock(g);
  block.overlay = {
    gradient: {
      type: 'radial',
      // Soft daylight from the top-left of the screen in both layouts.
      cx: 0.3,
      cy: 0.2,
      rx: 1,
      ry: 1,
      stops: [
        { offset: 0, color: '{light.sun}', opacity: 0.22 },
        { offset: 0.55, color: '{light.sun}', opacity: 0 },
        { offset: 1, color: '#000000', opacity: 0.22 },
      ],
    },
    blend: 'softLight',
  };
  return block;
}

/** What build-assets.mjs makes for this theme. */
export const BUILD = {
  textures: {
    field: 'field-olive.jpg',
    frame: 'frame-olive-streak.jpg',
    wenge: 'point-wenge.jpg',
    mahogany: 'point-mahogany.jpg',
  },
  layers: [
    { kind: 'board', svg: (g, tex) => boardSVG(g, tex), quality: 0.8 },
    { kind: 'shade', svg: (g, tex) => shadeSVG(g, tex), quality: 0.78 },
  ],
  tiles: [
    { key: 'pointWenge', src: 'point-wenge.jpg', file: 'point-wenge', size: SIZES.pointTile },
    {
      key: 'pointMahogany',
      src: 'point-mahogany.jpg',
      file: 'point-mahogany',
      size: SIZES.pointTile,
    },
  ],
  tileQuality: 0.82,
};

// Colors of the inlay (palette.md, Concept A).
const C = {
  inlayLight: '#E7D7B6',
  inlayDark: '#2E1E14',
  meanderLight: '#E9DAB8',
  meanderDark: '#3A2618',
  seam: '#2A1A10',
  line: '#1C120B',
};

// ------------------------------------------------------------------ SVG ---

/**
 * The transform from the portrait board to `g`. The inlay is flat (no light
 * on it), so it may turn with the board. Shadows and bevels are drawn in
 * the coordinates of `g`, so light stays at the top-left.
 */
function inlayTransform(g) {
  if (g.orientation === 'portrait') return '';
  // Portrait (x, y) -> landscape (y, W - x), as in `toLandscape`.
  return `transform="matrix(0 -1 1 0 0 ${g.height})"`;
}

function meanderPattern(id, x0, y0, h) {
  // A simple Greek key tile, h tall and 10/9 h wide.
  const u = h / 9;
  const w = 10 * u;
  const d = `M0 ${8 * u} H${8 * u} V${u} H${2 * u} V${6 * u} H${6 * u} V${3 * u} H${4 * u} V${4 * u}`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f2(w)}" height="${f2(h)}" x="${f2(x0)}" y="${f2(y0)}">
    <rect width="${f2(w)}" height="${f2(h)}" fill="${C.meanderDark}"/>
    <path d="${d} M${8 * u} ${8 * u} H${w}" fill="none" stroke="${C.meanderLight}" stroke-width="${f2(u * 1.1)}" stroke-linecap="square"/></pattern>`;
}

/** Where the meander bands go on the portrait bar: whole keys, centred. */
function meanderBands(p) {
  const h = INLAY.meander;
  const tile = (10 * h) / 9;
  const bar = p.bar.rect;
  const w = Math.floor((bar.w - 16) / tile) * tile + tile / 5;
  const x = bar.x + (bar.w - w) / 2;
  return [bar.y + 3.5, bar.y + bar.h - 3.5 - h].map((y) => ({ x, y, w, h }));
}

function defs(g, tex) {
  const portrait = g.orientation === 'portrait';
  const p = basePortraitGeometry();
  const bands = meanderBands(p);
  const b = INLAY.band;
  // Grain: the field runs along the long side, the frame along each member.
  return `
  ${texPattern('field', tex.field, INLAY.fieldTile, portrait ? 90 : 0, portrait ? 4 : 0, portrait ? 0 : 4)}
  ${texPattern('tray', tex.frame, INLAY.trayTile, portrait ? 0 : 90, 0, 10)}
  ${texPattern('frameH', tex.frame, INLAY.frameTile, 0, 0, 30)}
  ${texPattern('frameV', tex.frame, INLAY.frameTile, 90, 60, 0)}
  ${texPattern('coreWenge', tex.wenge, INLAY.coreTile, portrait ? 0 : 90)}
  ${texPattern('coreMahogany', tex.mahogany, INLAY.coreTile, portrait ? 0 : 90, 20, 10)}
  <pattern id="dogtooth" patternUnits="userSpaceOnUse" width="6" height="${b}">
    <rect width="6" height="${b}" fill="${C.inlayDark}"/><polygon points="0,${b} 3,0 6,${b}" fill="${C.inlayLight}"/></pattern>
  <pattern id="dogtoothV" patternUnits="userSpaceOnUse" width="${b}" height="6">
    <rect width="${b}" height="6" fill="${C.inlayDark}"/><polygon points="${b},0 0,3 ${b},6" fill="${C.inlayLight}"/></pattern>
  ${meanderPattern('meander', bands[0].x, bands[0].y, INLAY.meander)}
  ${meanderPattern('meander2', bands[1].x, bands[1].y, INLAY.meander)}
  <filter id="blur3"><feGaussianBlur stdDeviation="2.4"/></filter>
  <linearGradient id="rimLight" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.85"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.6"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.16"/>
    <stop offset="0.35" stop-color="#fff" stop-opacity="0.03"/>
    <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>
  <clipPath id="boardClip"><rect x="0" y="0" width="${g.width}" height="${g.height}" rx="${g.corner}"/></clipPath>`;
}

/** Dog-tooth banding round the outer frame and meander bands on the bar, in portrait pt. */
function inlaySVG(g) {
  const p = basePortraitGeometry();
  const s = [];
  const t = INLAY.band;
  const frame = p.fields[0].x; // frame width
  const o = (frame - t) / 2;
  const x0 = o;
  const y0 = o;
  const x1 = p.width - o;
  const y1 = p.height - o;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  s.push(
    `<rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${t}" fill="url(#dogtooth)"/>`,
  );
  s.push(
    `<rect x="${f2(x0)}" y="${f2(y1 - t)}" width="${f2(x1 - x0)}" height="${t}" fill="url(#dogtooth)" transform="rotate(180 ${f2(cx)} ${f2(y1 - t / 2)})"/>`,
  );
  s.push(
    `<rect x="${f2(x0)}" y="${f2(y0 + t)}" width="${t}" height="${f2(y1 - y0 - 2 * t)}" fill="url(#dogtoothV)"/>`,
  );
  s.push(
    `<rect x="${f2(x1 - t)}" y="${f2(y0 + t)}" width="${t}" height="${f2(y1 - y0 - 2 * t)}" fill="url(#dogtoothV)" transform="rotate(180 ${f2(x1 - t / 2)} ${f2(cy)})"/>`,
  );
  // Fine dark lines on both edges of the band.
  for (const k of [0, t]) {
    s.push(
      `<rect x="${f2(x0 + k)}" y="${f2(y0 + k)}" width="${f2(x1 - x0 - 2 * k)}" height="${f2(y1 - y0 - 2 * k)}" fill="none" stroke="${C.line}" stroke-opacity="0.55" stroke-width="0.5"/>`,
    );
  }
  meanderBands(p).forEach((band, i) => {
    s.push(`<rect ${rectAttrs(band)} fill="url(#${i === 0 ? 'meander' : 'meander2'})"/>`);
    s.push(
      `<rect ${rectAttrs(band)} fill="none" stroke="${C.line}" stroke-opacity="0.55" stroke-width="0.6"/>`,
    );
  });
  return `<g ${inlayTransform(g)}>${s.join('\n')}</g>`;
}

/** Layer 1: the board without points (drawn under the points). */
export function boardSVG(g, tex) {
  const s = [];
  for (const b of g.boxes) {
    for (const [pat, pts] of framePieces(b.outer, b.inner)) {
      s.push(`<polygon points="${poly(pts)}" fill="url(#${pat})"/>`);
      // Miter seams.
      s.push(
        `<polygon points="${poly(pts)}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="0.5"/>`,
      );
    }
  }
  s.push(`<rect ${rectAttrs(g.rail)} fill="url(#${grainFor(g.rail)})"/>`);
  s.push(`<rect ${rectAttrs(g.divider)} fill="url(#${grainFor(g.divider)})"/>`);
  s.push(inlaySVG(g));
  // The fold of the box, along the bar, over the banding.
  s.push(lineSvg(g.seam, `stroke="#120a05" stroke-width="1.4"`));
  s.push(lineSvg(g.seamLight, 'stroke="#fff" stroke-opacity="0.18" stroke-width="0.6"'));
  // Outer edge bevel on each box.
  for (const b of g.boxes) {
    const o = b.outer;
    s.push(
      `<rect x="${f2(o.x + 0.6)}" y="${f2(o.y + 0.6)}" width="${f2(o.w - 1.2)}" height="${f2(o.h - 1.2)}" rx="4" fill="none" stroke="url(#rimLight)" stroke-width="1.2" opacity="0.55"/>`,
    );
  }
  // Recesses: the two olive fields and the two trays.
  for (const f of g.fields) s.push(`<rect ${rectAttrs(f)} fill="url(#field)"/>`);
  for (const t of [g.trays.player, g.trays.opponent]) {
    s.push(`<rect ${rectAttrs(t.rect)} fill="url(#tray)"/>`);
  }
  // Finish: a soft sheen.
  s.push(
    `<rect x="0" y="0" width="${g.width}" height="${g.height}" fill="url(#sheen)" opacity="0.9" style="mix-blend-mode:soft-light"/>`,
  );
  return svgDoc(g, defs(g, tex), s.join('\n'));
}

/**
 * The core of one point: a smaller triangle of the other wood. `along` runs
 * from the base to the tip, `across` over the breadth of the point.
 */
function coreTriangle(pt) {
  const r = pt.rect;
  const map = (along, across) => {
    switch (pt.base) {
      case 'left':
        return [r.x + along, r.y + across];
      case 'right':
        return [r.x + r.w - along, r.y + across];
      case 'top':
        return [r.x + across, r.y + along];
      default:
        return [r.x + across, r.y + r.h - along];
    }
  };
  const breadth = pt.base === 'left' || pt.base === 'right' ? r.h : r.w;
  return [
    map(INLAY.coreBase, INLAY.coreSide),
    map(INLAY.coreBase, breadth - INLAY.coreSide),
    map(INLAY.coreLength, breadth / 2),
  ];
}

/** Layer 2: the point cores and the frame's inner shadow (transparent elsewhere). */
export function shadeSVG(g, tex) {
  const s = [];
  // Inlaid cores: a wenge point gets a mahogany core and the other way round.
  for (const pt of g.points) {
    const tri = poly(coreTriangle(pt));
    const wood = pt.tone === 'dark' ? 'coreMahogany' : 'coreWenge';
    s.push(`<polygon points="${tri}" fill="url(#${wood})" opacity="0.92"/>`);
    s.push(
      `<polygon points="${tri}" fill="none" stroke="${C.inlayLight}" stroke-width="${INLAY.stringing}" stroke-opacity="0.9" stroke-linejoin="miter"/>`,
    );
    s.push(
      `<polygon points="${tri}" fill="none" stroke="${C.seam}" stroke-width="0.35" stroke-opacity="0.6" stroke-linejoin="miter"/>`,
    );
  }
  const recesses = [...g.fields, g.trays.player.rect, g.trays.opponent.rect];
  recesses.forEach((r, i) => {
    s.push(`<clipPath id="rc${i}"><rect ${rectAttrs(r)}/></clipPath>`);
    // Inner shadow cast by the frame (light from the top-left of the screen).
    s.push(`<g clip-path="url(#rc${i})">
      <rect x="${f2(r.x - 2)}" y="${f2(r.y - 2)}" width="${f2(r.w + 2)}" height="${f2(r.h + 2)}" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="9" filter="url(#blur3)" transform="translate(1.5 2.2)"/>
      <rect ${rectAttrs(r)} fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1"/></g>`);
    // Light catches the lower and right lips of the frame.
    s.push(
      `<path d="M${f2(r.x)} ${f2(r.y + r.h + 0.5)} H${f2(r.x + r.w + 0.5)} V${f2(r.y)}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="0.8"/>`,
    );
  });
  return svgDoc(g, defs(g, tex), s.join('\n'));
}
