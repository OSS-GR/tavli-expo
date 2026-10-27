// App icon art for Tavlaki, as SVG strings on a 1024 x 1024 canvas.
//
// Colors come from the Walnut Kafeneio palette (`packages/themes/walnut-kafeneio/theme.json`).
// Wood comes from the theme's CC0 textures (`packages/themes/tools/walnut-kafeneio/textures`).
// Checkers and dice follow the theme's checker and dice styles, a little bolder,
// so they still read at 60 x 60 px.
//
// Each concept has the same parts:
//   base          the wood texture that fills the whole square
//   board(pal)    board parts behind the motif (points, inlays)
//   motif()       the main shapes, centred, inside a circle of radius MOTIF_R
//   mono()        the motif as a white silhouette (Android themed icon, iOS tinted icon)
// `build-icons.mjs` puts the parts together for each platform.

export const SIZE = 1024;
const C = SIZE / 2;

/** The motif fits in this circle around the centre (full icon scale). */
export const MOTIF_R = 410;

const n = (v) => Math.round(v * 100) / 100;

/** Shared <defs>: texture patterns, the lamp, shadows. */
export function defs(tex, pal) {
  return `
  <pattern id="tex-field" patternUnits="userSpaceOnUse" width="1400" height="1400" patternTransform="rotate(90 512 512) translate(-180 -120)">
    <image href="${tex.field}" width="1400" height="1400"/>
  </pattern>
  <pattern id="tex-frame" patternUnits="userSpaceOnUse" width="1200" height="1200" patternTransform="translate(-90 -60)">
    <image href="${tex.frame}" width="1200" height="1200"/>
  </pattern>
  <pattern id="tex-bone" patternUnits="userSpaceOnUse" width="700" height="700" patternTransform="rotate(90 512 512)">
    <image href="${tex.bone}" width="700" height="700"/>
  </pattern>
  <pattern id="tex-ebony" patternUnits="userSpaceOnUse" width="700" height="700" patternTransform="rotate(90 512 512)">
    <image href="${tex.ebony}" width="700" height="700"/>
  </pattern>
  <radialGradient id="lamp" cx="0.42" cy="0.34" r="0.78">
    <stop offset="0" stop-color="${pal['light.lamp']}" stop-opacity="0.55"/>
    <stop offset="0.55" stop-color="#FF9A40" stop-opacity="0.12"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.62"/>
  </radialGradient>
  <radialGradient id="vignette" cx="0.46" cy="0.42" r="0.78">
    <stop offset="0.35" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.6"/>
  </radialGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${pal['board.brass.light']}"/>
    <stop offset="0.45" stop-color="${pal['board.brass']}"/>
    <stop offset="1" stop-color="${pal['board.brass.dark']}"/>
  </linearGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="16"/>
  </filter>
  <filter id="shadow-soft" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="28"/>
  </filter>`;
}

/** The warm overhead lamp and the dark edges, over the whole square. */
const lamp = (strength = 1) => `
  <rect width="${SIZE}" height="${SIZE}" fill="url(#lamp)" style="mix-blend-mode:soft-light" opacity="${strength}"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#vignette)" opacity="${strength}"/>`;

/** iOS dark appearance: the same wood, much dimmer. */
const dim = (variant) =>
  variant === 'dark'
    ? `<rect width="${SIZE}" height="${SIZE}" fill="#8C7258" style="mix-blend-mode:multiply"/>`
    : '';

/**
 * The opaque background: the base wood, the board parts scaled by `k` around
 * the centre (so they line up with a motif at the same scale), then the lamp.
 */
export function background(concept, pal, { k = 1, variant = 'light' } = {}) {
  return `
  <rect width="${SIZE}" height="${SIZE}" fill="url(#tex-${concept.base})"/>
  <g transform="${scaleAt(k)}">${concept.board(pal)}</g>
  ${lamp()}
  ${dim(variant)}`;
}

/** A transform that scales by `k` around the centre of the square. */
export const scaleAt = (k) => `translate(${C} ${C}) scale(${k}) translate(${-C} ${-C})`;

// ---------------------------------------------------------------------------
// Shared pieces

let uid = 0;
const id = (p) => `${p}${++uid}`;

