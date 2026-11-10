/**
 * Line icons as SVG path data on a 24 x 24 grid, drawn by `Icon`.
 *
 * The shapes come from Lucide (lucide.dev, v0.460.0, ISC license, see
 * `docs/design/style/LICENSES.md`). Circles and rectangles are written as
 * paths, so one Skia `Path` draws each part.
 */

/** A circle as a path: two half arcs. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
}

/** A rectangle with round corners as a path. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}` +
    `a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}` +
    `v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

export interface IconShape {
  /** Parts drawn as 2 pt lines. */
  readonly strokes: readonly string[];
  /** Parts drawn filled. */
  readonly fills?: readonly string[];
}

export const ICONS = {
  settings: {
    strokes: [
      'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      circle(12, 12, 3),
    ],
  },
  bot: {
    strokes: [
      'M12 8V4H8',
      roundRect(4, 8, 16, 12, 2),
      'M2 14h2',
      'M20 14h2',
      'M15 13v2',
      'M9 13v2',
    ],
  },
  users: {
    strokes: [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      circle(9, 7, 4),
      'M22 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75',
    ],
  },
  globe: {
    strokes: [circle(12, 12, 10), 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  },
  book: {
    strokes: [
      'M12 7v14',
      'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
    ],
  },
  history: {
    strokes: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  },
  play: {
    strokes: [],
    fills: ['M7 4.5 19.5 12 7 19.5z'],
  },
  graduation: {
    strokes: [
      'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
      'M22 10v6',
      'M6 12.5V16a6 3 0 0 0 12 0v-3.5',
    ],
  },
  chevronRight: {
    strokes: ['m9 18 6-6-6-6'],
  },
  chevronLeft: {
    strokes: ['m15 18-6-6 6-6'],
  },
  check: {
    strokes: ['M20 6 9 17l-5-5'],
  },
  link: {
    strokes: [
      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
      'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    ],
  },
  // Settings rows (#360).
  checkCheck: {
    strokes: ['M18 6 7 17l-5-5', 'm22 10-7.5 7.5L13 16'],
  },
  lightbulb: {
    strokes: [
      'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
      'M9 18h6',
      'M10 22h4',
    ],
  },
  fastForward: {
    strokes: ['M13 19 22 12 13 5z', 'M2 19 11 12 2 5z'],
  },
  flipVertical: {
    strokes: [
      'm17 3-5 5-5-5h10',
      'm17 21-5-5-5 5h10',
      'M4 12H2',
      'M10 12H8',
      'M16 12h-2',
      'M22 12h-2',
    ],
  },
  gauge: {
    strokes: ['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  },
  volume: {
    strokes: [
      'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z',
      'M16 9a5 5 0 0 1 0 6',
      'M19.364 18.364a9 9 0 0 0 0-12.728',
    ],
  },
  vibrate: {
    strokes: ['m2 8 2 2-2 2 2 2-2 2', 'm22 8-2 2 2 2-2 2 2 2', roundRect(8, 5, 8, 14, 1)],
  },
  languages: {
    strokes: ['m5 8 6 6', 'm4 14 6-6 2-3', 'M2 5h12', 'M7 2h1', 'm22 22-5-10-5 10', 'M14 18h6'],
  },
  image: {
    strokes: [
      roundRect(3, 3, 18, 18, 2),
      circle(9, 9, 2),
      'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
    ],
  },
  smartphone: {
    strokes: [roundRect(5, 2, 14, 20, 2), 'M12 18h.01'],
  },
  house: {
    strokes: [
      'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
      'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    ],
  },
  palette: {
    strokes: [
      circle(13.5, 6.5, 0.5),
      circle(17.5, 10.5, 0.5),
      circle(8.5, 7.5, 0.5),
      circle(6.5, 12.5, 0.5),
      'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z',
    ],
    fills: [
      circle(13.5, 6.5, 0.5),
      circle(17.5, 10.5, 0.5),
      circle(8.5, 7.5, 0.5),
      circle(6.5, 12.5, 0.5),
    ],
  },
  list: {
    strokes: ['M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13'],
  },
  trash: {
    strokes: [
      'M3 6h18',
      'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
      'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
      'M10 11v6',
      'M14 11v6',
    ],
  },
  bell: {
    strokes: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  },
  chart: {
    strokes: ['M3 3v16a2 2 0 0 0 2 2h16', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  },
  shield: {
    strokes: [
      'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    ],
  },
  trophy: {
    strokes: [
      'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
      'M18 9h1.5a2.5 2.5 0 0 0 0-5H18',
      'M4 22h16',
      'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22',
      'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
      'M18 2H6v7a6 6 0 0 0 12 0V2Z',
    ],
  },
  // A problem: error popups and lines (#462).
  circleAlert: {
    strokes: [circle(12, 12, 10), 'M12 8v4', 'M12 16h.01'],
  },
  // Report or block a player (#435).
  flag: {
    strokes: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  },
  // Settings → Blocked players (#435).
  userX: {
    strokes: [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      circle(9, 7, 4),
      'M17 8l5 5',
      'M22 8l-5 5',
    ],
  },
  // Settings → Account (#402).
  user: {
    strokes: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', circle(12, 7, 4)],
  },
  logOut: {
    strokes: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  },
  keyRound: {
    strokes: [
      'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z',
      circle(16.5, 7.5, 0.5),
    ],
  },
  // Join with a code (#333).
  keyboard: {
    strokes: [
      'M10 8h.01',
      'M12 12h.01',
      'M14 8h.01',
      'M16 12h.01',
      'M18 8h.01',
      'M6 8h.01',
      'M7 16h10',
      'M8 12h.01',
      roundRect(2, 4, 20, 16, 2),
    ],
  },
  // What's new (#471).
  sparkles: {
    strokes: [
      'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
      'M20 3v4',
      'M22 5h-4',
      'M4 17v2',
      'M5 18H3',
    ],
  },
} as const satisfies Record<string, IconShape>;

export type IconName = keyof typeof ICONS;
