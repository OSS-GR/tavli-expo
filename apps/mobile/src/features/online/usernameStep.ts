/**
 * The username step (#405): the parts with no React.
 *
 * - `minimumAge(region)`: the age the step asks for. 16 in the EU and EEA
 *   countries that ask more than 13 for an online service (GDPR article
 *   8), and when the phone gives no region; 13 elsewhere. The region is
 *   the phone's (expo-localization), not where the player is. The server
 *   keeps only that the box was ticked, and when.
 * - `termsUrl(language)`: the terms of use page, in English or Greek.
 * - `needsUsernameStep(mine)`: a saved account with no username yet.
 *
 * OWNER: a lawyer checks the age list and the terms (docs/legal/README.md).
 */
import type { MyUsername } from '@tavli/contracts';

/**
 * EU and EEA countries whose age of consent for an online service is
 * above 13 (14, 15 or 16). The app asks 16 there: the box has one age.
 */
const AGE_16_REGIONS = new Set([
  'AT',
  'BG',
  'CY',
  'CZ',
  'DE',
  'ES',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LI',
  'LT',
  'LU',
  'NL',
  'PL',
  'RO',
  'SI',
  'SK',
]);

/** The age the username step asks for on a phone in `region` (ISO 3166 code). */
export function minimumAge(region: string | null | undefined): 13 | 16 {
  if (region === null || region === undefined || region === '') return 16;
  return AGE_16_REGIONS.has(region.toUpperCase()) ? 16 : 13;
}

/** The terms of use page (`docs/legal/site/terms`). */
export function termsUrl(language: string): string {
  return language === 'el' ? 'https://tavlaki.com/el/terms' : 'https://tavlaki.com/terms';
}

/** A saved account that has no username yet: show the username step. */
export function needsUsernameStep(mine: MyUsername): boolean {
  return mine.saved && mine.name === null;
}
