/** Languages the app ships. Add a code here and a `<code>.json` file next to it. */
export const LANGUAGES = ['el', 'en'] as const;

export type AppLanguage = (typeof LANGUAGES)[number];

/** What the user picked in Settings. "system" follows the phone. */
export type LanguagePreference = 'system' | AppLanguage;

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['system', ...LANGUAGES];

/** Used when the phone is in a language we do not ship. */
export const FALLBACK_LANGUAGE: AppLanguage = 'en';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * The first phone language we support, or English.
 * `codes` are ISO 639 codes in the phone's order, for example ["el", "en"].
 */
export function pickDeviceLanguage(codes: readonly (string | null | undefined)[]): AppLanguage {
  for (const code of codes) {
    const base = code?.toLowerCase().split('-')[0];
    if (isAppLanguage(base)) {
      return base;
    }
  }
  return FALLBACK_LANGUAGE;
}

/** The language to show for a saved preference. */
export function resolveLanguage(
  preference: LanguagePreference,
  deviceCodes: readonly (string | null | undefined)[],
): AppLanguage {
  return preference === 'system' ? pickDeviceLanguage(deviceCodes) : preference;
}
