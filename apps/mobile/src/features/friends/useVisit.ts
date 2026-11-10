/**
 * Counts the times a route's screen comes into view: 1 on the first
 * render, then one more each time the player comes back to it. A friends
 * screen passes it to `useFriendsData`, which loads again on a new one.
 *
 * It counts a focus only after a blur (the navigation events), not each
 * run of an effect: React's Strict Mode runs effects twice in dev, and
 * that must not count as a second visit.
 */
import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

export function useVisit(): number {
  const navigation = useNavigation();
  const [visit, setVisit] = useState(1);
  const away = useRef(false);
  useEffect(() => {
    const offBlur = navigation.addListener('blur', () => {
      away.current = true;
    });
    const offFocus = navigation.addListener('focus', () => {
      if (!away.current) return;
      away.current = false;
      setVisit((n) => n + 1);
    });
    return () => {
      offBlur();
      offFocus();
    };
  }, [navigation]);
  return visit;
}
