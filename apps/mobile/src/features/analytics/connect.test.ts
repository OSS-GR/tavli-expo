import {
  createMemoryStorage,
  createRecordingAnalytics,
  isAnonymousInstallId,
  type Storage,
} from '@tavli/contracts';

import { INSTALL_ID_STORAGE_KEY as INSTALL_ID_KEY } from '@/features/install-id/installId';
import { createSettingsStore } from '@/features/settings/settings';

import { connectAnalytics } from './connect';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  createConsentStore,
  needsWelcome,
  usageDataAllowed,
} from '@/features/privacy/consent';

function setup(storage: Storage = createMemoryStorage()) {
  const analytics = createRecordingAnalytics();
  const consent = createConsentStore(storage);
  const settings = createSettingsStore(storage);
  const app = connectAnalytics({ analytics, consent, settings, storage });
  return { analytics, consent, settings, storage, app };
}

const tracked = (sent: ReturnType<typeof createRecordingAnalytics>['sent']) =>
  sent.filter((s) => s.type === 'track').map((s) => (s.type === 'track' ? s.event : ''));

describe('consent store', () => {
  it('starts unset, so the welcome flow shows', () => {
    const consent = createConsentStore(createMemoryStorage());
    expect(consent.getState().status).toBe('unset');
    expect(needsWelcome(consent.getState().status)).toBe(true);
  });

  it('saves the answer and loads it on the next start', () => {
    const storage = createMemoryStorage();
    createConsentStore(storage).getState().setConsent(false);

    const next = createConsentStore(storage);
    expect(next.getState().status).toBe('denied');
    expect(needsWelcome(next.getState().status)).toBe(false);
    expect(JSON.parse(storage.getString(CONSENT_STORAGE_KEY)!)).toEqual({
      version: 1,
      status: 'denied',
    });
  });

  it('treats a broken save as "not asked"', () => {
    for (const raw of ['{bad', '"granted"', JSON.stringify({ status: 'maybe' })]) {
      const store = createConsentStore(createMemoryStorage({ [CONSENT_STORAGE_KEY]: raw }));
      expect(store.getState().status).toBe('unset');
    }
  });

  it('asks again when the answer was saved for another consent text', () => {
    for (const version of [CONSENT_VERSION - 1, CONSENT_VERSION + 1, undefined, '1']) {
      for (const status of ['granted', 'denied']) {
        const raw = JSON.stringify({ version, status });
        const store = createConsentStore(createMemoryStorage({ [CONSENT_STORAGE_KEY]: raw }));
        expect(store.getState().status).toBe('unset');
        expect(needsWelcome(store.getState().status)).toBe(true);
      }
    }
    const current = JSON.stringify({ version: CONSENT_VERSION, status: 'granted' });
    const store = createConsentStore(createMemoryStorage({ [CONSENT_STORAGE_KEY]: current }));
    expect(store.getState().status).toBe('granted');
  });
});

describe('connectAnalytics', () => {
  it('sends no events before opt-in', () => {
    const { analytics, settings, app } = setup();

    app.appOpened();
    settings.getState().setSetting('sound', false);
    settings.getState().setSetting('theme', 'walnut-kafeneio');
    analytics.screen('/');

    expect(analytics.isOptedIn()).toBe(false);
    expect(analytics.sent).toEqual([]);
  });

  it('on first launch, sends app_opened right after the user allows', () => {
    const { analytics, consent, storage, app } = setup();
    app.appOpened();

    consent.getState().setConsent(true);

    const id = storage.getString(INSTALL_ID_KEY);
    expect(isAnonymousInstallId(id)).toBe(true);
    expect(analytics.sent).toEqual([
      { type: 'identify', id },
      { type: 'track', event: 'app_opened', props: {} },
    ]);
  });

  it('opts in at start when the user said yes before, with the same install ID', () => {
    const storage = createMemoryStorage();
    setup(storage).consent.getState().setConsent(true);
    const id = storage.getString(INSTALL_ID_KEY);

    const { analytics, app } = setup(storage);
    app.appOpened();
    app.appOpened(); // Once per start.

    expect(analytics.sent).toEqual([
      { type: 'identify', id },
      { type: 'track', event: 'app_opened', props: {} },
    ]);
  });

  it('sends settings_changed with the key only, and theme_changed for the theme', () => {
    const { analytics, consent, settings } = setup();
    consent.getState().setConsent(true);
    analytics.sent.length = 0;

    settings.getState().setSetting('autoConfirmMoves', true);
    settings.getState().setSetting('language', 'el');
    settings.getState().setSetting('language', 'el'); // No change: no event.
    settings.getState().setSetting('theme', 'walnut-kafeneio'); // Same as default: no event.

    expect(analytics.sent).toEqual([
      { type: 'track', event: 'settings_changed', props: { key: 'autoConfirmMoves' } },
      { type: 'track', event: 'settings_changed', props: { key: 'language' } },
    ]);

    settings.setState({ theme: 'other-theme' as never });
    expect(analytics.sent.at(-1)).toEqual({
      type: 'track',
      event: 'theme_changed',
      props: { theme: 'other-theme' },
    });
  });

  it('uses the install ID that crash reports already saved (#43)', () => {
    const storage = createMemoryStorage({ [INSTALL_ID_KEY]: 'install_1234abcd' });
    const { analytics, consent } = setup(storage);
    consent.getState().setConsent(true);
    expect(analytics.sent[0]).toEqual({ type: 'identify', id: 'install_1234abcd' });
  });

  it('opt-out stops all events at once', () => {
    const { analytics, consent, settings, storage } = setup();
    consent.getState().setConsent(true);
    const firstId = storage.getString(INSTALL_ID_KEY);
    analytics.sent.length = 0;

    consent.getState().setConsent(false);
    settings.getState().setSetting('sound', false);
    analytics.track('undo_used');

    expect(analytics.isOptedIn()).toBe(false);
    expect(analytics.sent).toEqual([]);

    // Opting in again sends again, with the same install ID.
    consent.getState().setConsent(true);
    expect(analytics.sent).toEqual([{ type: 'identify', id: firstId }]);
    expect(tracked(analytics.sent)).toEqual([]);
  });

  it('stops listening after disconnect', () => {
    const { analytics, consent, settings, app } = setup();
    consent.getState().setConsent(true);
    app.disconnect();
    analytics.sent.length = 0;

    settings.getState().setSetting('sound', false);
    expect(analytics.sent).toEqual([]);
  });
});

describe('usageDataAllowed', () => {
  it('is true only after the user said yes', () => {
    expect(usageDataAllowed('unset')).toBe(false);
    expect(usageDataAllowed('denied')).toBe(false);
    expect(usageDataAllowed('granted')).toBe(true);
  });
});
