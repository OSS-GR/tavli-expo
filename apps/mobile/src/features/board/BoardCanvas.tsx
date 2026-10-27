/**
 * The board on screen: a Skia canvas that draws a `BoardScene`.
 *
 * `useBoardTheme` reads the board theme from Settings, `useHomeBoardSide`
 * the home board side. `portraitLayout` gives the layout for that side.
 * `useBoardSpace` measures the space the board may fill; `fitBoard` then
 * gives the geometry.
 */
import { Canvas } from '@shopify/react-native-skia';
import {
  getLayout,
  getTheme,
  hasTheme,
  mirrorLayout,
  DEFAULT_THEME_ID,
  type BoardLayout,
  type ThemeManifest,
} from '@tavli/themes';
import { useCallback, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import type { HomeBoardSide } from '@/features/settings/settings';
import { useSettings } from '@/features/settings/store';

import type { BoardPicture } from './boardModel';
import { checkerRadius, type BoardGeometry } from './geometry';
import { BoardScene, type BoardHighlights } from './skia/BoardScene';
import { useBoardImages, useNumberFont } from './useBoardAssets';

/** The board theme picked in Settings → Board (the default theme for an unknown id). */
export function useBoardTheme(): ThemeManifest {
  const id = useSettings((s) => s.boardTheme);
  return getTheme(hasTheme(id) ? id : DEFAULT_THEME_ID);
}

/** Where your home is, from Settings → Home board (#175). */
export function useHomeBoardSide(): HomeBoardSide {
  return useSettings((s) => s.homeBoardSide);
}

/** One mirrored layout per theme layout, so its identity stays the same between renders. */
const mirrored = new WeakMap<BoardLayout, BoardLayout>();

/**
 * The portrait layout of a theme (wireframe option B). With `left` it is
 * mirrored left to right (`mirrorLayout`): every point, bar half and tray
 * moves to the other side, so drawing, hit tests, highlights and flights
 * all follow. The art is not mirrored: the themes test checks it fits.
 */
export function portraitLayout(theme: ThemeManifest, side: HomeBoardSide = 'right'): BoardLayout {
  const layout = getLayout(theme, 'portrait-rotated');
  if (side === 'right') return layout;
  let flipped = mirrored.get(layout);
  if (flipped === undefined) {
    flipped = mirrorLayout(layout);
    mirrored.set(layout, flipped);
  }
  return flipped;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Measures a view. `size` is `null` until the first layout. */
export function useBoardSpace(): [Size | null, (e: LayoutChangeEvent) => void] {
  const [size, setSize] = useState<Size | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((old) =>
      old && old.width === width && old.height === height ? old : { width, height },
    );
  }, []);
  return [size, onLayout];
}

export interface BoardCanvasProps {
  theme: ThemeManifest;
  geo: BoardGeometry;
  /** The canvas size: the measured space, not only the board. */
  size: Size;
  picture: BoardPicture;
  highlights?: BoardHighlights;
  hidden?: ReadonlySet<string>;
  children?: ReactNode;
  testID?: string;
}

export function BoardCanvas({
  theme,
  geo,
  size,
  picture,
  highlights,
  hidden,
  children,
  testID,
}: BoardCanvasProps) {
  const images = useBoardImages(theme, geo.layout);
  const font = useNumberFont(theme.checkers.badge.fontSize * checkerRadius(geo));
  return (
    <Canvas testID={testID} style={{ width: size.width, height: size.height }}>
      <BoardScene
        theme={theme}
        geo={geo}
        images={images}
        picture={picture}
        font={font}
        {...(hidden ? { hidden } : {})}
        {...(highlights ? { highlights } : {})}>
        {children}
      </BoardScene>
    </Canvas>
  );
}
