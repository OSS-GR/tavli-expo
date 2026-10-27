// Kafeneio Night: board art (SVG) for the third bundled theme, in points (pt).
//
// A dark evening board (issue #144): a deep mahogany field, a black walnut
// frame with brass corner plates, brass nails, brass hinges and brass
// stringing round the recesses. Split into layers for the app:
//   board-*.webp  frame, bar, hinges, corner plates, nails, stringing, trays
//                 and the empty mahogany field
//   shade-*.webp  a soft dark edge on the fields and the frame's inner
//                 shadow, drawn over the points
// Points (rosewood and pale ash), checkers and dice are vector shapes. The
// renderer draws them from theme.json.
//
// The board geometry is the one of Walnut Kafeneio, on purpose: every theme
// shares one geometry contract (same points, bar, trays, checker size). Only
// the art differs.

import { round, toLandscape } from '../lib/geometry.mjs';
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
import {
  layoutBlock as baseLayoutBlock,
  portraitGeometry as basePortraitGeometry,
  SIZES,
} from '../walnut-kafeneio/design.mjs';

export const THEME_ID = 'kafeneio-night';
export { SIZES };

/** Sizes of the brass work, in pt. */
const BRASS = {
  /** Outer corner plates: arm length and arm width. */
  corner: 25,
  cornerArm: 9.5,
  /** Nails keep this far from the fold on the side members. */
  foldGap: 9,
  /** Nail heads along the outer frame: radius and the gap between nails. */
  nail: 1.45,
  nailPitch: 38,
  /** Stringing round each recess: its gap from the recess edge and width. */
  stringGap: 2.6,
  stringWidth: 0.9,
};

/** Wood tile sizes, in pt. */
const TILE = { field: 260, frame: 260, tray: 220 };

// Brass and wood colors (palette tokens in theme.json).
const C = {
  brassLight: '#F3D58A',
  brass: '#C99A3E',
  brassMid: '#9A6E22',
  brassDark: '#6E4A16',
  brassLine: '#4A300C',
  nail: '#D9B25E',
};

export function geometries() {
  const portrait = basePortraitGeometry();
  return [portrait, toLandscape(portrait)];
}

/** The `layouts.<id>` block of theme.json: the shared layout, a low lamp and brass seams on the points. */
export function layoutBlock(g) {
  const block = baseLayoutBlock(g);
  // A thin brass line round every point keeps the dark rosewood apart from the
  // mahogany field.
  block.pointShape.seam = {
    color: '{board.point.seam}',
    opacity: 0.85,
    width: round(0.7 / g.width),
  };
  block.overlay = {
    gradient: {
      type: 'radial',
      // A low, warm lamp over the middle of the table; the corners fall into the night.
      ...g.overlay,
      stops: [
        { offset: 0, color: '{light.lamp}', opacity: 0.3 },
        { offset: 0.6, color: '#FF8A30', opacity: 0.08 },
        { offset: 1, color: '#000000', opacity: 0.4 },
      ],
    },
    blend: 'softLight',
  };
  return block;
}

/** What build-assets.mjs makes for this theme. */
export const BUILD = {
  textures: { field: 'field-mahogany.jpg', frame: 'frame-black-walnut.jpg' },
  layers: [
    { kind: 'board', svg: (g, tex) => boardSVG(g, tex), quality: 0.8 },
    { kind: 'shade', svg: (g, tex) => shadeSVG(g, tex), quality: 0.75 },
  ],
  tiles: [
    {
      key: 'pointRosewood',
      src: 'point-rosewood.jpg',
      file: 'point-rosewood',
      size: SIZES.pointTile,
    },
    { key: 'pointAsh', src: 'point-ash.jpg', file: 'point-ash', size: SIZES.pointTile },
  ],
  tileQuality: 0.82,
};

// ------------------------------------------------------------------ SVG ---

/**
 * Maps a portrait point to `g`, as `toLandscape` does: (x, y) -> (y, W - x).
 * Used for art that is placed in portrait and only moves with the board.
 */
