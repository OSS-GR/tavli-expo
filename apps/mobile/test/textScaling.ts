/**
 * Large system fonts (#134). Jest has no text layout, so it cannot measure
 * clipped text. Instead this checks the rules that keep text from being cut
 * when the font grows:
 *
 * - every text scales with the system font (`allowFontScaling` is not off,
 *   and there is no `maxFontSizeMultiplier`), except decorative glyphs that
 *   screen readers skip (a gear or a "2P" badge in a fixed circle);
 * - no text has a line limit (`numberOfLines` cuts it with "…");
 * - no box around a text has a fixed `height` or `maxHeight`, up to the
 *   nearest scroll view (a scroll view can always show more).
 */
import { StyleSheet } from 'react-native';

import type { JsonNode } from './tree';

type Json = JsonNode | JsonNode[] | string | null;

const SCROLL_VIEWS = new Set(['RCTScrollView', 'AndroidHorizontalScrollView']);

function textOf(node: JsonNode): string {
  return (node.children ?? [])
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

function hidden(node: JsonNode): boolean {
  const important = node.props['importantForAccessibility'];
  return (
    important === 'no' ||
    important === 'no-hide-descendants' ||
    node.props['accessibilityElementsHidden'] === true ||
    node.props['aria-hidden'] === true
  );
}

function fixedHeight(node: JsonNode): string | null {
  const style = StyleSheet.flatten(node.props['style'] as never) as
    { height?: unknown; maxHeight?: unknown } | undefined;
  if (style === undefined || style === null) return null;
  if (typeof style.height === 'number') return `height ${style.height}`;
  if (typeof style.maxHeight === 'number') return `maxHeight ${style.maxHeight}`;
  return null;
}

/** What could cut a text with a large system font. Empty when all is well. */
export function textScalingProblems(tree: Json): string[] {
  const problems: string[] = [];
  const walk = (node: Json, ancestors: JsonNode[]) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, ancestors);
      return;
    }
    if (node.type === 'Text') {
      const text = JSON.stringify(textOf(node));
      const decorative = hidden(node) || ancestors.some(hidden);
      if (node.props['allowFontScaling'] === false && !decorative) {
        problems.push(`${text} does not scale`);
      }
      if (node.props['maxFontSizeMultiplier'] !== undefined && !decorative) {
        problems.push(`${text} has a maxFontSizeMultiplier`);
      }
      if (node.props['numberOfLines'] !== undefined) {
        problems.push(`${text} has numberOfLines`);
      }
      if (!decorative) {
        for (const box of [node, ...[...ancestors].reverse()]) {
          if (SCROLL_VIEWS.has(box.type)) break;
          const fixed = fixedHeight(box);
          if (fixed !== null) {
            problems.push(`${text} sits in a box with ${fixed}`);
            break;
          }
        }
      }
      // Nested texts belong to this one.
      return;
    }
    for (const child of node.children ?? []) walk(child, [...ancestors, node]);
  };
  walk(tree, []);
  return problems;
}
