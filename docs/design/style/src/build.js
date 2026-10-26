#!/usr/bin/env node
/*
 * Build the two wooden board concepts for issue #13.
 *
 *   node docs/design/style/src/build.js
 *
 * Writes:
 *   src/concept-a.svg, src/concept-b.svg, src/orientation.svg   (sources)
 *   ../concept-a-olive-inlay.png, ../concept-b-walnut-kafeneio.png (590x1278)
 *   ../orientation.png (466x530)
 *   and full-size @3x masters (1179x2556) into $MASTER_DIR if it is set:
 *     MASTER_DIR=/tmp/masters node docs/design/style/src/build.js
 *
 * Needs Node 18+ and Playwright with Chromium (`require('playwright')`).
 * The PNGs are screenshots of the SVGs, so the SVG is the true source.
 * All units below are iPhone points (393 x 852 pt screen, rendered @3x).
 */
const fs = require('fs');
const path = require('path');

const OUT_SRC = __dirname;
const OUT_DIR = path.join(__dirname, '..');
const TEX = '../textures/';

// ---------------------------------------------------------------- layout --
// The board is turned 90 degrees (see README "Orientation").
// Left column (top to bottom): White points 12..7 | bar | 6..1
// Right column (top to bottom): White points 13..18 | bar | 19..24
// White (you, light checkers) moves 24 -> 1: up the right column, across the
// top, down the left column, and bears off into the bottom-left tray.
const SCREEN = { w: 393, h: 852 };
const L = (() => {
  const bx = 8, by = 116, bw = 377, bh = 630;
  const f = 13; // outer frame
  const barH = 34, railH = 9, trayH = 46;
  const pw = (bh - 2 * f - barH - railH - trayH) / 12; // point pitch
  const ix0 = bx + f, ix1 = bx + bw - f;
  const topY0 = by + f, topY1 = topY0 + 6 * pw;
  const barY0 = topY1, barY1 = barY0 + barH, seam = barY0 + barH / 2;
  const botY0 = barY1, botY1 = botY0 + 6 * pw;
  const trayY0 = botY1 + railH, trayY1 = by + bh - f;
  return {
    bx, by, bw, bh, f, pw, barH, ix0, ix1, topY0, topY1, barY0, barY1, seam,
    botY0, botY1, railH, trayY0, trayY1,
    pointLen: 156, checkerD: 40,
    cx: bx + bw / 2,
  };
})();

// Point index (White numbering 1..24) -> geometry.
function pointGeom(p) {
  let side, row, y0;
  if (p >= 7 && p <= 12) { side = 'L'; row = 12 - p; y0 = L.topY0; }
  else if (p >= 1 && p <= 6) { side = 'L'; row = 6 - p; y0 = L.botY0; }
  else if (p >= 13 && p <= 18) { side = 'R'; row = p - 13; y0 = L.topY0; }
  else { side = 'R'; row = p - 19; y0 = L.botY0; }
  const top = y0 + row * L.pw;
  const mid = top + L.pw / 2;
  const baseX = side === 'L' ? L.ix0 : L.ix1;
  const dir = side === 'L' ? 1 : -1;
  return { side, top, mid, baseX, dir, tipX: baseX + dir * L.pointLen };
}

function checkerCenters(p, n) {
  const g = pointGeom(p);
  const d = L.checkerD;
  const step = n <= 4 ? d : (L.pointLen + 10 - d) / (n - 1);
  const out = [];
  for (let k = 0; k < n; k++) out.push([g.baseX + g.dir * (1.2 + d / 2 + k * step), g.mid]);
  return out;
}

// Portes start position in White's numbering. w = White (you), b = Black.
const PORTES_START = [
  [24, 'w', 2], [13, 'w', 5], [8, 'w', 3], [6, 'w', 5],
  [1, 'b', 2], [12, 'b', 5], [17, 'b', 3], [19, 'b', 5],
];

