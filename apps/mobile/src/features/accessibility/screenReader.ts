/**
 * Is a screen reader (VoiceOver, TalkBack) on? And does the board show its
 * move list (#134)?
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { MoveListMode } from '@/features/settings/settings';
import { useSettings } from '@/features/settings/store';

/** `true` while a screen reader is on. Follows the system switch. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (live) setEnabled(on);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

/** The move list shows for `on`, and for `auto` while a screen reader is on. */
export function moveListShown(mode: MoveListMode, screenReader: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && screenReader);
}

/** Settings → Move list, with the screen reader for `auto`. */
export function useMoveListShown(): boolean {
  const mode = useSettings((s) => s.moveList);
  const screenReader = useScreenReaderEnabled();
  return moveListShown(mode, screenReader);
}
