import type { createRecordingAnalytics } from '@tavli/contracts';
import { userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { act, getMockContext, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import HomeScreen from '@/app/index';
import SettingsRoute from '@/app/settings';
import WelcomeLanguageRoute from '@/app/welcome/language';
import WelcomePrivacyRoute from '@/app/welcome/privacy';
import { CONSENT_STORAGE_KEY, createConsentStore, needsWelcome } from '@/features/privacy/consent';
import { consentStore } from '@/features/privacy/consentStore';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';
import { analytics, storage } from '@/services';

const recorded = analytics as ReturnType<typeof createRecordingAnalytics>;

/** A stand-in for a route these tests only open by deep link. */
const stub = (name: string) =>
  function StubRoute() {
    return <Text>{name}</Text>;
  };

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  settings: SettingsRoute,
  'welcome/language': WelcomeLanguageRoute,
  'welcome/privacy': WelcomePrivacyRoute,
  'new-game': stub('new game'),
  history: stub('history'),
  'rules/[variant]': stub('rules'),
  tutorial: stub('tutorial'),
  'game/[id]/index': stub('board'),
  'game/[id]/match-end': stub('match end'),
  'game/[id]/review': stub('review'),
  'dev/board': stub('dev board'),
};

/** A URL for each app route (not the layout, not the welcome flow). */
const appUrls = Object.keys(routes)
  .filter((name) => name !== '_layout' && !name.startsWith('welcome/'))
  .map((name) =>
    `/${name}`
      .replace(/\/?index$/, '')
      .replace('[id]', 'local-abc')
      .replace('[variant]', 'portes'),
  )
  .map((url) => url || '/');

async function openApp(initialUrl = '/') {
  return renderRouter(routes, { initialUrl });
}

beforeEach(async () => {
  await act(async () => {
    storage.remove(CONSENT_STORAGE_KEY);
    consentStore.setState({ status: 'unset' });
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('first launch', () => {
  // Runs first: `app_opened` is sent once per app start (per test file here).
  it('asks for the language, then for consent, and sends events only after "Allow"', async () => {
    const user = userEvent.setup();
    await openApp();

    expect(screen).toHavePathname('/welcome/language');
    expect(screen.getByText('Choose your language')).toBeOnTheScreen();
    expect(screen.getByText('Διαλέξτε γλώσσα')).toBeOnTheScreen();
    // The phone language (English in tests) is picked and marked.
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Ελληνικά' })).not.toBeChecked();

    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen).toHavePathname('/welcome/privacy');
    expect(screen.getByText('Step 2 of 2')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Help us make Tavlaki better' })).toBeOnTheScreen();

    // Nothing was sent while the user had not answered.
    expect(recorded.sent).toEqual([]);

    await user.press(screen.getByRole('button', { name: 'Allow usage data' }));

    expect(screen).toHavePathname('/');
    expect(screen.getByText('Greek tavli with friends')).toBeOnTheScreen();
    expect(consentStore.getState().status).toBe('granted');
    expect(recorded.isOptedIn()).toBe(true);
    expect(recorded.sent.map((s) => s.type)).toContain('identify');
    expect(recorded.sent).toContainEqual({ type: 'track', event: 'app_opened', props: {} });
    expect(recorded.sent).toContainEqual({ type: 'screen', name: '/' });
  });

  it('is shown only once: after an answer the app opens on Home', async () => {
    await act(async () => consentStore.getState().setConsent(false));
    await openApp();

    expect(screen).toHavePathname('/');
    expect(screen.queryByTestId('welcome-language')).not.toBeOnTheScreen();
  });

  it('counts closing the app before an answer as "no", so it shows again', async () => {
    const user = userEvent.setup();
    await openApp();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen).toHavePathname('/welcome/privacy');

    // The app "closes" here, before an answer: nothing is saved and
    // analytics stays off.
    expect(storage.getString(CONSENT_STORAGE_KEY)).toBeUndefined();
    expect(recorded.isOptedIn()).toBe(false);
    // The next launch loads the answer from storage again: still "not
    // asked", so the welcome flow shows.
    const nextLaunch = createConsentStore(storage).getState().status;
    expect(nextLaunch).toBe('unset');
    expect(needsWelcome(nextLaunch)).toBe(true);
  });

  it('"Don\'t allow" saves the answer, goes Home and sends nothing', async () => {
    const user = userEvent.setup();
    await act(async () => recorded.optOut());
    recorded.sent.length = 0;
    await openApp();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    // Both buttons look the same: same kind, so no nudge.
    const allow = screen.getByRole('button', { name: 'Allow usage data' });
    const deny = screen.getByRole('button', { name: "Don't allow" });
    expect(deny.props.style).toEqual(allow.props.style);

    await user.press(deny);

    expect(screen).toHavePathname('/');
    expect(consentStore.getState().status).toBe('denied');
    expect(recorded.isOptedIn()).toBe(false);
    expect(recorded.sent).toEqual([]);
  });

  it('switches the app to Greek at once, and the back button returns to the language step', async () => {
    const user = userEvent.setup();
    await openApp();

    await user.press(screen.getByRole('radio', { name: 'Ελληνικά' }));
    expect(settingsStore.getState().language).toBe('el');
    expect(i18n.language).toBe('el');
    expect(await screen.findByRole('button', { name: 'Συνέχεια' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Συνέχεια' }));
    expect(screen.getByText('Βήμα 2 από 2')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Πίσω' }));
    expect(screen).toHavePathname('/welcome/language');

    // Picking the phone language again keeps "Phone language" in Settings.
    await user.press(screen.getByRole('radio', { name: 'English' }));
    expect(settingsStore.getState().language).toBe('system');
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeOnTheScreen();
  });

  it('lists every route file, so the checks below cover new routes too', () => {
    // The route files in `src/app`, as the router sees them (`./game/[id]/index.tsx`).
    const files = getMockContext('./src/app')
      .keys()
      .map((file) => file.replace(/^\.\//, '').replace(/\.tsx?$/, ''))
      .sort();
    expect(Object.keys(routes).sort()).toEqual(files);
  });

  it.each(appUrls)('cannot be skipped by a deep link or a restored route (%s)', async (url) => {
    await openApp(url);
    expect(screen).toHavePathname('/welcome/language');
    expect(screen.getByText('Choose your language')).toBeOnTheScreen();
  });

  it('after the answer from a deep link, goes Home with no welcome screen behind it', async () => {
    const user = userEvent.setup();
    await openApp('/game/local-abc');
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: 'Allow usage data' }));

    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  it('sends a user who answered away from the welcome routes', async () => {
    await act(async () => consentStore.getState().setConsent(true));
    await openApp('/welcome/privacy');
    expect(screen).toHavePathname('/');
  });

  it('leaves no welcome screen under Home after the answer', async () => {
    const user = userEvent.setup();
    await openApp();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: "Don't allow" }));

    expect(screen).toHavePathname('/');
    // Back (Android button, iOS swipe) must not return to the language step.
    expect(router.canGoBack()).toBe(false);
  });
});
