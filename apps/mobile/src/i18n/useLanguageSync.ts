import { useLocales } from 'expo-localization';
import { useEffect } from 'react';

import { syncLanguage } from './index';

/**
 * Keeps the app language in step with the phone while "Phone language" is
 * picked. `useLocales` updates when the user changes the phone language.
 * Mount it once, in the root layout.
 */
export function useLanguageSync(): void {
  const locales = useLocales();
  useEffect(() => {
    syncLanguage();
  }, [locales]);
}
