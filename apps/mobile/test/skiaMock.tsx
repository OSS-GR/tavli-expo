/**
 * A small stand-in for @shopify/react-native-skia in Jest.
 *
 * Skia draws with native code (or CanvasKit), which Jest does not load.
 * Here every Skia component becomes a plain host element with the same
 * name and props, so a test can count what the board would draw
 * (`findAllByType` on the render tree, or `toJSON()`).
 */
import { createElement, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

function host(name: string) {
  const Component = ({ children, ...props }: Props) => createElement(name, props, children);
  Component.displayName = name;
  return Component;
}

export const Canvas = host('Canvas');
export const Group = host('Group');
export const Circle = host('Circle');
export const Rect = host('Rect');
export const RoundedRect = host('RoundedRect');
export const Path = host('Path');
export const Image = host('Image');
export const ImageShader = host('ImageShader');
export const LinearGradient = host('LinearGradient');
export const RadialGradient = host('RadialGradient');
export const BlurMask = host('BlurMask');
export const DashPathEffect = host('DashPathEffect');
export const Text = host('Text');
export const Shadow = host('Shadow');
export const Paint = host('Paint');

/** A font that measures every character as 0.6 em wide. */
export function matchFont(style: { fontSize?: number } = {}) {
  const size = style.fontSize ?? 14;
  return {
    getSize: () => size,
    measureText: (text: string) => ({ x: 0, y: 0, width: text.length * size * 0.6, height: size }),
  };
}

export const loadData = () => Promise.resolve(null);
export const useImage = () => null;
export const vec = (x = 0, y = 0) => ({ x, y });

export const Skia = {
  Image: { MakeImageFromEncoded: () => null },
  Data: { fromBytes: () => ({}) },
};
