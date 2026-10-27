/**
 * Screen reader focus for cards and sheets over the board (#153).
 *
 * When a card opens, the screen hides the board under it from screen
 * readers. Focus would stay on a hidden view, so the card moves focus to
 * its title. The card still announces itself with `useAnnouncement`.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, type HostInstance } from 'react-native';

/**
 * Returns a ref for the view (a card's title) that gets screen reader
 * focus when it first shows. Without a screen reader nothing happens.
 */
export function useFocusOnShow() {
  const ref = useRef<HostInstance>(null);
  useEffect(() => {
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, []);
  return ref;
}
