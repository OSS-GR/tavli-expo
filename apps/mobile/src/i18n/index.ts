/* eslint-disable import/no-named-as-default-member -- i18next documents the default instance API. */
/**
 * i18next setup. Strings live in `en.json` and `el.json` next to this file.
 *
 * The language comes from Settings: "system" follows the phone
 * (expo-localization), or the user picks Greek or English.
 * `index.ts` imports this file once, before the first screen renders.
 */
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { settingsStore } from '@/features/settings/store';

import el from './el.json';
import en from './en.json';
import { FALLBACK_LANGUAGE, LANGUAGES, resolveLanguage, type AppLanguage } from './languages';

export const resources = {
  en: { translation: en },
  el: { translation: el },
} as const;

/** The phone's language codes, most preferred first. */
export function deviceLanguageCodes(): string[] {
  return getLocales().map((locale) => locale.languageCode ?? '');
}

/** The language the app should show now. */
export function currentAppLanguage(): AppLanguage {
  return resolveLanguage(settingsStore.getState().language, deviceLanguageCodes());
}

/** Switches i18n to match Settings and the phone. Safe to call often. */
export function syncLanguage(): void {
  const next = currentAppLanguage();
  if (i18n.language !== next) {
    void i18n.changeLanguage(next);
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: currentAppLanguage(),
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: LANGUAGES,
    interpolation: {
      // React already escapes text.
      escapeValue: false,
    },
    // Resources are bundled, so init can finish right away.
    initAsync: false,
  });

  settingsStore.subscribe((state, previous) => {
    if (state.language !== previous.language) {
      syncLanguage();
    }
  });
}

export default i18n;
