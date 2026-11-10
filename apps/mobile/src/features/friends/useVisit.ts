/**
 * Counts the times a route's screen comes into view: 1 on the first
 * render, then one more each time the player comes back to it. A friends
 * screen passes it to `useFriendsData`, which loads again on a new one.
 *
 * The player comes back in two ways:
 *
 * - from another screen: a focus after a blur (the navigation events);
 * - from another app: the app turns `active` after `background` or
 *   `inactive` while this screen has the focus. There is no blur then.
 *
 * It counts events, not runs of an effect: React's Strict Mode runs
 * effects twice in dev, and that must not count as a second visit.
 */
import { useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

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
  useEffect(() => {
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const back = next === 'active' && (last === 'background' || last === 'inactive');
      last = next;
      if (back && navigation.isFocused()) setVisit((n) => n + 1);
    });
    return () => {
      sub.remove();
    };
  }, [navigation]);
  return visit;
}