function fromPortrait(g) {
  if (g.orientation === 'portrait') return (p) => p;
  const W = g.height;
  return ([x, y]) => [y, W - x];
}

function defs(g, tex) {
  const portrait = g.orientation === 'portrait';
  // Field grain runs along the long side of the board; tray grain along the tray.
  return `
  ${texPattern('field', tex.field, TILE.field, portrait ? 90 : 0, portrait ? 40 : 0, portrait ? 0 : 40)}
  ${texPattern('tray', tex.frame, TILE.tray, portrait ? 0 : 90, 0, 20)}
  ${texPattern('frameH', tex.frame, TILE.frame, 0, 0, 50)}
  ${texPattern('frameV', tex.frame, TILE.frame, 90, 90, 0)}
  <filter id="shadowSoft" x="-30%" y="-40%" width="160%" height="200%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.6"/><feOffset dx="0.6" dy="1.3"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.6"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="2.4"/></filter>
  <linearGradient id="rimLight" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.6"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.7"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.14"/>
    <stop offset="0.35" stop-color="#fff" stop-opacity="0.03"/>
    <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.25"/></linearGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.brassLight}"/><stop offset="0.3" stop-color="${C.brass}"/>
    <stop offset="0.55" stop-color="${C.brassMid}"/><stop offset="0.8" stop-color="#D8B25E"/>
    <stop offset="1" stop-color="${C.brassDark}"/></linearGradient>
  <linearGradient id="brassH" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#8A6320"/><stop offset="0.3" stop-color="#E9C978"/>
    <stop offset="0.6" stop-color="#B88A35"/><stop offset="1" stop-color="${C.brassDark}"/></linearGradient>
  <linearGradient id="brassV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8A6320"/><stop offset="0.3" stop-color="#E9C978"/>
    <stop offset="0.6" stop-color="#B88A35"/><stop offset="1" stop-color="${C.brassDark}"/></linearGradient>
  <radialGradient id="nailHead" cx="0.35" cy="0.3" r="0.75">
    <stop offset="0" stop-color="#FFF1C2"/><stop offset="0.35" stop-color="${C.nail}"/>
    <stop offset="1" stop-color="${C.brassDark}"/></radialGradient>
  <radialGradient id="dusk" cx="0.5" cy="0.5" r="0.75">
    <stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#0a0302" stop-opacity="0.4"/></radialGradient>
  <clipPath id="boardClip"><rect x="0" y="0" width="${g.width}" height="${g.height}" rx="${g.corner}"/></clipPath>`;
}

/** One brass nail head. */
const nailSvg = ([x, y], r = BRASS.nail) =>
  `<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="url(#nailHead)" stroke="${C.brassLine}" stroke-width="0.35"/>`;

/**
 * A brass L plate at a box corner. `o` is the corner, `u` and `v` are unit
 * vectors along the two edges into the board. `k` is the arm length, `t`
 * the arm width. Each arm ends in a chamfer, and a nail holds each arm.
 */
function cornerPlate(o, u, v, k, t) {
  const at = (a, b) => [o[0] + a * u[0] + b * v[0], o[1] + a * u[1] + b * v[1]];
  const outline = [at(0, 0), at(k, 0), at(k - t * 0.7, t), at(t, t), at(t, k - t * 0.7), at(0, k)];
  const e = 1.5; // engraved line, inset from the edge
  const engraved = [
    at(e, e),
    at(k - e * 1.8, e),
    at(k - t * 0.7 - e * 0.2, t - e),
    at(t - e, t - e),
    at(t - e, k - t * 0.7 - e * 0.2),
    at(e, k - e * 1.8),
  ];
  const nails = [at(t * 0.5, t * 0.5), at(k - t * 1.15, t * 0.5), at(t * 0.5, k - t * 1.15)];
  return `<g filter="url(#shadowSoft)">
    <polygon points="${poly(outline)}" fill="url(#brass)" stroke="${C.brassLine}" stroke-width="0.5" stroke-linejoin="round"/>
    <polygon points="${poly(engraved)}" fill="none" stroke="${C.brassLine}" stroke-opacity="0.55" stroke-width="0.35"/>
    ${nails.map((n) => nailSvg(n, BRASS.nail * 0.9)).join('')}</g>`;
}

