/**
 * The board on screen: a Skia canvas that draws a `BoardScene`.
 *
 * `useBoardTheme` reads the board theme from Settings. `useBoardSpace` measures
 * the space the board may fill; `fitBoard` then gives the geometry.
 */
import { Canvas } from '@shopify/react-native-skia';
import { getLayout, getTheme, hasTheme, DEFAULT_THEME_ID, type ThemeManifest } from '@tavli/themes';
import { useCallback, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';

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

/** The portrait layout of a theme (wireframe option B). */
export function portraitLayout(theme: ThemeManifest) {
  return getLayout(theme, 'portrait-rotated');
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
