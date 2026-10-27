/** Reads `text` to screen reader users when it first shows, and when it changes. */
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useAnnouncement(text: string | null): void {
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}
