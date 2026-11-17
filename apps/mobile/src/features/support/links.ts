/**
 * The addresses of the Support screen (#590). Pure.
 *
 * The app links only to our own page, tavlaki.com/support: that page has
 * the Ko-fi button, so the Ko-fi name can change with no app update. The
 * app never shows a price and never opens Ko-fi in a web view.
 */
import type { AppBuild } from '@/features/update/decision';

/** Our support page: Greek in Greek, else English. */
export function supportPageUrl(language: string): string {
  return language === 'el' ? 'https://tavlaki.com/el/support/' : 'https://tavlaki.com/support/';
}

/** The homepage, which Tell a friend shares: Greek in Greek, else English. */
export function shareAppUrl(language: string): string {
  return language === 'el' ? 'https://tavlaki.com/el/' : 'https://tavlaki.com';
}

/** The App Store id of Tavlaki (`docs/legal/README.md`, "The homepages"). */
export const APP_STORE_ID = '6828172932';

/**
 * Where Rate Tavlaki goes: the review page of the App Store, or the app's
 * page on Google Play. With no build info (Jest, web): the App Store.
 */
export function rateAppUrl(build: Pick<AppBuild, 'platform' | 'appId'> | null): string {
  if (build?.platform === 'android') {
    return `https://play.google.com/store/apps/details?id=${encodeURIComponent(build.appId)}`;
  }
  return `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
}