// -------------------------------------------------------------- helpers --
function rng(seed) { // mulberry32, so every render is the same
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f2 = (n) => Math.round(n * 100) / 100;
const poly = (pts) => pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ');

function texPattern(id, file, size, rotate = 0, dx = 0, dy = 0) {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"
    patternTransform="translate(${dx} ${dy}) rotate(${rotate})">
    <image href="${TEX}${file}" width="${size}" height="${size}" preserveAspectRatio="none"/></pattern>`;
}

// Common filters and gradients.
function commonDefs() {
  return `
  <filter id="shadowBoard" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="7"/><feOffset dx="0" dy="6"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="shadowChecker" x="-30%" y="-30%" width="170%" height="170%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.6"/><feOffset dx="1.3" dy="2.4"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="shadowDie" x="-40%" y="-40%" width="190%" height="190%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.6"/><feOffset dx="2.6" dy="4"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="shadowSoft" x="-20%" y="-40%" width="140%" height="200%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dx="0" dy="2"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="blur6"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="2.4"/></filter>
  <filter id="blur1"><feGaussianBlur stdDeviation="0.8"/></filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3"/></filter>
  <radialGradient id="dome" cx="0.36" cy="0.32" r="0.75">
    <stop offset="0" stop-color="#fff" stop-opacity="0.42"/>
    <stop offset="0.45" stop-color="#fff" stop-opacity="0.06"/>
    <stop offset="0.8" stop-color="#000" stop-opacity="0.08"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.38"/></radialGradient>
  <radialGradient id="domeDark" cx="0.3" cy="0.26" r="0.75">
    <stop offset="0" stop-color="#fff" stop-opacity="0.2"/>
    <stop offset="0.25" stop-color="#fff" stop-opacity="0.05"/>
    <stop offset="0.45" stop-color="#fff" stop-opacity="0.03"/>
    <stop offset="0.8" stop-color="#000" stop-opacity="0.08"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient>
  <radialGradient id="dishDark" cx="0.62" cy="0.66" r="0.8">
    <stop offset="0" stop-color="#fff" stop-opacity="0.05"/>
    <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>
  <radialGradient id="dish" cx="0.62" cy="0.66" r="0.8">
    <stop offset="0" stop-color="#fff" stop-opacity="0.30"/>
    <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.30"/></radialGradient>
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
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.09 0"/>
    <feComposite in2="SourceGraphic" operator="in"/></filter>
  <filter id="resin" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.09 0.16" numOctaves="3" seed="3"/>
    <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 -0.12"/>
    <feComposite in2="SourceGraphic" operator="in"/></filter>
  `;
}

// ------------------------------------------------------------- the board --
function framePieces(x0, y0, x1, y1, ix0, iy0, ix1, iy1) {
  return {
    top: [[x0, y0], [x1, y0], [ix1, iy0], [ix0, iy0]],
    bottom: [[x0, y1], [x1, y1], [ix1, iy1], [ix0, iy1]],
    left: [[x0, y0], [ix0, iy0], [ix0, iy1], [x0, y1]],
    right: [[x1, y0], [ix1, iy0], [ix1, iy1], [x1, y1]],
  };
}

function boardSVG(C) {
  const s = [];
  const { bx, by, bw, bh, ix0, ix1 } = L;
  const x1 = bx + bw, y1 = by + bh;
  const R = rng(C.seed);

  // Board drop shadow on the table.
  s.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="#000" opacity="0.5" filter="url(#blur6)" transform="translate(0 5)"/>`);

  // Two boxes (the board folds at the bar). Mitered frame members.
  const boxes = [
    framePieces(bx, by, x1, L.seam, ix0, L.topY0, ix1, L.barY0),
    framePieces(bx, L.seam, x1, y1, ix0, L.barY1, ix1, L.trayY1),
  ];
  s.push(`<g>`);
  for (const b of boxes) {
    for (const [k, pts] of Object.entries(b)) {
      const pat = k === 'left' || k === 'right' ? 'frameV' : 'frameH';
      s.push(`<polygon points="${poly(pts)}" fill="url(#${pat})"/>`);
      // Miter seams.
      s.push(`<polygon points="${poly(pts)}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="0.5"/>`);
    }
  }
  // Rail between field and tray, and tray divider.
  s.push(`<rect x="${ix0}" y="${L.botY1}" width="${ix1 - ix0}" height="${L.railH}" fill="url(#frameH)"/>`);
  s.push(`<rect x="${L.cx - 2}" y="${L.trayY0}" width="4" height="${L.trayY1 - L.trayY0}" fill="url(#frameV)"/>`);
  // Fold seam along the bar.
  s.push(`<line x1="${bx}" y1="${L.seam}" x2="${x1}" y2="${L.seam}" stroke="#120a05" stroke-width="1.4"/>`);
  s.push(`<line x1="${bx}" y1="${L.seam + 1.2}" x2="${x1}" y2="${L.seam + 1.2}" stroke="#fff" stroke-opacity="0.18" stroke-width="0.6"/>`);
  // Outer edge bevel.
  s.push(`<rect x="${bx + 0.6}" y="${by + 0.6}" width="${bw - 1.2}" height="${L.seam - by - 1.2}" rx="4" fill="none" stroke="url(#rimLight)" stroke-width="1.2" opacity="0.55"/>`);
  s.push(`<rect x="${bx + 0.6}" y="${L.seam + 0.6}" width="${bw - 1.2}" height="${y1 - L.seam - 1.2}" rx="4" fill="none" stroke="url(#rimLight)" stroke-width="1.2" opacity="0.55"/>`);
  s.push(`</g>`);

  if (C.frameInlay) s.push(C.frameInlay());

  // Recesses: two field halves and the two trays.
  const recesses = [
    { x: ix0, y: L.topY0, w: ix1 - ix0, h: L.topY1 - L.topY0, fill: 'url(#field)' },
    { x: ix0, y: L.botY0, w: ix1 - ix0, h: L.botY1 - L.botY0, fill: 'url(#field)' },
    { x: ix0, y: L.trayY0, w: L.cx - 2 - ix0, h: L.trayY1 - L.trayY0, fill: 'url(#tray)' },
    { x: L.cx + 2, y: L.trayY0, w: ix1 - L.cx - 2, h: L.trayY1 - L.trayY0, fill: 'url(#tray)' },
  ];
  recesses.forEach((r, i) => {
    s.push(`<clipPath id="rc${i}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`);
    s.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`);
    if (i < 2) s.push(pointsSVG(C, i === 0 ? [12, 11, 10, 9, 8, 7, 13, 14, 15, 16, 17, 18] : [6, 5, 4, 3, 2, 1, 19, 20, 21, 22, 23, 24], R));
    if (C.fieldWear && i < 2) s.push(`<g clip-path="url(#rc${i})">${C.fieldWear(r, R)}</g>`);
    // Inner shadow cast by the frame (light from top-left).
    s.push(`<g clip-path="url(#rc${i})"><rect x="${r.x - 2}" y="${r.y - 2}" width="${r.w + 2}" height="${r.h + 2}" fill="none" stroke="#000" stroke-opacity="${C.innerShadow}" stroke-width="9" filter="url(#blur3)" transform="translate(1.5 2.2)"/>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="1"/></g>`);
    // Light catches the lower and right lips of the frame.
    s.push(`<path d="M${r.x} ${r.y + r.h + 0.5} H${r.x + r.w + 0.5} V${r.y}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="0.8"/>`);
  });

  if (C.hardware) s.push(C.hardware());
  if (C.frameWear) s.push(C.frameWear(R));
  // Finish: a soft sheen over everything.
  s.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="url(#sheen)" opacity="${C.sheen}" style="mix-blend-mode:soft-light"/>`);
  return s.join('\n');
}

function pointsSVG(C, order, R) {
  const s = [];
  order.forEach((p, i) => {
    const g = pointGeom(p);
    // Alternate woods; points facing each other get different woods.
    const dark = (i + (i >= 6 ? 1 : 0)) % 2 === 0;
    const base0 = [g.baseX, g.top + 0.2], base1 = [g.baseX, g.top + L.pw - 0.2], tip = [g.tipX, g.mid];
    const pts = [base0, base1, tip];
    s.push(`<polygon points="${poly(pts)}" fill="url(#${dark ? 'pointDark' : 'pointLight'})"/>`);
    if (C.pointInlay) s.push(C.pointInlay(g, dark));
    // Inlay seam: a fine dark line around each point.
    s.push(`<polygon points="${poly(pts)}" fill="none" stroke="${C.seamColor}" stroke-opacity="0.7" stroke-width="0.6" stroke-linejoin="miter"/>`);
  });
  return s.join('\n');
}

// ------------------------------------------------------------- checkers --
function checkerSVG(C, color, x, y, R) {
  const r = L.checkerD / 2;
  const t = C.checker[color];
  const rot = Math.floor(R() * 4);
  const parts = [];
  parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="${t.base}"/>`);
  if (t.pattern) parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="url(#${t.pattern}${rot})"/>`);
  if (t.resin) parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="${t.base}" filter="url(#resin)" opacity="${t.resin}"/>`);
  parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="url(#${t.dome})"/>`);
  // Turned grooves or a dished centre.
  if (t.dish) {
    parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r * 0.56}" fill="url(#${t.dish})"/>`);
    parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r * 0.56}" fill="none" stroke="#000" stroke-opacity="${t.groove}" stroke-width="0.8"/>`);
    parts.push(`<circle cx="${f2(x + 0.5)}" cy="${f2(y + 0.6)}" r="${r * 0.56}" fill="none" stroke="#fff" stroke-opacity="${t.grooveLight}" stroke-width="0.6"/>`);
  }
  for (const k of t.grooves || []) {
    parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r * k)}" fill="none" stroke="#000" stroke-opacity="${t.groove}" stroke-width="0.7"/>`);
    parts.push(`<circle cx="${f2(x + 0.45)}" cy="${f2(y + 0.5)}" r="${f2(r * k)}" fill="none" stroke="#fff" stroke-opacity="${t.grooveLight}" stroke-width="0.5"/>`);
  }
  // Rim: lit bevel top-left, dark edge bottom-right, and a fine outline.
  parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r - 1}" fill="none" stroke="url(#rimLight)" stroke-width="1.4" opacity="${t.rim}"/>`);
  // Dark checkers get a light polished edge ring so they read on dark points.
  if (t.ring) parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r - 1.3}" fill="none" stroke="${t.ring}" stroke-width="1.1"/>`);
  parts.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${r - 0.35}" fill="none" stroke="${t.edge}" stroke-width="1.1"/>`);
  return `<g filter="url(#shadowChecker)">${parts.join('')}</g>`;
}

