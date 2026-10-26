// Walnut Kafeneio: board geometry and board art (SVG), in points (pt).
//
// This is Concept B from issue #13 (`docs/design/style/src/build.js` on the
// concept branch), split into layers for the app:
//   board-*.webp  frame, bar, hinges, trays and the empty wood field
//   shade-*.webp  wear, grime and the frame's inner shadow (drawn over the points)
// Points, checkers and dice are vector shapes. The renderer draws them from
// theme.json.

import { normRect, rect, rng, round, toLandscape } from '../lib/geometry.mjs';

export const THEME_ID = 'walnut-kafeneio';

// Portrait board (turned 90°), 377 x 630 pt: a 393 pt wide phone minus 8 pt
// on each side. See the "Orientation" section of the concept README.
const W = 377;
const H = 630;
const FRAME = 13;
const BAR = 34;
const RAIL = 9;
const TRAY = 46;
const PITCH = (H - 2 * FRAME - BAR - RAIL - TRAY) / 12; // 42.9 pt per point
const IX0 = FRAME;
const IX1 = W - FRAME;
const CX = W / 2;
const TOP0 = FRAME;
const BAR0 = TOP0 + 6 * PITCH;
const BAR1 = BAR0 + BAR;
const SEAM = BAR0 + BAR / 2;
const BOT0 = BAR1;
const BOT1 = BOT0 + 6 * PITCH;
const TRAY0 = BOT1 + RAIL;
const TRAY1 = H - FRAME;
const POINT_LEN = 156;
const CHECKER_D = 40;

/** Sizes that the layout block of theme.json needs, in pt. */
export const SIZES = {
  pointLength: POINT_LEN,
  pointDepth: CX - IX0,
  pointBreadth: PITCH,
  pointBaseInset: 0.2,
  seamWidth: 0.6,
  checkerRadius: CHECKER_D / 2,
  stackSpacing: CHECKER_D,
  stackInset: 1.2,
  maxStackLength: POINT_LEN + 10,
  trayThickness: 10,
  die: 33,
  pointTile: 160,
  boardShadow: { dx: 0, dy: 5, blur: 5, opacity: 0.5 },
};

