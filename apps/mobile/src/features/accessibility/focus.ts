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
 *
 * `active` false holds the focus back, for a card under another sheet
 * (the turn notifications offer, #285): the card gets focus once, when
 * `active` first turns true.
 */
export function useFocusOnShow(active = true) {
  const ref = useRef<HostInstance>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!active || done.current) return;
    done.current = true;
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, [active]);
  return ref;
}