function checkersSVG(C) {
  const R = rng(C.seed + 99);
  const s = [];
  for (const [p, c, n] of PORTES_START) {
    for (const [x, y] of checkerCenters(p, n)) s.push(checkerSVG(C, c, x, y, R));
  }
  return s.join('\n');
}

// --------------------------------------------------------------- dice ----
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
function dieSVG(C, value, cx, cy, rot) {
  const sz = 33, h = sz / 2, D = C.dice;
  const pips = PIPS[value].map(([u, v]) => {
    const px = cx + u * 8.1, py = cy + v * 8.1;
    const col = value === 1 && D.onePip ? D.onePip : D.pip;
    return `<circle cx="${f2(px)}" cy="${f2(py)}" r="3.3" fill="${col}"/>
      <circle cx="${f2(px + 0.55)}" cy="${f2(py + 0.7)}" r="2.5" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="0.6"/>`;
  }).join('');
  return `<g transform="rotate(${rot} ${cx} ${cy})" filter="url(#shadowDie)">
    <rect x="${cx - h}" y="${cy - h}" width="${sz}" height="${sz}" rx="6.5" fill="${D.side}"/>
    <rect x="${cx - h + 1.2}" y="${cy - h + 0.8}" width="${sz - 3}" height="${sz - 3}" rx="5.5" fill="${D.face}"/>
    <rect x="${cx - h + 1.2}" y="${cy - h + 0.8}" width="${sz - 3}" height="${sz - 3}" rx="5.5" fill="url(#dome)" opacity="0.55"/>
    <rect x="${cx - h + 0.5}" y="${cy - h + 0.5}" width="${sz - 1}" height="${sz - 1}" rx="6.2" fill="none" stroke="${D.edge}" stroke-width="0.8"/>
    ${pips}</g>`;
}

// ---------------------------------------------------------- highlights ----
function highlightsSVG(C) {
  // You tapped the top checker on point 13; with 5-3 it can go to 8 or 10.
  const s = [];
  const [sx, sy] = checkerCenters(13, 5)[4];
  s.push(`<circle cx="${f2(sx)}" cy="${f2(sy)}" r="${L.checkerD / 2 + 2.2}" fill="none" stroke="${C.hl.halo}" stroke-width="4.2" opacity="0.8"/>`);
  s.push(`<circle cx="${f2(sx)}" cy="${f2(sy)}" r="${L.checkerD / 2 + 2.2}" fill="none" stroke="${C.hl.select}" stroke-width="2.2"/>`);
  for (const [p, k] of [[10, 0], [8, 3]]) {
    const all = checkerCenters(p, k + 1);
    const [x, y] = all[k];
    s.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${L.checkerD / 2 - 2}" fill="${C.hl.target}" opacity="0.22"/>`);
    s.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${L.checkerD / 2 - 2}" fill="none" stroke="${C.hl.halo}" stroke-width="3.6" opacity="0.75"/>`);
    s.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${L.checkerD / 2 - 2}" fill="none" stroke="${C.hl.target}" stroke-width="1.8" stroke-dasharray="4 3"/>`);
  }
  return s.join('\n');
}

