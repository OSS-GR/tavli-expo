import { radii, spacing, touch, typography } from '../tokens';
import type { AppTheme } from './types';

/**
 * Concept B, "walnut kafeneio" (issue #13, `docs/design/style/palette.md`).
 * Dark worn walnut board, ivory and black checkers, brass details and a warm
 * dark-brown UI.
 */
export const walnutKafeneio = {
  id: 'walnut-kafeneio',
  scheme: 'dark',
  colors: {
    background: '#3B2A1D',
    backgroundDeep: '#120C07',
    surface: '#2E1F15',
    surfaceSelected: '#4A3423',
    border: '#6A4E35',
    separator: '#4E3927',
    text: '#F1E6CF',
    textDim: '#BFA987',
    textDisabled: '#8A7559',
    accent: '#C89B45',
    onAccent: '#22160C',
    turn: '#F2C14E',
    turnText: '#F6D27A',
    switchTrackOff: '#5A4330',
    switchThumb: '#F1E6CF',
  },
  board: {
    frame: '#3C2617',
    field: '#8A6038',
    pointDark: '#2B1F19',
    pointLight: '#CFB98E',
    brass: '#C99A3E',
    brassLight: '#F3D58A',
    brassDark: '#7A531A',
    wear: '#F0D9AE',
  },
  checker: {
    light: '#ECE2CB',
    lightEdge: '#6E5A3C',
    dark: '#1E1A17',
    darkRing: '#8C8279',
  },
  highlight: {
    select: '#F2C14E',
    halo: '#120A05',
  },
  dice: {
    face: '#F1E8D3',
    side: '#C9BB9C',
    edge: '#857352',
    pip: '#151210',
    acePip: '#A3241C',
  },
  space: spacing,
  radii,
  type: typography,
  touch,
} as const satisfies AppTheme;