/** A checker in the theme style: resin, dished centre, groove, rim. */
function checker(pal, cx, cy, r, tone) {
  const light = tone === 'light';
  const fill = light ? pal['checker.light'] : pal['checker.dark'];
  const rim = light ? pal['checker.light.edge'] : '#000000';
  const hl = id('chl');
  const dish = id('cdish');
  const bevel = id('cbev');
  const grooveOp = light ? 0.3 : 0.65;
  const lightOp = light ? 0.6 : 0.22;
  return `
  <defs>
    <radialGradient id="${hl}" cx="0.36" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#FFF" stop-opacity="${light ? 0.45 : 0.22}"/>
      <stop offset="0.45" stop-color="#FFF" stop-opacity="${light ? 0.06 : 0.03}"/>
      <stop offset="0.8" stop-color="#000" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#000" stop-opacity="${light ? 0.38 : 0.3}"/>
    </radialGradient>
    <radialGradient id="${dish}" cx="0.62" cy="0.66" r="0.8">
      <stop offset="0" stop-color="#FFF" stop-opacity="${light ? 0.3 : 0.06}"/>
      <stop offset="0.55" stop-color="#FFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="${light ? 0.3 : 0.38}"/>
    </radialGradient>
    <linearGradient id="${bevel}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="#FFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <circle cx="${n(cx + 0.07 * r)}" cy="${n(cy + 0.13 * r)}" r="${n(r)}" fill="#000" opacity="0.6" filter="url(#shadow)"/>
  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"/>
  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${hl})"/>
  <circle cx="${n(cx + 0.0225 * r)}" cy="${n(cy + 0.025 * r)}" r="${n(0.84 * r)}" fill="none" stroke="#FFF" stroke-opacity="${lightOp}" stroke-width="${n(0.03 * r)}"/>
  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(0.84 * r)}" fill="none" stroke="#000" stroke-opacity="${grooveOp}" stroke-width="${n(0.04 * r)}"/>
  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(0.56 * r)}" fill="url(#${dish})"/>
  <circle cx="${n(cx + 0.025 * r)}" cy="${n(cy + 0.03 * r)}" r="${n(0.56 * r)}" fill="none" stroke="#FFF" stroke-opacity="${lightOp}" stroke-width="${n(0.03 * r)}"/>
  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(0.56 * r)}" fill="none" stroke="#000" stroke-opacity="${grooveOp}" stroke-width="${n(0.045 * r)}"/>
  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(0.915 * r)}" fill="none" stroke="url(#${bevel})" stroke-opacity="${light ? 0.65 : 0.9}" stroke-width="${n(0.07 * r)}"/>
  ${light ? '' : `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(0.91 * r)}" fill="none" stroke="${pal['checker.dark.ring']}" stroke-width="${n(0.06 * r)}"/>`}
  <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(0.975 * r)}" fill="none" stroke="${rim}" stroke-width="${n(0.05 * r)}"/>`;
}

/** A backgammon point (triangle) with its wood texture and a thin seam. */
function point(x0, x1, yBase, yTip, wood) {
  const mid = (x0 + x1) / 2;
  const d = `M${n(x0)} ${n(yBase)} L${n(mid)} ${n(yTip)} L${n(x1)} ${n(yBase)} Z`;
  return `
  <path d="${d}" fill="url(#tex-${wood})"/>
  <path d="${d}" fill="none" stroke="#120A05" stroke-opacity="0.55" stroke-width="5" stroke-linejoin="round"/>`;
}

const PIPS = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** An ivory die (theme dice style), seen from above, with a bit of side. */
function die(pal, cx, cy, s, value, tilt) {
  const rx = 0.197 * s;
  const hl = id('dhl');
  const x = cx - s / 2;
  const y = cy - s / 2;
  const pr = 0.105 * s;
  const sp = 0.26 * s;
  const pips = PIPS[value]
    .map(
      ([u, v]) => `
      <circle cx="${n(cx + u * sp)}" cy="${n(cy + v * sp + 0.012 * s)}" r="${n(pr)}" fill="#FFF" opacity="0.5"/>
      <circle cx="${n(cx + u * sp)}" cy="${n(cy + v * sp)}" r="${n(pr)}" fill="${value === 1 ? pal['dice.pip.ace'] : pal['dice.pip']}"/>`,
    )
    .join('');
  return `
  <defs>
    <radialGradient id="${hl}" cx="0.36" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#FFF" stop-opacity="0.42"/>
      <stop offset="0.45" stop-color="#FFF" stop-opacity="0.06"/>
      <stop offset="0.8" stop-color="#000" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.38"/>
    </radialGradient>
  </defs>
  <g transform="rotate(${tilt} ${n(cx)} ${n(cy)})">
    <rect x="${n(x + 0.09 * s)}" y="${n(y + 0.14 * s)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="#000" opacity="0.6" filter="url(#shadow-soft)"/>
    <rect x="${n(x + 0.035 * s)}" y="${n(y + 0.06 * s)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="${pal['dice.side']}"/>
    <rect x="${n(x + 0.035 * s)}" y="${n(y + 0.06 * s)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="#000" opacity="0.18"/>
    <rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="${pal['dice.face']}"/>
    <rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="url(#${hl})" opacity="0.55"/>
    <rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" rx="${n(rx)}" fill="none" stroke="${pal['dice.edge']}" stroke-width="${n(0.026 * s)}"/>
    ${pips}
  </g>`;
}

/** A brass ring with a dark seam on both sides. */
function brassRing(cx, cy, r, w) {
  return `
  <circle cx="${cx}" cy="${cy}" r="${n(r)}" fill="none" stroke="#120A05" stroke-opacity="0.8" stroke-width="${n(w + 10)}"/>
  <circle cx="${cx}" cy="${cy}" r="${n(r)}" fill="none" stroke="url(#brass)" stroke-width="${n(w)}"/>
  <circle cx="${cx}" cy="${cy}" r="${n(r - w * 0.2)}" fill="none" stroke="#FFF" stroke-opacity="0.35" stroke-width="${n(w * 0.15)}"/>`;
}