// ------------------------------------------------------------------ HUD ----
function statusBar(C) {
  const c = C.ui.statusText;
  return `<g font-family="Inter" font-weight="600" fill="${c}">
    <text x="52" y="38" font-size="16.5">9:41</text>
    <rect x="134" y="11" width="125" height="37" rx="18.5" fill="#000"/>
    <g transform="translate(300 27)"><rect x="0" y="0" width="4" height="5" rx="1"/><rect x="5.5" y="-2" width="4" height="7" rx="1"/><rect x="11" y="-4" width="4" height="9" rx="1"/><rect x="16.5" y="-6" width="4" height="11" rx="1"/></g>
    <g transform="translate(332 21)"><rect x="0" y="0" width="25" height="12" rx="3.5" fill="none" stroke="${c}" stroke-opacity="0.5" stroke-width="1"/><rect x="2" y="2" width="18" height="8" rx="2"/><rect x="26.5" y="4" width="1.6" height="4" rx="0.8" opacity="0.5"/></g>
  </g>`;
}

function avatar(C, x, y, letter, checkerColor, active) {
  const u = C.ui;
  const t = C.checker[checkerColor];
  return `<g>
    ${active ? `<circle cx="${x}" cy="${y}" r="21" fill="none" stroke="${u.turn}" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="23" fill="${u.turn}" opacity="0.35" filter="url(#glow)"/>` : ''}
    <circle cx="${x}" cy="${y}" r="17.5" fill="${u.avatarBg}" stroke="${u.avatarRing}" stroke-width="1"/>
    <text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="17" fill="${u.avatarText}">${letter}</text>
    <circle cx="${x + 13}" cy="${y + 12}" r="6.5" fill="${t.base}" stroke="${t.edge}" stroke-width="1"/>
  </g>`;
}

function hud(C) {
  const u = C.ui;
  const s = [];
  // Opponent (top).
  s.push(`<g opacity="0.92">${avatar(C, 36, 88, 'Γ', 'b', false)}
    <text x="62" y="84" font-family="Inter" font-weight="600" font-size="15" fill="${u.text}">Γιάννης</text>
    <text x="62" y="101" font-family="Inter" font-size="12" fill="${u.textDim}">Περιμένει · pips 167</text></g>`);
  // Match score (top right).
  s.push(`<g transform="translate(385 0)" text-anchor="end">
    <text x="0" y="84" font-family="Liberation Serif, serif" font-weight="700" font-size="17" fill="${u.text}">0 – 0</text>
    <text x="0" y="101" font-family="Inter" font-size="12" fill="${u.textDim}">Πόρτες · στους 5</text></g>`);
  s.push(`<g transform="translate(236 76)"><rect width="34" height="26" rx="8" fill="${u.chipBg}" stroke="${u.chipBorder}" stroke-width="1"/>
    <path d="M10 9h14M10 13h14M10 17h14" stroke="${u.text}" stroke-width="1.8" stroke-linecap="round"/></g>`);

  // You (bottom): turn indicator in the centre, Undo left, Confirm right.
  const yb = 784;
  s.push(`<g filter="url(#shadowSoft)">
    <rect x="12" y="${yb - 23}" width="104" height="46" rx="14" fill="${u.btn2Bg}" stroke="${u.btn2Border}" stroke-width="1"/>
    <path d="M30 ${yb - 4} a7 7 0 1 1 2 6" fill="none" stroke="${u.btn2Text}" stroke-width="2" stroke-linecap="round"/>
    <path d="M26.5 ${yb - 8} l3.8 4.6 4.6 -3.6" fill="none" stroke="${u.btn2Text}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="50" y="${yb + 5}" font-family="Inter" font-weight="600" font-size="14.5" fill="${u.btn2Text}">Πίσω</text>
  </g>`);
  s.push(`<g filter="url(#shadowSoft)">
    <rect x="277" y="${yb - 23}" width="104" height="46" rx="14" fill="${u.btnBg}" stroke="${u.btnBorder}" stroke-width="1"/>
    <rect x="278" y="${yb - 22}" width="102" height="22" rx="13" fill="#fff" opacity="${u.btnGloss}"/>
    <path d="M293 ${yb} l5 5 10 -11" fill="none" stroke="${u.btnText}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="315" y="${yb + 5}" font-family="Inter" font-weight="700" font-size="14.5" fill="${u.btnText}">Τέλος</text>
  </g>`);
  s.push(avatar(C, 152, yb, 'Ο', 'w', true));
  s.push(`<text x="179" y="${yb - 3}" font-family="Inter" font-weight="700" font-size="15" fill="${u.turnText}">Σειρά σου</text>
    <text x="179" y="${yb + 14}" font-family="Inter" font-size="12" fill="${u.textDim}">Εσύ · pips 167</text>`);
  // Home indicator.
  s.push(`<rect x="129.5" y="836" width="134" height="5" rx="2.5" fill="${u.statusText}" opacity="0.85"/>`);
  return s.join('\n');
}

