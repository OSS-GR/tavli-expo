import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { analytics } from '@/services';

import { appAnalytics } from './store';

/** The route pattern, e.g. `/settings` or `/game/[id]`. Never holds IDs or params. */
export function screenName(segments: readonly string[]): string {
  return `/${segments.join('/')}`;
}

/**
 * Sends `app_opened` once per start and a screen view on each route change.
 * Mount it once, in the root layout. Both are dropped until the user opts in.
 */
export function useAppAnalytics(): void {
  const segments = useSegments();
  const name = screenName(segments);

  useEffect(() => {
    appAnalytics.appOpened();
  }, []);

  useEffect(() => {
    analytics.screen(name);
  }, [name]);
}