/** The capital Τ (tau) as a shape: bar with small slab ends, stem with a foot. */
function tauPath(cx, top, h) {
  const bw = 0.86 * h; // bar width
  const bt = 0.2 * h; // bar thickness
  const sw = 0.24 * h; // stem width
  const fw = 0.4 * h; // foot width
  const ft = 0.07 * h; // foot thickness
  const sl = 0.06 * h; // slab ends drop
  const L = cx - bw / 2;
  const R = cx + bw / 2;
  const b = top + h;
  return [
    `M${n(L)} ${n(top)}`,
    `H${n(R)}`,
    `V${n(top + bt + sl)}`,
    `L${n(R - 0.05 * h)} ${n(top + bt)}`,
    `H${n(cx + sw / 2)}`,
    `V${n(b - ft)}`,
    `H${n(cx + fw / 2)}`,
    `V${n(b)}`,
    `H${n(cx - fw / 2)}`,
    `V${n(b - ft)}`,
    `H${n(cx - sw / 2)}`,
    `V${n(top + bt)}`,
    `H${n(L + 0.05 * h)}`,
    `L${n(L)} ${n(top + bt + sl)}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Concepts

/** A. "Pouli": an ivory and a black checker on a bone point, walnut field. */
const pouli = {
  id: 'pouli',
  name: 'Πούλια (checkers)',
  base: 'field',
  board: () => `
    ${point(150, 874, 1060, 120, 'bone')}
    ${point(-560, 140, -40, 900, 'ebony')}
    ${point(884, 1584, -40, 900, 'ebony')}`,
  motif: (pal) => `
    ${checker(pal, 648, 380, 218, 'dark')}
    ${checker(pal, 392, 642, 218, 'light')}`,
  mono: () => {
    // Two solid checkers. The front one cuts a gap into the back one. Thin
    // cuts show the groove and the dish, like the real checkers.
    const disc = (cx, cy, r) => `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFF"/>
      <circle cx="${cx}" cy="${cy}" r="${n(0.84 * r)}" fill="none" stroke="#000" stroke-width="${n(0.075 * r)}"/>
      <circle cx="${cx}" cy="${cy}" r="${n(0.56 * r)}" fill="none" stroke="#000" stroke-width="${n(0.075 * r)}"/>`;
    return `
    <defs>
      <mask id="m-pouli">
        <rect width="${SIZE}" height="${SIZE}" fill="#000"/>
        ${disc(648, 380, 218)}
        <circle cx="392" cy="642" r="250" fill="#000"/>
        ${disc(392, 642, 218)}
      </mask>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="#FFF" mask="url(#m-pouli)"/>`;
  },
};

/** B. "Zari": one ivory die (a five) on the walnut field between two points. */
const zari = {
  id: 'zari',
  name: 'Ζάρι (die)',
  base: 'field',
  board: () => `
    ${point(-120, 420, -20, 560, 'ebony')}
    ${point(604, 1144, 1044, 464, 'bone')}`,
  motif: (pal) => die(pal, 500, 492, 520, 5, -12),
  mono: () => {
    const s = 520;
    const sp = 0.26 * s;
    const holes = PIPS[5]
      .map(
        ([u, v]) =>
          `<circle cx="${n(500 + u * sp)}" cy="${n(492 + v * sp)}" r="${n(0.105 * s)}" fill="#000"/>`,
      )
      .join('');
    return `
    <defs>
      <mask id="m-zari">
        <rect width="${SIZE}" height="${SIZE}" fill="#000"/>
        <g transform="rotate(-12 500 492)">
          <rect x="240" y="232" width="${s}" height="${s}" rx="${n(0.197 * s)}" fill="#FFF"/>
          ${holes}
        </g>
      </mask>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="#FFF" mask="url(#m-zari)"/>`;
  },
};

/** C. "Tau": a bone Τ inlaid in dark walnut, inside a brass ring. */
const tau = {
  id: 'tau',
  name: 'Τ inlay',
  base: 'frame',
  board: () => `
    <circle cx="${C}" cy="${C}" r="380" fill="url(#tex-field)"/>
    <circle cx="${C}" cy="${C}" r="380" fill="#000" opacity="0.18"/>`,
  motif: () => {
    const d = tauPath(C, 300, 430);
    return `
    ${brassRing(C, C, 380, 34)}
    <path d="${d}" fill="#000" opacity="0.55" transform="translate(10 18)" filter="url(#shadow)"/>
    <path d="${d}" fill="url(#tex-bone)"/>
    <path d="${d}" fill="#FFF" opacity="0.08"/>
    <path d="${d}" fill="none" stroke="#120A05" stroke-width="10" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#FFF" stroke-opacity="0.35" stroke-width="4" stroke-linejoin="round" transform="translate(3 4)"/>`;
  },
  mono: () => `
    <circle cx="${C}" cy="${C}" r="380" fill="none" stroke="#FFF" stroke-width="44"/>
    <path d="${tauPath(C, 300, 430)}" fill="#FFF"/>`,
};

export const CONCEPTS = { pouli, zari, tau };
