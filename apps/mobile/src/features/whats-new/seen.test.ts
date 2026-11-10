import { createMemoryStorage, type Storage } from '@tavli/contracts';

import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';

import type { WhatsNewRelease } from './releases';
import { createWhatsNewSeen, WHATS_NEW_STORAGE_KEY } from './seen';

const RELEASES: readonly WhatsNewRelease[] = [
  { date: '2026-12-01', entries: [{ id: 'friends', icon: 'users' }] },
  { date: '2026-11-02', entries: [{ id: 'home', icon: 'house' }] },
];

/** A phone that answered the consent screen. */
const answered = (initial: Record<string, string> = {}) =>
  createMemoryStorage({ [CONSENT_STORAGE_KEY]: '{"status":"denied"}', ...initial });

describe("What's new seen (#471)", () => {
  it('a new player sees nothing as new, before and after the first consent answer', () => {
    const storage = createMemoryStorage();
    const seen = createWhatsNewSeen(storage, RELEASES);
    expect(seen.due()).toBe(false);
    // The consent screen calls `begin()` right before it saves the answer.
    seen.begin();
    storage.setString(CONSENT_STORAGE_KEY, '{"status":"granted"}');
    expect(storage.getString(WHATS_NEW_STORAGE_KEY)).toBe('2026-12-01');
    expect(seen.due()).toBe(false);
  });

  it('a player from before the page has everything new, until it is marked seen', () => {
    const storage = answered();
    const seen = createWhatsNewSeen(storage, RELEASES);
    expect(seen.due()).toBe(true);
    seen.markSeen();
    expect(seen.due()).toBe(false);
    expect(storage.getString(WHATS_NEW_STORAGE_KEY)).toBe('2026-12-01');
  });

  it('a player who answers a new consent text again keeps the card', () => {
    const storage = answered();
    const seen = createWhatsNewSeen(storage, RELEASES);
    seen.begin();
    expect(storage.getString(WHATS_NEW_STORAGE_KEY)).toBeUndefined();
    expect(seen.due()).toBe(true);
  });

  it('a newer release is due once; begin() changes nothing after that', () => {
    const storage = answered({ [WHATS_NEW_STORAGE_KEY]: '2026-11-02' });
    const seen = createWhatsNewSeen(storage, RELEASES);
    expect(seen.due()).toBe(true);
    seen.begin();
    expect(seen.due()).toBe(true);
    seen.markSeen();
    expect(seen.due()).toBe(false);
  });

  it('the newest release, or a date the list does not have, counts as seen', () => {
    expect(
      createWhatsNewSeen(answered({ [WHATS_NEW_STORAGE_KEY]: '2026-12-01' }), RELEASES).due(),
    ).toBe(false);
    expect(
      createWhatsNewSeen(answered({ [WHATS_NEW_STORAGE_KEY]: '2027-01-05' }), RELEASES).due(),
    ).toBe(false);
  });

  it('an empty list is never due', () => {
    const storage = answered();
    const seen = createWhatsNewSeen(storage, []);
    expect(seen.due()).toBe(false);
    seen.markSeen();
    expect(storage.getString(WHATS_NEW_STORAGE_KEY)).toBeUndefined();
  });

  it('a storage error shows no card and throws nothing', () => {
    const broken: Storage = {
      getString: () => {
        throw new Error('disk');
      },
      setString: () => {
        throw new Error('disk');
      },
      remove: () => undefined,
    };
    const seen = createWhatsNewSeen(broken, RELEASES);
    expect(seen.due()).toBe(false);
    expect(() => seen.markSeen()).not.toThrow();
    expect(() => seen.begin()).not.toThrow();
  });
});