/** Brass hinges on the fold, and a clasp in the middle of each end of the board. */
function hingesSvg(g) {
  const s = [];
  for (const h of g.hinges) {
    const knuckleGrad = h.knuckle.w >= h.knuckle.h ? 'brassH' : 'brassV';
    s.push(`<g filter="url(#shadowSoft)">
      <rect ${rectAttrs(h.plate)} rx="1.5" fill="url(#brass)"/>
      <rect ${rectAttrs(h.knuckle)} rx="2.4" fill="url(#${knuckleGrad})"/>
      ${h.knuckleLines.map((l) => lineSvg(l, `stroke="${C.brassLine}" stroke-width="0.6"`)).join('')}
      ${h.screws.map((sc) => nailSvg([sc.cx, sc.cy], sc.r * 0.85)).join('')}
      <rect ${rectAttrs(h.plate)} rx="1.5" fill="none" stroke="${C.brassLine}" stroke-width="0.6"/>
    </g>`);
  }
  for (const c of g.clasps) {
    s.push(`<g filter="url(#shadowSoft)"><rect ${rectAttrs(c.plate)} rx="1.5" fill="url(#brass)" stroke="${C.brassLine}" stroke-width="0.5"/>
      ${nailSvg([c.screw.cx, c.screw.cy], c.screw.r)}</g>`);
  }
  return s.join('\n');
}

/** Corner plates on the four outer corners. */
function cornerPlatesSvg(g) {
  return g.corners
    .map(([x, y]) => {
      const u = [x < g.width / 2 ? 1 : -1, 0];
      const v = [0, y < g.height / 2 ? 1 : -1];
      return cornerPlate([x, y], u, v, BRASS.corner, BRASS.cornerArm);
    })
    .join('\n');
}

/**
 * Nail heads along the middle of the outer frame, in portrait pt. They keep
 * clear of the corner plates, the fold and the clasps.
 */
function nailPositions() {
  const p = basePortraitGeometry();
  const frame = p.fields[0].x;
  const m = frame / 2;
  const seamY = p.seam.a[1];
  const clear = (v, zones) => zones.every(([a, b]) => v < a || v > b);
  const run = (from, to) => {
    const n = Math.max(1, Math.round((to - from) / BRASS.nailPitch));
    return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
  };
  const out = [];
  // Top and bottom members: clasps sit in the middle.
  const cx = p.width / 2;
  const claspZone = [cx - 18, cx + 18];
  const xEnd = BRASS.corner + 6;
  for (const y of [m, p.height - m]) {
    for (const x of [...run(xEnd, cx - 22), ...run(cx + 22, p.width - xEnd)]) {
      if (clear(x, [claspZone])) out.push([x, y]);
    }
  }
  // Side members, each box on its own, clear of the fold.
  const foldZone = [seamY - BRASS.foldGap, seamY + BRASS.foldGap];
  for (const x of [m, p.width - m]) {
    for (const y of [
      ...run(BRASS.corner + 6, foldZone[0]),
      ...run(foldZone[1], p.height - BRASS.corner - 6),
    ]) {
      out.push([x, y]);
    }
  }
  return out;
}

/** Brass stringing round a recess, set into the frame. */
function stringing(r) {
  const k = BRASS.stringGap;
  const box = { x: r.x - k, y: r.y - k, w: r.w + 2 * k, h: r.h + 2 * k };
  return `<rect ${rectAttrs(box)} fill="none" stroke="${C.brassLine}" stroke-opacity="0.8" stroke-width="${f2(BRASS.stringWidth + 0.6)}"/>
  <rect ${rectAttrs(box)} fill="none" stroke="${C.brass}" stroke-opacity="0.9" stroke-width="${BRASS.stringWidth}"/>`;
}

