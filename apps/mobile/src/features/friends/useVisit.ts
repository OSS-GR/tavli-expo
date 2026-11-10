/**
 * Counts the times a route's screen comes into view: 1 on the first
 * render, then one more each time the player comes back to it. A friends
 * screen passes it to `useFriendsData`, which loads again on a new one.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export function useVisit(): number {
  const [visit, setVisit] = useState(1);
  // The first focus is the first render's visit: it loads once.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      setVisit((n) => n + 1);
    }, []),
  );
  return visit;
}