// --------------------------------------------------------------- page ----
function page(C) {
  const { w, h } = SCREEN;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<title>${C.title}</title>
<defs>
${commonDefs()}
${C.defs()}
</defs>
${C.background()}
${statusBar(C)}
${boardSVG(C)}
${checkersSVG(C)}
${highlightsSVG(C)}
${C.lamp ? C.lamp() : ''}
${dieSVG(C, 5, L.cx - 21, L.botY0 + 3 * L.pw + 2, -11)}
${dieSVG(C, 3, L.cx + 22, L.botY0 + 3 * L.pw - 3, 9)}
${hud(C)}
</svg>`;
}

// ------------------------------------------------------------ concepts ----
// Concept A: light olive wood with geometric inlay.
const A = {
  title: 'Tavlaki concept A: olive inlay',
  file: 'concept-a',
  png: 'concept-a-olive-inlay',
  seed: 11,
  innerShadow: 0.5,
  sheen: 0.9,
  seamColor: '#2a1a10',
  checker: {
    w: { base: '#EADDC2', pattern: 'chkMaple', grooves: [0.72, 0.4], groove: 0.32, grooveLight: 0.55, rim: 0.7, edge: '#6B5232', dome: 'dome' },
    b: { base: '#4A2E1E', pattern: 'chkWalnut', grooves: [0.72, 0.4], groove: 0.5, grooveLight: 0.22, rim: 0.85, edge: '#1E120A', ring: '#B89A78', dome: 'domeDark' },
  },
  dice: { side: '#CDBB98', face: '#F3EAD7', pip: '#3B2416', edge: '#8F7A55' },
  hl: { select: '#F2C14E', target: '#F2C14E', halo: '#2A1A10' },
  ui: {
    statusText: '#2B2016', text: '#33261A', textDim: '#7A6650', turn: '#C98A1B', turnText: '#7A4A0E',
    avatarBg: '#E9DCC1', avatarRing: '#B49C74', avatarText: '#4A3423',
    chipBg: '#F4ECDB', chipBorder: '#CDBB98',
    btnBg: '#4A2E1E', btnBorder: '#2A1A10', btnText: '#F3EAD7', btnGloss: 0.08,
    btn2Bg: '#F4ECDB', btn2Border: '#CDBB98', btn2Text: '#4A3423',
  },
  defs() {
    const p = [];
    p.push(texPattern('field', 'a-field-olive.jpg', 230, 90, 4, 0));
    p.push(texPattern('tray', 'a-frame-olive-streak.jpg', 220, 0, 0, 10));
    p.push(texPattern('frameH', 'a-frame-olive-streak.jpg', 260, 0, 0, 30));
    p.push(texPattern('frameV', 'a-frame-olive-streak.jpg', 260, 90, 60, 0));
    p.push(texPattern('pointDark', 'a-point-wenge.jpg', 150, 0));
    p.push(texPattern('pointLight', 'a-point-mahogany.jpg', 150, 0, 20, 10));
    p.push(texPattern('maple', 'a-checker-maple.jpg', 80, 90));
    for (let i = 0; i < 4; i++) {
      p.push(texPattern('chkMaple' + i, 'a-checker-maple.jpg', 46, i * 45 + 10, i * 13, i * 7));
      p.push(texPattern('chkWalnut' + i, 'a-checker-walnut.jpg', 46, i * 45 + 30, i * 11, i * 5));
    }
    p.push(`<radialGradient id="bgA" cx="0.5" cy="0.45" r="0.8">
      <stop offset="0" stop-color="#F6EFE1"/><stop offset="0.7" stop-color="#E9DDC6"/><stop offset="1" stop-color="#D9C8A8"/></radialGradient>`);
    // Dog-tooth banding (light/dark triangles) for the frame inlay.
    p.push(`<pattern id="dogtooth" patternUnits="userSpaceOnUse" width="6" height="4.4">
      <rect width="6" height="4.4" fill="#2E1E14"/><polygon points="0,4.4 3,0 6,4.4" fill="#E7D7B6"/></pattern>`);
    p.push(`<pattern id="dogtoothV" patternUnits="userSpaceOnUse" width="4.4" height="6">
      <rect width="4.4" height="6" fill="#2E1E14"/><polygon points="4.4,0 0,3 4.4,6" fill="#E7D7B6"/></pattern>`);
    p.push(meanderPattern('meander', 9, '#E9DAB8', '#3A2618'));
    return p.join('\n');
  },
  background() {
    return `<rect width="393" height="852" fill="url(#bgA)"/><rect width="393" height="852" fill="#7a5a30" filter="url(#grain)" opacity="0.6"/>`;
  },
  frameInlay() {
    const s = [];
    // Dog-tooth banding around the outer frame, inlaid mid-rail.
    const t = 4.4, o = (L.f - t) / 2;
    const x0 = L.bx + o, y0 = L.by + o, x1 = L.bx + L.bw - o, y1 = L.by + L.bh - o;
    s.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${t}" fill="url(#dogtooth)"/>`);
    s.push(`<rect x="${x0}" y="${y1 - t}" width="${x1 - x0}" height="${t}" fill="url(#dogtooth)" transform="rotate(180 ${(x0 + x1) / 2} ${y1 - t / 2})"/>`);
    s.push(`<rect x="${x0}" y="${y0 + t}" width="${t}" height="${y1 - y0 - 2 * t}" fill="url(#dogtoothV)"/>`);
    s.push(`<rect x="${x1 - t}" y="${y0 + t}" width="${t}" height="${y1 - y0 - 2 * t}" fill="url(#dogtoothV)" transform="rotate(180 ${x1 - t / 2} ${(y0 + y1) / 2})"/>`);
    s.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="#1c120b" stroke-opacity="0.55" stroke-width="0.5"/>`);
    s.push(`<rect x="${x0 + t}" y="${y0 + t}" width="${x1 - x0 - 2 * t}" height="${y1 - y0 - 2 * t}" fill="none" stroke="#1c120b" stroke-opacity="0.55" stroke-width="0.5"/>`);
    // Re-draw the fold seam over the banding.
    s.push(`<line x1="${L.bx}" y1="${L.seam}" x2="${L.bx + L.bw}" y2="${L.seam}" stroke="#120a05" stroke-width="1.4"/>`);
    // Meander (Greek key) bands on both halves of the bar.
    const mh = 9, tile = (10 * mh) / 9;
    const mw = Math.floor((L.ix1 - L.ix0 - 16) / tile) * tile + tile / 5; // whole keys
    const mx = L.cx - mw / 2;
    for (const y of [L.barY0 + 3.5, L.barY0 + 21.5]) {
      s.push(`<rect x="${mx}" y="${y}" width="${mw}" height="${mh}" fill="url(#meander)" transform="translate(0 0)"/>`);
      s.push(`<rect x="${mx}" y="${y}" width="${mw}" height="${mh}" fill="none" stroke="#1c120b" stroke-opacity="0.55" stroke-width="0.6"/>`);
    }
    return s.join('\n');
  },
  pointInlay(g, dark) {
    // Inner core triangle in a contrasting wood, plus maple stringing.
    const inset = 7.5;
    const b0 = [g.baseX + g.dir * 3.2, g.top + inset];
    const b1 = [g.baseX + g.dir * 3.2, g.top + L.pw - inset];
    const tp = [g.baseX + g.dir * (L.pointLen - 30), g.mid];
    return `<polygon points="${poly([b0, b1, tp])}" fill="url(#${dark ? 'pointLight' : 'pointDark'})" opacity="0.9"/>
      <polygon points="${poly([b0, b1, tp])}" fill="none" stroke="url(#maple)" stroke-width="1" stroke-opacity="0.85"/>`;
  },
};

// Concept B: dark walnut kafeneio board, worn and warm, brass hinges.
const B = {
  title: 'Tavlaki concept B: walnut kafeneio',
  file: 'concept-b',
  png: 'concept-b-walnut-kafeneio',
  seed: 23,
  innerShadow: 0.7,
  sheen: 0.8,
  seamColor: '#120a05',
  checker: {
    w: { base: '#ECE2CB', resin: 0.25, dish: 'dish', grooves: [0.86], groove: 0.28, grooveLight: 0.6, rim: 0.65, edge: '#6E5A3C', dome: 'dome' },
    b: { base: '#1E1A17', resin: 0.03, dish: 'dishDark', grooves: [0.86], groove: 0.6, grooveLight: 0.2, rim: 1, edge: '#000', ring: '#8C8279', dome: 'domeDark' },
  },
  dice: { side: '#C9BB9C', face: '#F1E8D3', pip: '#151210', onePip: '#A3241C', edge: '#857352' },
  hl: { select: '#F2C14E', target: '#F2C14E', halo: '#120a05' },
  ui: {
    statusText: '#F1E6CF', text: '#F1E6CF', textDim: '#BFA987', turn: '#F2C14E', turnText: '#F6D27A',
    avatarBg: '#3A271A', avatarRing: '#8E6E45', avatarText: '#F1E6CF',
    chipBg: '#2E1F15', chipBorder: '#5C4330',
    btnBg: '#C89B45', btnBorder: '#7A531A', btnText: '#22160C', btnGloss: 0.22,
    btn2Bg: '#2E1F15', btn2Border: '#6A4E35', btn2Text: '#EADCC0',
  },
  defs() {
    const p = [];
    p.push(texPattern('field', 'b-field-walnut.jpg', 250, 90, 75, 0));
    p.push(texPattern('tray', 'b-frame-worn-walnut.jpg', 220, 0));
    p.push(texPattern('frameH', 'b-frame-worn-walnut.jpg', 280, 0, 0, 40));
    p.push(texPattern('frameV', 'b-frame-worn-walnut.jpg', 280, 90, 80, 0));
    p.push(texPattern('pointDark', 'b-point-ebony.jpg', 150, 0));
    p.push(texPattern('pointLight', 'b-point-bone.jpg', 160, 0, 30, 10));
    p.push(`<radialGradient id="bgB" cx="0.5" cy="0.42" r="0.85">
      <stop offset="0" stop-color="#3B2A1D"/><stop offset="0.65" stop-color="#22170F"/><stop offset="1" stop-color="#120C07"/></radialGradient>`);
    p.push(`<radialGradient id="lamp" cx="0.5" cy="0.4" r="0.7">
      <stop offset="0" stop-color="#FFC070" stop-opacity="0.32"/><stop offset="0.6" stop-color="#FF9A40" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient>`);
    p.push(`<radialGradient id="rub" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#F0D9AE" stop-opacity="0.35"/><stop offset="1" stop-color="#F0D9AE" stop-opacity="0"/></radialGradient>`);
    p.push(`<radialGradient id="grime" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a0c02" stop-opacity="0.45"/></radialGradient>`);
    return p.join('\n');
  },
  background() {
    return `<rect width="393" height="852" fill="url(#bgB)"/><rect width="393" height="852" fill="#000" filter="url(#grain)" opacity="0.9"/>`;
  },
  lamp() {
    // Warm light from a kafeneio lamp above the table; edges fall off.
    return `<rect width="393" height="852" fill="url(#lamp)" style="mix-blend-mode:soft-light"/>`;
  },
  fieldWear(r, R) {
    const s = [];
    // Darker grime toward the edges, lighter rubs where hands slide checkers.
    s.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#grime)"/>`);
    for (let i = 0; i < 6; i++) {
      const left = R() < 0.5;
      const x = left ? r.x + 20 + R() * 60 : r.x + r.w - 20 - R() * 60;
      const y = r.y + 10 + R() * (r.h - 20);
      s.push(`<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(30 + R() * 30)}" ry="${f2(10 + R() * 10)}" fill="url(#rub)" opacity="0.5"/>`);
    }
    // Fine scratches.
    for (let i = 0; i < 26; i++) {
      const x = r.x + R() * r.w, y = r.y + R() * r.h;
      const len = 8 + R() * 34, a = (R() - 0.5) * 0.9 + (R() < 0.5 ? 0 : Math.PI / 2);
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      const cxp = (x + x2) / 2 + (R() - 0.5) * 6, cyp = (y + y2) / 2 + (R() - 0.5) * 6;
      s.push(`<path d="M${f2(x)} ${f2(y)} Q${f2(cxp)} ${f2(cyp)} ${f2(x2)} ${f2(y2)}" fill="none" stroke="#F5E3C0" stroke-opacity="${f2(0.08 + R() * 0.12)}" stroke-width="${f2(0.3 + R() * 0.4)}"/>`);
    }
    return s.join('\n');
  },
  frameWear(R) {
    const s = [];
    const { bx, by, bw, bh } = L;
    s.push(`<clipPath id="boardClip"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5"/></clipPath><g clip-path="url(#boardClip)">`);
    // Worn, lighter outer edges and corners.
    s.push(`<rect x="${bx + 0.8}" y="${by + 0.8}" width="${bw - 1.6}" height="${bh - 1.6}" rx="5" fill="none" stroke="#D9B98A" stroke-opacity="0.22" stroke-width="1.6" filter="url(#blur1)"/>`);
    for (const [x, y] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh], [bx, L.seam], [bx + bw, L.seam]]) {
      s.push(`<circle cx="${x}" cy="${y}" r="9" fill="url(#rub)" opacity="0.9"/>`);
    }
    // A faint old coffee ring on the top rail.
    s.push(`<circle cx="332" cy="${by + bh - 4}" r="15" fill="none" stroke="#120700" stroke-opacity="0.22" stroke-width="1.6" filter="url(#blur1)"/>`);
    for (let i = 0; i < 14; i++) {
      const x = bx + R() * bw, y = R() < 0.5 ? by + R() * L.f : by + bh - R() * L.f;
      s.push(`<line x1="${f2(x)}" y1="${f2(y)}" x2="${f2(x + 6 + R() * 14)}" y2="${f2(y + (R() - 0.5) * 2)}" stroke="#E9CFA2" stroke-opacity="0.13" stroke-width="0.5"/>`);
    }
    s.push('</g>');
    return s.join('\n');
  },
  hardware() {
    const s = [];
    // Two brass hinges across the fold, and brass clasp plates.
    for (const cx of [L.bx + 36, L.bx + L.bw - 36]) {
      const w = 34, h = 18, x = cx - w / 2, y = L.seam - h / 2;
      s.push(`<g filter="url(#shadowSoft)">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="url(#brass)"/>
        <rect x="${x}" y="${L.seam - 2.4}" width="${w}" height="4.8" rx="2.4" fill="url(#brassH)"/>
        <line x1="${x + w / 3}" y1="${L.seam - 2.4}" x2="${x + w / 3}" y2="${L.seam + 2.4}" stroke="#5a3c10" stroke-width="0.6"/>
        <line x1="${x + 2 * w / 3}" y1="${L.seam - 2.4}" x2="${x + 2 * w / 3}" y2="${L.seam + 2.4}" stroke="#5a3c10" stroke-width="0.6"/>
        ${[[x + 6, y + 3.6], [x + w - 6, y + 3.6], [x + 6, y + h - 3.6], [x + w - 6, y + h - 3.6]].map(([sx, sy]) =>
          `<circle cx="${sx}" cy="${sy}" r="1.9" fill="#8a6422"/><line x1="${sx - 1.3}" y1="${sy - 0.4}" x2="${sx + 1.3}" y2="${sy + 0.4}" stroke="#4a320c" stroke-width="0.5"/>`).join('')}
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="none" stroke="#5a3c10" stroke-width="0.6"/>
      </g>`);
    }
    for (const y of [L.by - 1.5, L.by + L.bh - 5.5]) {
      s.push(`<g filter="url(#shadowSoft)"><rect x="${L.cx - 11}" y="${y}" width="22" height="7" rx="1.5" fill="url(#brass)" stroke="#5a3c10" stroke-width="0.5"/>
        <circle cx="${L.cx}" cy="${y + 3.5}" r="1.6" fill="#6a4a14"/></g>`);
    }
    // Brass corner caps.
    const c = 11;
    for (const [x, y, sx, sy] of [[L.bx, L.by, 1, 1], [L.bx + L.bw, L.by, -1, 1], [L.bx, L.by + L.bh, 1, -1], [L.bx + L.bw, L.by + L.bh, -1, -1]]) {
      s.push(`<path d="M${x} ${y + sy * c} V${y + sy * 3} Q${x} ${y} ${x + sx * 3} ${y} H${x + sx * c} L${x + sx * c * 0.55} ${y + sy * 2.6} H${x + sx * 2.6} V${y + sy * c * 0.55} Z" fill="url(#brass)" stroke="#5a3c10" stroke-width="0.5" opacity="0.95"/>`);
    }
    return s.join('\n');
  },
};

