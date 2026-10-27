/**
 * Saves the match when the app leaves the foreground (#36). The OS may end
 * a background app at any time, so this is the last safe moment.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

export function useSaveOnBackground(save: () => void): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') save();
    });
    return () => sub.remove();
  }, [save]);
}
