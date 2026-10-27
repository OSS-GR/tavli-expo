/**
 * Reads `text` to screen reader users (`announceForAccessibility`, both
 * platforms).
 *
 * - Without a `key`: when the text first shows, and when it changes. Use
 *   this for text that is not a game event, such as the hint the user asked
 *   for.
 * - With a `key` (#216): the key names one game event, and the event is
 *   read once per app run. A small store in this module keeps the events
 *   read so far (key and text). When the screen mounts again (it is
 *   rebuilt) and brings back the same key with the same text, nothing is
 *   read. A new key reads the same text again (two rolls of 5-3 in a row).
 *   A new text under the same key is read too (the opening card's step after
 *   one die).
 *
 * So a key must name its event for the whole app run, not only on one
 * screen: game events put the match in it (`matchKey` of the game store).
 *
 * Opening a saved game is a new visit: the store starts empty on every app
 * run, and a saved match loads into a new game store (a new `matchKey`).
 * So the board reads its last event once when it opens ("Bob played: ….
 * Your turn."). Back on the same board later in the same app run (Home,
 * then Continue), the event is not read again.
 *
 * Time decides nothing here: the phone clock can move back.
 */
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * How many events the store keeps. A remount only brings back the newest
 * ones, so the oldest are dropped and the store stays small.
 */
export const KEPT_EVENTS = 200;

const readEvents = new Set<string>();

/** `true` the first time an event is seen in this app run; it is then kept. */
function firstRead(key: string, text: string): boolean {
  const event = `${key}\n${text}`;
  if (readEvents.has(event)) return false;
  readEvents.add(event);
  if (readEvents.size > KEPT_EVENTS) {
    // A Set keeps the order of insertion: the first one is the oldest.
    const oldest = readEvents.values().next();
    if (!oldest.done) readEvents.delete(oldest.value);
  }
  return true;
}

/** Forgets every event read so far. For tests (`apps/mobile/test/afterEnv.ts`). */
export function resetAnnouncements(): void {
  readEvents.clear();
}

export function useAnnouncement(text: string | null, key?: string): void {
  useEffect(() => {
    if (!text) return;
    if (key !== undefined && !firstRead(key, text)) return;
    AccessibilityInfo.announceForAccessibility(text);
  }, [text, key]);
}