/** The portrait board: every shape the art and the layout need. */
export function portraitGeometry() {
  const points = [];
  for (let p = 1; p <= 24; p++) {
    // Left column, top to bottom: 12..7 | bar | 6..1. Right: 13..18 | bar | 19..24.
    const left = p <= 12;
    const top = (p >= 7 && p <= 12) || (p >= 13 && p <= 18);
    const row = p >= 7 && p <= 12 ? 12 - p : p <= 6 ? 6 - p : p <= 18 ? p - 13 : p - 19;
    const y = (top ? TOP0 : BOT0) + row * PITCH;
    points.push({
      index: p,
      rect: left ? rect(IX0, y, CX - IX0, PITCH) : rect(CX, y, IX1 - CX, PITCH),
      base: left ? 'left' : 'right',
      // Even points are ebony. Points that face each other get different woods.
      tone: p % 2 === 0 ? 'dark' : 'light',
    });
  }

  const fields = [rect(IX0, TOP0, IX1 - IX0, 6 * PITCH), rect(IX0, BOT0, IX1 - IX0, 6 * PITCH)];

  const hinges = [36, W - 36].map((cx) => {
    const w = 34;
    const h = 18;
    const x = cx - w / 2;
    const y = SEAM - h / 2;
    const screws = [
      [x + 6, y + 3.6],
      [x + w - 6, y + 3.6],
      [x + 6, y + h - 3.6],
      [x + w - 6, y + h - 3.6],
    ].map(([sx, sy]) => ({
      cx: sx,
      cy: sy,
      r: 1.9,
      slot: { a: [sx - 1.3, sy - 0.4], b: [sx + 1.3, sy + 0.4] },
    }));
    return {
      plate: rect(x, y, w, h),
      knuckle: rect(x, SEAM - 2.4, w, 4.8),
      knuckleLines: [x + w / 3, x + (2 * w) / 3].map((lx) => ({
        a: [lx, SEAM - 2.4],
        b: [lx, SEAM + 2.4],
      })),
      screws,
    };
  });

  const clasps = [0, H - 7].map((y) => ({
    plate: rect(CX - 11, y, 22, 7),
    screw: { cx: CX, cy: y + 3.5, r: 1.6 },
  }));

  // Wear. Same seed and order as the concept, so the board looks the same.
  const R = rng(23);
  const fieldRubs = [];
  const fieldScratches = [];
  for (const r of fields) {
    const rubs = [];
    for (let i = 0; i < 6; i++) {
      const left = R() < 0.5;
      const x = left ? r.x + 20 + R() * 60 : r.x + r.w - 20 - R() * 60;
      const y = r.y + 10 + R() * (r.h - 20);
      rubs.push({ cx: x, cy: y, rx: 30 + R() * 30, ry: 10 + R() * 10 });
    }
    const scratches = [];
    for (let i = 0; i < 26; i++) {
      const x = r.x + R() * r.w;
      const y = r.y + R() * r.h;
      const len = 8 + R() * 34;
      const a = (R() - 0.5) * 0.9 + (R() < 0.5 ? 0 : Math.PI / 2);
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      const c = [(x + x2) / 2 + (R() - 0.5) * 6, (y + y2) / 2 + (R() - 0.5) * 6];
      scratches.push({
        a: [x, y],
        c,
        b: [x2, y2],
        opacity: 0.08 + R() * 0.12,
        width: 0.3 + R() * 0.4,
      });
    }
    fieldRubs.push(rubs);
    fieldScratches.push(scratches);
  }
  const frameScratches = [];
  for (let i = 0; i < 14; i++) {
    const x = R() * W;
    const y = R() < 0.5 ? R() * FRAME : H - R() * FRAME;
    frameScratches.push({ a: [x, y], b: [x + 6 + R() * 14, y + (R() - 0.5) * 2] });
  }

  return {
    id: 'portrait-rotated',
    orientation: 'portrait',
    width: W,
    height: H,
    corner: 5,
    boxes: [
      // The board folds at the bar: two boxes, each with a mitered frame.
      { outer: rect(0, 0, W, SEAM), inner: rect(IX0, TOP0, IX1 - IX0, BAR0 - TOP0) },
      { outer: rect(0, SEAM, W, H - SEAM), inner: rect(IX0, BAR1, IX1 - IX0, TRAY1 - BAR1) },
    ],
    seam: { a: [0, SEAM], b: [W, SEAM] },
    seamLight: { a: [0, SEAM + 1.2], b: [W, SEAM + 1.2] },
    fields,
    rail: rect(IX0, BOT1, IX1 - IX0, RAIL),
    divider: rect(CX - 2, TRAY0, 4, TRAY1 - TRAY0),
    trays: {
      // Your tray is under your home (bottom-left); the opponent's is bottom-right.
      player: { rect: rect(IX0, TRAY0, CX - 2 - IX0, TRAY1 - TRAY0), base: 'left' },
      opponent: { rect: rect(CX + 2, TRAY0, IX1 - CX - 2, TRAY1 - TRAY0), base: 'right' },
    },
    bar: {
      rect: rect(IX0, BAR0, IX1 - IX0, BAR),
      // Your hit checkers wait on the right half, next to where they enter (19-24).
      player: { rect: rect(CX, BAR0, IX1 - CX, BAR), base: 'left' },
      opponent: { rect: rect(IX0, BAR0, CX - IX0, BAR), base: 'right' },
    },
    points,
    // Dice land in the middle of your half, between the point tips.
    diceArea: rect(CX - 50, BOT0 + 2 * PITCH, 100, 2 * PITCH),
    hinges,
    clasps,
    corners: [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
    ],
    wear: {
      cornerRubs: [
        [0, 0],
        [W, 0],
        [0, H],
        [W, H],
        [0, SEAM],
        [W, SEAM],
      ].map(([cx, cy]) => ({ cx, cy, r: 9 })),
      coffeeRing: { cx: 324, cy: H - 4, r: 15 },
      frameScratches,
      fieldRubs,
      fieldScratches,
    },
    // Grain runs along the point. The texture grain is horizontal.
    pointTileRotation: 0,
    // A warm lamp above the table. Board-relative, from the concept's screen gradient.
    overlay: { cx: 0.5, cy: 0.36, rx: 0.73, ry: 0.95 },
    landscapeOverlay: { cx: 0.5, cy: 0.4, rx: 0.8, ry: 1.1 },
  };
}

