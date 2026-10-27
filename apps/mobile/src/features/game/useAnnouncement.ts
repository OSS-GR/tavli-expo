/**
 * Reads `text` to screen reader users when it first shows, and when it
 * changes. Pass a `key` to read the same text again for a new event (two
 * rolls of 5-3 in a row).
 */
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useAnnouncement(text: string | null, key?: string): void {
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text, key]);
}
