import { radii, spacing, touch, typography } from '../tokens';
import type { AppTheme } from './types';

/**
 * "Olive Inlay" app colors (#528, Figma "13 Matching color themes"): the
 * first light theme, made for the Olive Inlay board. The sunlit island
 * kafeneio: cream olive wood, walnut text and mahogany buttons, like the
 * board's inlaid points.
 *
 * A light theme turns some roles around: the "deep" background and the
 * floor are a darker cream, not near black, and `accentLight` is only one
 * step lighter than the mahogany `accent`, so brass-style text stays dark
 * enough on cream.
 */
export const oliveInlay = {
  id: 'olive-inlay',
  scheme: 'light',
  colors: {
    background: '#EDE2C8',
    backgroundDeep: '#E4D5B4',
    // The lamp at the top is a lighter cream, the floor a sunlit tan.
    backgroundLamp: '#F6EEDC',
    backgroundFloor: '#E2D1AE',
    surface: '#F6EEDC',
    surfaceSelected: '#EADCBE',
    surfaceRaised: '#FFF9EC',
    surfaceSunken: '#E6D8B9',
    border: '#CDB994',
    edgeLight: '#FFFDF6',
    separator: '#E2D4B4',
    text: '#2E1E14',
    textDim: '#6B5232',
    textDisabled: '#76603F',
    textFaint: '#8A7553',
    accent: '#8A3B22',
    // One step lighter than `accent`: the lit edge of the mahogany button.
    accentLight: '#963F24',
    onAccent: '#FFF9EC',
    accentPressed: '#73301B',
    accentMuted: '#D3BFA2',
    onAccentMuted: '#6E5636',
    // `accent` over `surface` at 12% and 45%.
    accentWash: '#E9D9C6',
    accentLine: '#C59D88',
    problem: '#A3392B',
    problemWash: '#F3DDD0',
    problemLine: '#B5594A',
    problemPressed: '#EFD3C5',
    turn: '#9A6418',
    // `turn` is a ring; as text it needs a darker amber on cream.
    turnText: '#7E520F',
    switchTrackOff: '#8F7A58',
    switchThumb: '#FFF9EC',
  },
  // The Olive Inlay board's own colors (`packages/themes/olive-inlay`).
  board: {
    frame: '#8E6A40',
    field: '#D4BB8D',
    pointDark: '#3B2A20',
    pointLight: '#7E3521',
    brass: '#A8742A',
    brassLight: '#E7D7B6',
    brassDark: '#6B4A1E',
    wear: '#FFF3D6',
  },
  checker: {
    light: '#EADDC2',
    lightEdge: '#6B5232',
    dark: '#4A2E1E',
    darkRing: '#B89A78',
  },
  // The same four woods as every theme; only the ring that marks you is mahogany.
  avatar: {
    bone: { face: '#EADDC2', center: '#E0D1B2', ring: '#EFE4CD', rim: '#6B5232', text: '#4A2E1E' },
    maple: { face: '#B98B5A', center: '#AD7F50', ring: '#C79B6B', rim: '#6B4A2A', text: '#2A1A10' },
    walnut: {
      face: '#4A2E1E',
      center: '#553624',
      ring: '#42291B',
      rim: '#B89A78',
      text: '#EADDC2',
    },
    ebony: { face: '#1E1A17', center: '#2A2420', ring: '#1A1613', rim: '#8C8279', text: '#ECE2CB' },
    you: '#8A3B22',
  },
  highlight: {
    select: '#F2C14E',
    halo: '#2A1A10',
  },
  dice: {
    face: '#F3EAD7',
    side: '#CDBB98',
    edge: '#8F7A55',
    pip: '#3B2416',
    acePip: '#7E3521',
  },
  space: spacing,
  radii,
  type: typography,
  touch,
} as const satisfies AppTheme;