/** The `layouts.<id>` block of theme.json for one geometry (normalized). */
export function layoutBlock(g) {
  const W = g.width;
  const H = g.height;
  const n = (r) => normRect(r, W, H);
  const wu = (v) => round(v / W); // width units
  const slot = (s) => ({ rect: n(s.rect), base: s.base });
  const key = g.orientation === 'portrait' ? 'Portrait' : 'Landscape';
  return {
    orientation: g.orientation,
    aspectRatio: round(W / H),
    referenceSize: { width: W, height: H },
    layers: [
      { id: 'board', image: `board${key}`, z: 'underPoints', blend: 'srcOver' },
      { id: 'shade', image: `shade${key}`, z: 'overPoints', blend: 'srcOver' },
    ],
    fields: g.fields.map(n),
    points: g.points.map((p) => ({ index: p.index, rect: n(p.rect), base: p.base, tone: p.tone })),
    pointShape: {
      depth: round(SIZES.pointLength / SIZES.pointDepth),
      baseInset: round(SIZES.pointBaseInset / SIZES.pointBreadth),
      seam: { color: '{board.seam}', opacity: 0.7, width: wu(SIZES.seamWidth) },
      tileSize: wu(SIZES.pointTile),
      tileRotation: g.pointTileRotation,
    },
    bar: { rect: n(g.bar.rect), player: slot(g.bar.player), opponent: slot(g.bar.opponent) },
    trays: { player: slot(g.trays.player), opponent: slot(g.trays.opponent) },
    diceArea: n(g.diceArea),
    checker: {
      radius: wu(SIZES.checkerRadius),
      stackSpacing: wu(SIZES.stackSpacing),
      stackInset: wu(SIZES.stackInset),
      maxStackDepth: round(SIZES.maxStackLength / SIZES.pointDepth),
      maxVisible: 5,
      trayThickness: wu(SIZES.trayThickness),
    },
    dice: { size: wu(SIZES.die), tilt: [-11, 9] },
    shadow: {
      dx: wu(SIZES.boardShadow.dx),
      dy: wu(SIZES.boardShadow.dy),
      blur: wu(SIZES.boardShadow.blur),
      color: '#000000',
      opacity: SIZES.boardShadow.opacity,
    },
    overlay: {
      gradient: {
        type: 'radial',
        ...g.overlay,
        stops: [
          { offset: 0, color: '{light.lamp}', opacity: 0.32 },
          { offset: 0.6, color: '#FF9A40', opacity: 0.12 },
          { offset: 1, color: '#000000', opacity: 0.5 },
        ],
      },
      blend: 'softLight',
    },
  };
}

/** What build-assets.mjs makes for this theme. */
export const BUILD = {
  // Textures the SVG layers use, by name (files in ./textures/).
  textures: { field: 'field-walnut.jpg', frame: 'frame-worn-walnut.jpg' },
  // Image layers per layout. `quality` is the WebP quality (0..1).
  layers: [
    { kind: 'board', svg: (g, tex) => boardSVG(g, tex), quality: 0.8 },
    { kind: 'shade', svg: (g, tex) => shadeSVG(g, tex), quality: 0.75 },
  ],
  // Point wood tiles: image key, source texture, output name, size in pt.
  tiles: [
    { key: 'pointEbony', src: 'point-ebony.jpg', file: 'point-ebony', size: SIZES.pointTile },
    { key: 'pointBone', src: 'point-bone.jpg', file: 'point-bone', size: SIZES.pointTile },
  ],
  tileQuality: 0.82,
};

export function geometries() {
  const portrait = portraitGeometry();
  return [portrait, toLandscape(portrait)];
}

// ------------------------------------------------------------------ SVG ---

const f2 = (n) => Math.round(n * 100) / 100;
const poly = (pts) => pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ');
const rectAttrs = (r) => `x="${f2(r.x)}" y="${f2(r.y)}" width="${f2(r.w)}" height="${f2(r.h)}"`;

