/**
 * Which native view holds an element on the phone (#173).
 *
 * React Native leaves most plain `View`s out of the native view tree
 * ("view flattening"). Their children go into the nearest view that keeps
 * its children. Some props make a `View` keep its children, for example
 * `accessibilityElementsHidden` or `importantForAccessibility`. When such a
 * prop turns on or off, React Native moves the children to another native
 * parent. A Skia canvas that moves loses its drawing on iOS, and it stays
 * blank until it draws again.
 *
 * `nativeParent` follows the rules of React Native's `ViewShadowNode`, so a
 * test can check that a canvas keeps its native parent.
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import type { screen } from '@testing-library/react-native';

/** A host element from a query, e.g. `screen.getByTestId`. */
export type HostElement = ReturnType<typeof screen.getByTestId>;

const POINTER_EVENT = /^on(Pointer|Click|GotPointerCapture|LostPointerCapture)/;

/** True when this `View` keeps its children in its own native view. */
function keepsChildren(view: HostElement): boolean {
  const props = view.props as Record<string, unknown>;
  const style: ViewStyle = StyleSheet.flatten(props.style as ViewStyle) ?? {};
  const pointerEvents = props.pointerEvents ?? style.pointerEvents;
  const transform = style.transform;
  return (
    props.collapsable === false ||
    view.parent?.props.collapsableChildren === false ||
    pointerEvents === 'box-only' ||
    pointerEvents === 'none' ||
    props.nativeID != null ||
    props.accessible === true ||
    (style.opacity ?? 1) !== 1 ||
    (Array.isArray(transform) ? transform.length > 0 : transform != null) ||
    style.zIndex != null ||
    style.display === 'none' ||
    style.overflow === 'hidden' ||
    style.overflow === 'scroll' ||
    Object.keys(props).some((key) => POINTER_EVENT.test(key) && props[key] != null) ||
    style.shadowColor != null ||
    props.accessibilityElementsHidden === true ||
    props.accessibilityViewIsModal === true ||
    (props.importantForAccessibility ?? 'auto') !== 'auto' ||
    props.removeClippedSubviews === true ||
    (style.cursor ?? 'auto') !== 'auto' ||
    style.filter != null ||
    (style.mixBlendMode ?? 'normal') !== 'normal' ||
    style.isolation === 'isolate'
  );
}

/**
 * The element's parent in the native view tree: the nearest host ancestor
 * that is not a flattened `View`. Other host types (ScrollView, Modal,
 * screens, Skia) are always native views.
 */
export function nativeParent(element: HostElement): HostElement | null {
  let node = element.parent;
  while (node !== null && node.type !== '') {
    if (node.type !== 'View' || keepsChildren(node)) return node;
    node = node.parent;
  }
  return null;
}

/** A short name for an element in test output: its type and testID. */
function nameOf(element: HostElement): string {
  const id = element.props.testID as string | undefined;
  return id ? `${element.type}#${id}` : element.type;
}

/**
 * The chain of native parents above the element, from the root, as text:
 * "RNSScreen > View#game-content". Easy to compare, and easy to read in a
 * failed test.
 */
export function nativePath(element: HostElement): string {
  const names: string[] = [];
  for (let node = nativeParent(element); node !== null; node = nativeParent(node)) {
    names.unshift(nameOf(node));
  }
  return names.join(' > ');
}
