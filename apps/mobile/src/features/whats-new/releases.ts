/**
 * The content of the What's new page (#471): what each app update added.
 *
 * Add an entry when a feature lands, in the release of the next store
 * build (add a release at the top when there is none yet). Each entry
 * needs a title and a body in `en.json` and `el.json`, under
 * `whatsNew.entries.<id>`. The body says what the feature is and where to
 * find it, in one or two plain sentences. List only built features: never
 * "coming soon".
 *
 * A new release at the top puts a dot on Home's What's new button for
 * players who update (`seen.ts`). Never change the id of a release that shipped: the
 * phone saves it.
 */
import type { IconName } from '@/components/icons';

/** The entries the page can show. Each one has its strings in `whatsNew.entries`. */
export type WhatsNewEntryId =
  | 'home'
  | 'playFriend'
  | 'joinCode'
  | 'turnPushes'
  | 'signIn'
  | 'usernames'
  | 'friends'
  | 'leaderboards'
  | 'reportBlock'
  | 'fastForward'
  | 'quickInvites'
  | 'newLook'
  | 'grabAChair'
  | 'matchingColors';

export interface WhatsNewEntry {
  readonly id: WhatsNewEntryId;
  /** A Lucide icon from `components/icons.ts`. */
  readonly icon: IconName;
}

export interface WhatsNewRelease {
  /** The day of the store build, `YYYY-MM-DD`. It is also the id the phone saves. */
  readonly date: string;
  readonly entries: readonly WhatsNewEntry[];
}

/** Every release, newest first. */
export const RELEASES: readonly WhatsNewRelease[] = [
  {
    date: '2026-11-13',
    entries: [{ id: 'matchingColors', icon: 'palette' }],
  },
  {
    date: '2026-11-12',
    entries: [{ id: 'grabAChair', icon: 'sparkles' }],
  },
  {
    date: '2026-11-11',
    entries: [
      { id: 'newLook', icon: 'palette' },
      { id: 'quickInvites', icon: 'handshake' },
    ],
  },
  {
    date: '2026-11-10',
    entries: [
      { id: 'signIn', icon: 'keyRound' },
      { id: 'usernames', icon: 'user' },
      { id: 'friends', icon: 'users' },
      { id: 'leaderboards', icon: 'trophy' },
      { id: 'reportBlock', icon: 'flag' },
      { id: 'fastForward', icon: 'fastForward' },
    ],
  },
  {
    date: '2026-11-02',
    entries: [
      { id: 'home', icon: 'house' },
      { id: 'playFriend', icon: 'globe' },
      { id: 'joinCode', icon: 'keyboard' },
      { id: 'turnPushes', icon: 'bell' },
    ],
  },
];

/** Noon UTC of a release day, so the date is the same day in every time zone. */
export function releaseTime(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}