function meanderPattern(id, h, light, dark) {
  // A simple Greek key (meander) tile, h tall and 2h wide.
  const u = h / 9;
  const w = 10 * u;
  const d = `M0 ${8 * u} H${8 * u} V${u} H${2 * u} V${6 * u} H${6 * u} V${3 * u} H${4 * u} V${4 * u}`;
  const x0 = L.cx - (Math.floor((L.ix1 - L.ix0 - 16) / w) * w + w / 5) / 2;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${h}" x="${x0}" y="${L.barY0 + 4}">
    <rect width="${w}" height="${h}" fill="${dark}"/>
    <path d="${d} M${8 * u} ${8 * u} H${w}" fill="none" stroke="${light}" stroke-width="${u * 1.1}" stroke-linecap="square"/></pattern>`;
}

// --------------------------------------------------- orientation sketch ----
function orientationSVG() {
  // Two phone outlines at the same scale: board inside portrait vs turned 90.
  const s = [];
  const phone = (x, label, sub, inner) => `<g transform="translate(${x} 40)">
    <rect x="0" y="0" width="196" height="425" rx="28" fill="#F6EFE1" stroke="#3B2A1E" stroke-width="3"/>
    <rect x="70" y="8" width="56" height="15" rx="7.5" fill="#3B2A1E"/>
    ${inner}
    <text x="98" y="455" text-anchor="middle" font-family="Inter" font-weight="700" font-size="14" fill="#3B2A1E">${label}</text>
    <text x="98" y="474" text-anchor="middle" font-family="Inter" font-size="11.5" fill="#6B5640">${sub}</text></g>`;
  const pts = (x0, y0, w, h, n, vertical) => {
    const o = [];
    for (let i = 0; i < n; i++) {
      const c = i % 2 ? '#8C3F25' : '#3B2A20';
      if (vertical) { const pw = w / n; o.push(`<polygon points="${x0 + i * pw},${y0} ${x0 + (i + 1) * pw},${y0} ${x0 + (i + 0.5) * pw},${y0 + h}" fill="${c}"/>`); }
      else { const ph = h / n; o.push(`<polygon points="${x0},${y0 + i * ph} ${x0},${y0 + (i + 1) * ph} ${x0 + w},${y0 + (i + 0.5) * ph}" fill="${c}"/>`); }
    }
    return o.join('');
  };
  // (1) landscape board inside portrait: board 188 x 118 (scale 0.5 of pt).
  const a = (() => {
    const bx = 4, by = 150, bw = 188, bh = 118;
    const pw = (bw - 14 - 11 - 11) / 12; // frame 7, bar 11, tray 11
    const o = [`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="#8E6A40"/>`];
    const fx = bx + 7, fy = by + 7, fh = bh - 14;
    o.push(`<rect x="${fx}" y="${fy}" width="${6 * pw}" height="${fh}" fill="#D3BA8C"/><rect x="${fx + 6 * pw + 11}" y="${fy}" width="${6 * pw}" height="${fh}" fill="#D3BA8C"/>`);
    for (const x of [fx, fx + 6 * pw + 11]) { o.push(pts(x, fy, 6 * pw, fh * 0.42, 6, true)); o.push(`<g transform="rotate(180 ${x + 3 * pw} ${fy + fh / 2})">${pts(x, fy, 6 * pw, fh * 0.42, 6, true)}</g>`); }
    o.push(`<circle cx="${fx + pw / 2}" cy="${fy + fh - pw / 2}" r="${pw / 2 - 0.3}" fill="#EADDC2" stroke="#6B5232"/>`);
    return o.join('');
  })();
  // (2) turned 90: board 188 x 302.
  const b = (() => {
    const bx = 4, by = 59, bw = 188, bh = 302;
    const pw = (bh - 13 - 17 - 30) / 12;
    const o = [`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="#8E6A40"/>`];
    const fx = bx + 6.5, fw = bw - 13;
    const y0 = by + 6.5, y1 = y0 + 6 * pw + 17;
    o.push(`<rect x="${fx}" y="${y0}" width="${fw}" height="${6 * pw}" fill="#D3BA8C"/><rect x="${fx}" y="${y1}" width="${fw}" height="${6 * pw}" fill="#D3BA8C"/>`);
    o.push(`<rect x="${fx}" y="${y1 + 6 * pw + 4.5}" width="${fw}" height="${bh - 6.5 - (y1 + 6 * pw + 4.5 - by)}" fill="#6F5233"/>`);
    for (const y of [y0, y1]) { o.push(pts(fx, y, fw * 0.43, 6 * pw, 6, false)); o.push(`<g transform="rotate(180 ${fx + fw / 2} ${y + 3 * pw})">${pts(fx, y, fw * 0.43, 6 * pw, 6, false)}</g>`); }
    o.push(`<circle cx="${fx + pw / 2 + 0.5}" cy="${y1 + 5.5 * pw}" r="${pw / 2 - 0.5}" fill="#EADDC2" stroke="#6B5232"/>`);
    return o.join('');
  })();
  s.push(phone(20, 'Option 1: landscape board', 'checker ≈ 25 pt · empty space', a));
  s.push(phone(250, 'Option 2: turned 90°', `recommended · checker ${L.checkerD} pt`, b));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="466" height="530" viewBox="0 0 466 530">
  <title>Board orientation options</title>
  <rect width="466" height="530" fill="#FBF7EF"/>
  <text x="233" y="26" text-anchor="middle" font-family="Inter" font-weight="700" font-size="16" fill="#3B2A1E">Same phone (393 × 852 pt), drawn at 50 %</text>
  ${s.join('\n')}</svg>`;
}