function texPattern(id, href, size, rotate = 0, dx = 0, dy = 0) {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"
    patternTransform="translate(${dx} ${dy}) rotate(${rotate})">
    <image href="${href}" width="${size}" height="${size}" preserveAspectRatio="none"/></pattern>`;
}

function defs(g, tex) {
  const portrait = g.orientation === 'portrait';
  // Field grain runs along the long side of the board; tray grain along the tray.
  return `
  ${texPattern('field', tex.field, 250, portrait ? 90 : 0, portrait ? 75 : 0, portrait ? 0 : 75)}
  ${texPattern('tray', tex.frame, 220, portrait ? 0 : 90)}
  ${texPattern('frameH', tex.frame, 280, 0, 0, 40)}
  ${texPattern('frameV', tex.frame, 280, 90, 80, 0)}
  <filter id="shadowSoft" x="-20%" y="-40%" width="140%" height="200%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dx="0" dy="2"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="2.4"/></filter>
  <filter id="blur1"><feGaussianBlur stdDeviation="0.8"/></filter>
  <linearGradient id="rimLight" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.85"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.6"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.16"/>
    <stop offset="0.35" stop-color="#fff" stop-opacity="0.03"/>
    <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F3D58A"/><stop offset="0.35" stop-color="#C99A3E"/>
    <stop offset="0.55" stop-color="#9A6E22"/><stop offset="0.8" stop-color="#D8B25E"/>
    <stop offset="1" stop-color="#7A531A"/></linearGradient>
  <linearGradient id="brassH" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#8A6320"/><stop offset="0.3" stop-color="#E9C978"/>
    <stop offset="0.6" stop-color="#B88A35"/><stop offset="1" stop-color="#7A531A"/></linearGradient>
  <linearGradient id="brassV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8A6320"/><stop offset="0.3" stop-color="#E9C978"/>
    <stop offset="0.6" stop-color="#B88A35"/><stop offset="1" stop-color="#7A531A"/></linearGradient>
  <radialGradient id="rub" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#F0D9AE" stop-opacity="0.35"/><stop offset="1" stop-color="#F0D9AE" stop-opacity="0"/></radialGradient>
  <radialGradient id="grime" cx="0.5" cy="0.5" r="0.75">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a0c02" stop-opacity="0.45"/></radialGradient>
  <clipPath id="boardClip"><rect x="0" y="0" width="${g.width}" height="${g.height}" rx="${g.corner}"/></clipPath>`;
}

function framePieces(o, i) {
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

const grainFor = (r) => (r.w >= r.h ? 'frameH' : 'frameV');
const lineSvg = (l, attrs) =>
  `<line x1="${f2(l.a[0])}" y1="${f2(l.a[1])}" x2="${f2(l.b[0])}" y2="${f2(l.b[1])}" ${attrs}/>`;

function hardware(g) {
  const s = [];
  for (const h of g.hinges) {
    const knuckleGrad = h.knuckle.w >= h.knuckle.h ? 'brassH' : 'brassV';
    s.push(`<g filter="url(#shadowSoft)">
      <rect ${rectAttrs(h.plate)} rx="1.5" fill="url(#brass)"/>
      <rect ${rectAttrs(h.knuckle)} rx="2.4" fill="url(#${knuckleGrad})"/>
      ${h.knuckleLines.map((l) => lineSvg(l, 'stroke="#5a3c10" stroke-width="0.6"')).join('')}
      ${h.screws
        .map(
          (sc) =>
            `<circle cx="${f2(sc.cx)}" cy="${f2(sc.cy)}" r="${sc.r}" fill="#8a6422"/>${lineSvg(sc.slot, 'stroke="#4a320c" stroke-width="0.5"')}`,
        )
        .join('')}
      <rect ${rectAttrs(h.plate)} rx="1.5" fill="none" stroke="#5a3c10" stroke-width="0.6"/>
    </g>`);
  }
  for (const c of g.clasps) {
    s.push(`<g filter="url(#shadowSoft)"><rect ${rectAttrs(c.plate)} rx="1.5" fill="url(#brass)" stroke="#5a3c10" stroke-width="0.5"/>
      <circle cx="${f2(c.screw.cx)}" cy="${f2(c.screw.cy)}" r="${c.screw.r}" fill="#6a4a14"/></g>`);
  }
  // Brass corner caps.
  const k = 11;
  for (const [x, y] of g.corners) {
    const sx = x < g.width / 2 ? 1 : -1;
    const sy = y < g.height / 2 ? 1 : -1;
    s.push(
      `<path d="M${x} ${y + sy * k} V${y + sy * 3} Q${x} ${y} ${x + sx * 3} ${y} H${x + sx * k} L${x + sx * k * 0.55} ${y + sy * 2.6} H${x + sx * 2.6} V${y + sy * k * 0.55} Z" fill="url(#brass)" stroke="#5a3c10" stroke-width="0.5" opacity="0.95"/>`,
    );
  }
  return s.join('\n');
}

function frameWear(g) {
  const s = [];
  // Worn, lighter outer edges and corners.
  s.push(
    `<rect x="0.8" y="0.8" width="${g.width - 1.6}" height="${g.height - 1.6}" rx="${g.corner}" fill="none" stroke="#D9B98A" stroke-opacity="0.22" stroke-width="1.6" filter="url(#blur1)"/>`,
  );
  for (const c of g.wear.cornerRubs) {
    s.push(`<circle cx="${f2(c.cx)}" cy="${f2(c.cy)}" r="${c.r}" fill="url(#rub)" opacity="0.9"/>`);
  }
  // A faint old coffee ring.
  const cr = g.wear.coffeeRing;
  s.push(
    `<circle cx="${f2(cr.cx)}" cy="${f2(cr.cy)}" r="${cr.r}" fill="none" stroke="#120700" stroke-opacity="0.22" stroke-width="1.6" filter="url(#blur1)"/>`,
  );
  for (const l of g.wear.frameScratches) {
    s.push(lineSvg(l, 'stroke="#E9CFA2" stroke-opacity="0.13" stroke-width="0.5"'));
  }
  return s.join('\n');
}

function svgDoc(g, tex, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">
<defs>${defs(g, tex)}</defs>
<g clip-path="url(#boardClip)">
${body}
</g></svg>`;
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
  // The fold of the box, along the bar.
  s.push(lineSvg(g.seam, 'stroke="#120a05" stroke-width="1.4"'));
  s.push(lineSvg(g.seamLight, 'stroke="#fff" stroke-opacity="0.18" stroke-width="0.6"'));
  // Outer edge bevel on each box.
  for (const b of g.boxes) {
    const o = b.outer;
    s.push(
      `<rect x="${f2(o.x + 0.6)}" y="${f2(o.y + 0.6)}" width="${f2(o.w - 1.2)}" height="${f2(o.h - 1.2)}" rx="4" fill="none" stroke="url(#rimLight)" stroke-width="1.2" opacity="0.55"/>`,
    );
  }
  // Recesses: the two fields (walnut) and the two trays (worn walnut).
  for (const f of g.fields) s.push(`<rect ${rectAttrs(f)} fill="url(#field)"/>`);
  for (const t of [g.trays.player, g.trays.opponent]) {
    s.push(`<rect ${rectAttrs(t.rect)} fill="url(#tray)"/>`);
  }
  s.push(hardware(g));
  s.push(frameWear(g));
  // Finish: a soft sheen.
  s.push(
    `<rect x="0" y="0" width="${g.width}" height="${g.height}" fill="url(#sheen)" opacity="0.8" style="mix-blend-mode:soft-light"/>`,
  );
  return svgDoc(g, tex, s.join('\n'));
}

