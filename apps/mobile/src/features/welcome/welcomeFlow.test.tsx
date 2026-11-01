import type { createRecordingAnalytics } from '@tavli/contracts';
import { userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { act, getMockContext, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import HomeScreen from '@/app/index';
import SettingsRoute from '@/app/settings';
import WelcomeBoardRoute from '@/app/welcome/board';
import WelcomeLanguageRoute from '@/app/welcome/language';
import WelcomePrivacyRoute from '@/app/welcome/privacy';
import { CONSENT_STORAGE_KEY, createConsentStore, needsWelcome } from '@/features/privacy/consent';
import { consentStore } from '@/features/privacy/consentStore';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { createBoardStepStore, WELCOME_BOARD_STORAGE_KEY } from '@/features/welcome/boardStep';
import { boardStepStore } from '@/features/welcome/boardStepStore';
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
  'welcome/board': WelcomeBoardRoute,
  'new-game': stub('new game'),
  history: stub('history'),
  'rules/[variant]': stub('rules'),
  tutorial: stub('tutorial'),
  'game/[id]/index': stub('board'),
  'game/[id]/match-end': stub('match end'),
  'game/[id]/review': stub('review'),
  'dev/board': stub('dev board'),
  'dev/online': stub('dev online'),
  'invite/[code]': stub('invite'),
  'friend/index': stub('play a friend'),
  'friend/[code]': stub('invite wait'),
  'online-games': stub('online games'),
};

/** A URL for each app route (not the layout, not the welcome flow). */
const appUrls = Object.keys(routes)
  .filter((name) => name !== '_layout' && !name.startsWith('welcome/'))
  .map((name) =>
    `/${name}`
      .replace(/\/?index$/, '')
      .replace('[id]', 'local-abc')
      .replace('[variant]', 'portes')
      .replace('[code]', 'ABCD2345'),
  )
  .map((url) => url || '/');

async function openApp(initialUrl = '/') {
  return renderRouter(routes, { initialUrl });
}

type User = ReturnType<typeof userEvent.setup>;

/** The board step (#350): keeps the board as it is. */
async function keepBoard(user: User) {
  expect(screen).toHavePathname('/welcome/board');
  await user.press(screen.getByRole('button', { name: 'Continue' }));
}

/** The whole welcome flow from the language step: Continue, the answer, then the board. */
async function passWelcome(user: User, answer: 'Allow usage data' | "Don't allow") {
  await user.press(screen.getByRole('button', { name: 'Continue' }));
  await user.press(screen.getByRole('button', { name: answer }));
  await keepBoard(user);
}

/** A player who passed the welcome flow before the board step existed (#350). */
async function updatedFromOldApp(status: 'granted' | 'denied') {
  await act(async () => {
    consentStore.getState().setConsent(status === 'granted');
    storage.remove(WELCOME_BOARD_STORAGE_KEY);
    // What the app loads on its next start.
    boardStepStore.setState({ status: createBoardStepStore(storage).getState().status });
  });
}

beforeEach(async () => {
  await act(async () => {
    storage.remove(CONSENT_STORAGE_KEY);
    consentStore.setState({ status: 'unset' });
    storage.remove(WELCOME_BOARD_STORAGE_KEY);
    boardStepStore.setState({ status: 'new' });
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('first launch', () => {
  // Runs first: `app_opened` is sent once per app start (per test file here).
  it('asks for the language, then for consent, then the board, and sends events only after "Allow"', async () => {
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
    expect(screen.getByText('Step 2 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Help us make Tavlaki better' })).toBeOnTheScreen();

    // Nothing was sent while the user had not answered.
    expect(recorded.sent).toEqual([]);

    await user.press(screen.getByRole('button', { name: 'Allow usage data' }));

    // The board step (#350): the defaults are picked.
    expect(screen).toHavePathname('/welcome/board');
    expect(screen.getByText('Step 3 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Set up your board' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Walnut Kafeneio' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tall' })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen).toHavePathname('/');
    expect(boardStepStore.getState().status).toBe('done');
    expect(storage.getString(WELCOME_BOARD_STORAGE_KEY)).toBe('done');
    // Continue alone keeps the board as it was.
    expect(settingsStore.getState()).toMatchObject(DEFAULT_SETTINGS);
    expect(screen.getByText('Greek tavli with friends')).toBeOnTheScreen();
    expect(consentStore.getState().status).toBe('granted');
    expect(recorded.isOptedIn()).toBe(true);
    expect(recorded.sent.map((s) => s.type)).toContain('identify');
    expect(recorded.sent).toContainEqual({ type: 'track', event: 'app_opened', props: {} });
    expect(recorded.sent).toContainEqual({ type: 'screen', name: '/' });
  });

  it('is shown only once: the answer and the board step are saved', async () => {
    const user = userEvent.setup();
    await openApp();
    await passWelcome(user, "Don't allow");

    // The next launch loads both from storage: no welcome flow.
    const consent = createConsentStore(storage).getState().status;
    expect(consent).toBe('denied');
    expect(needsWelcome(consent)).toBe(false);
    expect(createBoardStepStore(storage).getState().status).toBe('done');
  });

  it('opens on Home after the welcome flow, also on a welcome route', async () => {
    await act(async () => {
      boardStepStore.getState().begin();
      consentStore.getState().setConsent(false);
      boardStepStore.getState().finish();
    });
    await openApp('/welcome/board');

    expect(screen).toHavePathname('/');
    expect(screen.queryByTestId('welcome-board')).not.toBeOnTheScreen();
  });

  it('saves the board picks and opens Home with them (#350)', async () => {
    const user = userEvent.setup();
    await openApp();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: "Don't allow" }));

    await user.press(screen.getByRole('radio', { name: 'Olive Inlay' }));
    await user.press(screen.getByRole('radio', { name: 'Bottom left' }));
    await user.press(screen.getByRole('radio', { name: 'Classic' }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen).toHavePathname('/');
    expect(settingsStore.getState()).toMatchObject({
      boardTheme: 'olive-inlay',
      homeBoardSide: 'left',
      boardLayout: 'classic',
    });
    expect(router.canGoBack()).toBe(false);
  });

  it.each(['granted', 'denied'] as const)(
    'skips the board step for a player who passed the welcome flow before it (%s)',
    async (status) => {
      await updatedFromOldApp(status);
      expect(boardStepStore.getState().status).toBe('done');
      await openApp('/welcome/board');
      expect(screen).toHavePathname('/');
    },
  );

  it('shows the board step on the next launch when the app closed before it', async () => {
    const user = userEvent.setup();
    // The last run: the consent answer, then the app closed on the board step.
    await act(async () => {
      boardStepStore.getState().begin();
      consentStore.getState().setConsent(true);
      // What the app loads on its next start.
      boardStepStore.setState({ status: createBoardStepStore(storage).getState().status });
    });
    expect(boardStepStore.getState().status).toBe('due');

    // The next launch starts at the board step, also from a deep link.
    await openApp('/game/local-abc');
    expect(screen.getByText('Step 3 of 3')).toBeOnTheScreen();
    await keepBoard(user);
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  it('asks a new consent text again without the board step once it is done', async () => {
    const user = userEvent.setup();
    await act(async () => {
      boardStepStore.getState().finish();
      consentStore.setState({ status: 'stale-denied' });
    });
    await openApp();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Step 2 of 2')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Allow usage data' }));
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  it('Back on the board step returns to consent', async () => {
    const user = userEvent.setup();
    await openApp();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: "Don't allow" }));
    expect(screen).toHavePathname('/welcome/board');
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen).toHavePathname('/welcome/privacy');
    // A new answer opens the board step again.
    await user.press(screen.getByRole('button', { name: 'Allow usage data' }));
    expect(consentStore.getState().status).toBe('granted');
    await keepBoard(user);
    expect(screen).toHavePathname('/');
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
    await keepBoard(user);

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
    expect(screen.getByText('Βήμα 2 από 3')).toBeOnTheScreen();
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

  it.each(appUrls)('cannot skip the board step by a deep link either (%s)', async (url) => {
    await act(async () => {
      boardStepStore.getState().begin();
      consentStore.getState().setConsent(true);
    });
    await openApp(url);
    expect(screen).toHavePathname('/welcome/board');
  });

  it('after the welcome flow from a deep link, goes Home with no welcome screen behind it', async () => {
    const user = userEvent.setup();
    await openApp('/game/local-abc');
    await passWelcome(user, 'Allow usage data');

    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  it('opens an invite link after the welcome flow, not Home (#256)', async () => {
    const user = userEvent.setup();
    await openApp('/invite/abcd2345');
    expect(screen).toHavePathname('/welcome/language');
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: "Don't allow" }));
    // The invite waits through the board step too (#350).
    await keepBoard(user);

    expect(screen).toHavePathname('/invite/ABCD2345');
    expect(screen.getByText('invite')).toBeOnTheScreen();
    // No welcome screen behind it.
    expect(router.canGoBack()).toBe(false);
  });

  it('goes Home after the welcome flow when the invite link has no code', async () => {
    const user = userEvent.setup();
    await openApp('/invite/ABCD234O');
    await passWelcome(user, 'Allow usage data');
    expect(screen).toHavePathname('/');
  });

  it('sends a user who answered away from the welcome routes', async () => {
    await updatedFromOldApp('granted');
    await openApp('/welcome/privacy');
    expect(screen).toHavePathname('/');
  });

  it('leaves no welcome screen under Home after the welcome flow', async () => {
    const user = userEvent.setup();
    await openApp();
    await passWelcome(user, "Don't allow");

    expect(screen).toHavePathname('/');
    // Back (Android button, iOS swipe) must not return to the language step.
    expect(router.canGoBack()).toBe(false);
  });
});