/** Layer 1: the board without points (drawn under the points). */
export function boardSVG(g, tex) {
  const s = [];
  for (const b of g.boxes) {
    for (const [pat, pts] of framePieces(b.outer, b.inner)) {
      s.push(`<polygon points="${poly(pts)}" fill="url(#${pat})"/>`);
      // Miter seams.
      s.push(
        `<polygon points="${poly(pts)}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="0.5"/>`,
      );
    }
  }
  s.push(`<rect ${rectAttrs(g.rail)} fill="url(#${grainFor(g.rail)})"/>`);
  s.push(`<rect ${rectAttrs(g.divider)} fill="url(#${grainFor(g.divider)})"/>`);
  // The fold of the box, along the bar.
  s.push(lineSvg(g.seam, 'stroke="#070302" stroke-width="1.4"'));
  s.push(lineSvg(g.seamLight, 'stroke="#fff" stroke-opacity="0.12" stroke-width="0.6"'));
  // Outer edge bevel on each box.
  for (const b of g.boxes) {
    const o = b.outer;
    s.push(
      `<rect x="${f2(o.x + 0.6)}" y="${f2(o.y + 0.6)}" width="${f2(o.w - 1.2)}" height="${f2(o.h - 1.2)}" rx="4" fill="none" stroke="url(#rimLight)" stroke-width="1.2" opacity="0.5"/>`,
    );
  }
  // Recesses: the two mahogany fields and the two trays, each ringed in brass.
  const trays = [g.trays.player.rect, g.trays.opponent.rect];
  for (const r of [...g.fields, ...trays]) s.push(stringing(r));
  for (const f of g.fields) s.push(`<rect ${rectAttrs(f)} fill="url(#field)"/>`);
  for (const t of trays) s.push(`<rect ${rectAttrs(t)} fill="url(#tray)"/>`);
  // Brass: nails, hinges and corner plates.
  const map = fromPortrait(g);
  s.push(
    `<g filter="url(#shadowSoft)">${nailPositions()
      .map((p) => nailSvg(map(p)))
      .join('')}</g>`,
  );
  s.push(hingesSvg(g));
  s.push(cornerPlatesSvg(g));
  // Finish: a soft sheen.
  s.push(
    `<rect x="0" y="0" width="${g.width}" height="${g.height}" fill="url(#sheen)" opacity="0.8" style="mix-blend-mode:soft-light"/>`,
  );
  return svgDoc(g, defs(g, tex), s.join('\n'));
}

/** Layer 2: dusk on the field edges and the frame's inner shadow (transparent elsewhere). */
export function shadeSVG(g, tex) {
  const s = [];
  const recesses = [
    ...g.fields.map((r) => ({ r, field: true })),
    { r: g.trays.player.rect, field: false },
    { r: g.trays.opponent.rect, field: false },
  ];
  recesses.forEach(({ r, field }, i) => {
    s.push(`<clipPath id="rc${i}"><rect ${rectAttrs(r)}/></clipPath>`);
    // The field darkens toward its edges, away from the lamp.
    if (field) s.push(`<rect ${rectAttrs(r)} fill="url(#dusk)"/>`);
    // Inner shadow cast by the frame (light from the top-left of the screen).
    s.push(`<g clip-path="url(#rc${i})">
      <rect x="${f2(r.x - 2)}" y="${f2(r.y - 2)}" width="${f2(r.w + 2)}" height="${f2(r.h + 2)}" fill="none" stroke="#000" stroke-opacity="0.75" stroke-width="9" filter="url(#blur3)" transform="translate(1.5 2.2)"/>
      <rect ${rectAttrs(r)} fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="1"/></g>`);
    // Light catches the lower and right lips of the frame.
    s.push(
      `<path d="M${f2(r.x)} ${f2(r.y + r.h + 0.5)} H${f2(r.x + r.w + 0.5)} V${f2(r.y)}" fill="none" stroke="#FFE2A8" stroke-opacity="0.2" stroke-width="0.8"/>`,
    );
  });
  return svgDoc(g, defs(g, tex), s.join('\n'));
}
