import { radii, spacing, touch, typography } from '../tokens';
import type { AppTheme } from './types';

/**
 * "Kafeneio Night" app colors (#528, Figma "13 Matching color themes"),
 * made for the Kafeneio Night board. Later and darker than Walnut: a
 * mahogany red-brown UI, with brass buttons like the board's corner plates.
 */
export const kafeneioNight = {
  id: 'kafeneio-night',
  scheme: 'dark',
  colors: {
    background: '#2A1610',
    backgroundDeep: '#0D0705',
    backgroundLamp: '#3A2017',
    backgroundFloor: '#140A07',
    surface: '#22110B',
    surfaceSelected: '#3E2219',
    surfaceRaised: '#2F1912',
    surfaceSunken: '#140A07',
    border: '#6A4630',
    edgeLight: '#4D2E21',
    separator: '#45281D',
    text: '#F3E8D6',
    textDim: '#C9AC95',
    textDisabled: '#AC9078',
    textFaint: '#8F7462',
    accent: '#C99A3E',
    accentLight: '#E0B867',
    onAccent: '#22160C',
    accentPressed: '#B0873A',
    accentMuted: '#5E3F24',
    onAccentMuted: '#B99F80',
    // `accent` over `surface` at 22% and 55%.
    accentWash: '#472F16',
    accentLine: '#7E5C27',
    problem: '#F2A48C',
    problemWash: '#552520',
    problemLine: '#B0584A',
    problemPressed: '#431D19',
    turn: '#F2C14E',
    turnText: '#F6D27A',
    switchTrackOff: '#4D2E21',
    switchThumb: '#F3E8D6',
  },
  // The Kafeneio Night board's own colors (`packages/themes/kafeneio-night`).
  board: {
    frame: '#2A160E',
    field: '#4C2015',
    pointDark: '#341917',
    pointLight: '#D9CDB2',
    brass: '#C99A3E',
    brassLight: '#F3D58A',
    brassDark: '#6E4A16',
    wear: '#FFB860',
  },
  checker: {
    light: '#EEE4CD',
    lightEdge: '#5C4630',
    dark: '#17110E',
    darkRing: '#C99A3E',
  },
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
    you: '#C99A3E',
  },
  highlight: {
    select: '#F6C858',
    halo: '#0A0403',
  },
  dice: {
    face: '#2A1A14',
    side: '#140B07',
    edge: '#8A6526',
    pip: '#E9C46A',
    acePip: '#E8735A',
  },
  space: spacing,
  radii,
  type: typography,
  touch,
} as const satisfies AppTheme;