// ------------------------------------------------------------- render -----
async function render() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const jobs = [
    { svg: page(A), name: A.file, png: A.png, w: SCREEN.w, h: SCREEN.h, scale: 3 },
    { svg: page(B), name: B.file, png: B.png, w: SCREEN.w, h: SCREEN.h, scale: 3 },
    { svg: orientationSVG(), name: 'orientation', png: 'orientation', w: 466, h: 530, scale: 2 },
  ];
  for (const j of jobs) {
    const svgPath = path.join(OUT_SRC, j.name + '.svg');
    fs.writeFileSync(svgPath, j.svg);
    const ctx = await browser.newContext({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.scale });
    const pg = await ctx.newPage();
    await pg.goto('file://' + svgPath);
    await pg.waitForTimeout(300);
    if (process.env.MASTER_DIR) {
      const master = path.join(process.env.MASTER_DIR, j.png + '@' + j.scale + 'x.png');
      await pg.screenshot({ path: master });
      console.log('rendered', master);
    }
    await ctx.close();
    // Committed preview: half of @3x for the phone screens (590 x 1278).
    const small = await browser.newContext({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.scale / 2 });
    const sp = await small.newPage();
    await sp.goto('file://' + svgPath);
    await sp.waitForTimeout(300);
    const out = path.join(OUT_DIR, j.png + '.png');
    await sp.screenshot({ path: out });
    await small.close();
    console.log('rendered', out);
  }
  await browser.close();
}

render().catch((e) => { console.error(e); process.exit(1); });
