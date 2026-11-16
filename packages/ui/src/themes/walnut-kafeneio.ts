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
    // The screen glow from the Figma polish pass (#493): the lamp at the top, the floor below.
    backgroundLamp: '#4A3423',
    backgroundFloor: '#1A110A',
    surface: '#2E1F15',
    surfaceSelected: '#4A3423',
    // From the Figma polish pass (#491): one step up and one step down from `surface`.
    surfaceRaised: '#3A2819',
    surfaceSunken: '#1A110A',
    border: '#6A4E35',
    edgeLight: '#5A4330',
    separator: '#4E3927',
    text: '#F1E6CF',
    textDim: '#BFA987',
    // Raised from #8A7559 (3.1:1) in #134: locked labels like "Coming soon" must stay readable.
    textDisabled: '#A89274',
    textFaint: '#8C7A62',
    accent: '#C89B45',
    // The top of the main button's brass gradient (#356).
    accentLight: '#E0B867',
    onAccent: '#22160C',
    accentPressed: '#B0873A',
    accentMuted: '#5E4628',
    onAccentMuted: '#B8A07A',
    // `accent` over `surface` at 22% and 55% (#342).
    accentWash: '#503A20',
    accentLine: '#83632F',
    // Problems (#462): a warm coral, apart from the brass of the main button.
    problem: '#F2A48C',
    problemWash: '#572A22',
    problemLine: '#B0584A',
    problemPressed: '#45211B',
    turn: '#F2C14E',
    turnText: '#F6D27A',
    // The invite code's bone tiles (#516), from the Figma pass.
    tileFace: '#E4D7BA',
    tileFaceLight: '#F3EBD8',
    tileEdge: '#B9A27A',
    tileText: '#2A1C12',
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
  // Checker avatars (#495): from the Figma polish pass. Maple is the board's
  // field wood, a step lighter than walnut.
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