/** Layer 2: wear and shadows over the points (transparent elsewhere). */
export function shadeSVG(g, tex) {
  const s = [];
  const recesses = [
    ...g.fields.map((r, i) => ({ r, field: i })),
    { r: g.trays.player.rect, field: -1 },
    { r: g.trays.opponent.rect, field: -1 },
  ];
  recesses.forEach(({ r, field }, i) => {
    s.push(`<clipPath id="rc${i}"><rect ${rectAttrs(r)}/></clipPath>`);
    if (field >= 0) {
      // Darker grime toward the edges, lighter rubs where hands slide checkers.
      const wear = [`<rect ${rectAttrs(r)} fill="url(#grime)"/>`];
      for (const e of g.wear.fieldRubs[field]) {
        wear.push(
          `<ellipse cx="${f2(e.cx)}" cy="${f2(e.cy)}" rx="${f2(e.rx)}" ry="${f2(e.ry)}" fill="url(#rub)" opacity="0.5"/>`,
        );
      }
      for (const q of g.wear.fieldScratches[field]) {
        wear.push(
          `<path d="M${f2(q.a[0])} ${f2(q.a[1])} Q${f2(q.c[0])} ${f2(q.c[1])} ${f2(q.b[0])} ${f2(q.b[1])}" fill="none" stroke="#F5E3C0" stroke-opacity="${f2(q.opacity)}" stroke-width="${f2(q.width)}"/>`,
        );
      }
      s.push(`<g clip-path="url(#rc${i})">${wear.join('')}</g>`);
    }
    // Inner shadow cast by the frame (light from the top-left of the screen).
    s.push(`<g clip-path="url(#rc${i})">
      <rect x="${f2(r.x - 2)}" y="${f2(r.y - 2)}" width="${f2(r.w + 2)}" height="${f2(r.h + 2)}" fill="none" stroke="#000" stroke-opacity="0.7" stroke-width="9" filter="url(#blur3)" transform="translate(1.5 2.2)"/>
      <rect ${rectAttrs(r)} fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1"/></g>`);
    // Light catches the lower and right lips of the frame.
    s.push(
      `<path d="M${f2(r.x)} ${f2(r.y + r.h + 0.5)} H${f2(r.x + r.w + 0.5)} V${f2(r.y)}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="0.8"/>`,
    );
  });
  return svgDoc(g, tex, s.join('\n'));
}
