/**
 * Is a screen reader (VoiceOver, TalkBack) on? And does the board show its
 * move list (#134)?
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

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

/**
 * Did the player ask for the move list, as far as the app can know (#681)?
 * The game-start intro and other motion that a screen reader user does not
 * need skip themselves by this, not by `useMoveListShown`.
 *
 * On a phone the two are the same. In a browser they differ: a page cannot
 * ask if a screen reader is on, and `react-native-web` answers "on" every
 * time, so `auto` shows the list to everyone there. That answer is no
 * reason to skip the intro. In a browser only the setting `on` counts.
 */
export function moveListAsked(mode: MoveListMode, screenReader: boolean, web: boolean): boolean {
  return web ? mode === 'on' : moveListShown(mode, screenReader);
}

export function useMoveListAsked(): boolean {
  const mode = useSettings((s) => s.moveList);
  const screenReader = useScreenReaderEnabled();
  return moveListAsked(mode, screenReader, Platform.OS === 'web');
}
