/**
 * The Settings index (#501): the account card, the groups and the value
 * each row shows. The settings themselves live on their pages
 * (`SettingsPages.test.tsx`).
 */
import { TERMS_VERSION, memoryAppleIdToken } from '@tavli/contracts';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';

import { signInForOnline } from '@/features/online/account';
import { rememberOnlineAccount } from '@/features/online/accountHint';
import { consentStore } from '@/features/privacy/consentStore';
import { RELEASES } from '@/features/whats-new/releases';
import { WHATS_NEW_STORAGE_KEY, markWhatsNewSeenForTest } from '@/features/whats-new/seen';
import i18n from '@/i18n';
import { auth, storage, usernames } from '@/services';

import { onlineFake } from '../../../test/onlineFake';

import { DEFAULT_SETTINGS } from './settings';
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen';
import { settingsStore } from './store';

const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    consentStore.setState({ status: 'unset' });
  });
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

/** Settings with every way out, as the route gives them. */
function allProps(): Required<Omit<SettingsScreenProps, 'turnPushes' | 'visit'>> {
  return {
    onBack: jest.fn(),
    onPage: jest.fn(),
    onLearnToPlay: jest.fn(),
    onHowToPlay: jest.fn(),
    onHistory: jest.fn(),
    onWhatsNew: jest.fn(),
    onAccount: jest.fn(),
    account: { auth: auth!, usernames: usernames! },
    onBlocked: jest.fn(),
    onFriends: jest.fn(),
    onRatings: jest.fn(),
  };
}

describe('<SettingsScreen /> index', () => {
  it('has the screen header with a back button (#360)', async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    await render(<SettingsScreen onBack={onBack} />);

    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has no back button without a way back', async () => {
    await render(<SettingsScreen />);
    expect(screen.queryByTestId('settings-back')).toBeNull();
  });

  it('groups the rows: Play, Online, Help and Privacy, then the version', async () => {
    await render(<SettingsScreen {...allProps()} />);

    for (const name of ['Play', 'Online', 'Help', 'Privacy']) {
      expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    }
    // No setting sits on the index: each one is on its page.
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText(/^Tavlaki .*\(20\)$/)).toBeOnTheScreen();
  });

  it('shows the value of each group in its row', async () => {
    await render(<SettingsScreen {...allProps()} />);

    expect(screen.getByRole('button', { name: 'Gameplay' }).props.accessibilityHint).toBe(
      'Auto-confirm, hints, bot speed',
    );
    expect(screen.getByRole('button', { name: 'Board & look' }).props.accessibilityHint).toBe(
      'Walnut Kafeneio',
    );
    expect(screen.getByRole('button', { name: 'Sound & haptics' }).props.accessibilityHint).toBe(
      'Sound on, haptics on',
    );
    expect(screen.getByRole('button', { name: 'Language, Phone language' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Usage data, Off' })).toBeOnTheScreen();

    await act(async () => {
      settingsStore.setState({
        boardTheme: 'olive-inlay',
        sound: false,
        haptics: true,
        language: 'en',
      });
      consentStore.setState({ status: 'granted' });
    });
    expect(screen.getByRole('button', { name: 'Board & look' }).props.accessibilityHint).toBe(
      'Olive Inlay',
    );
    expect(screen.getByRole('button', { name: 'Sound & haptics' }).props.accessibilityHint).toBe(
      'Sound off, haptics on',
    );
    expect(screen.getByRole('button', { name: 'Language, English' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Usage data, On' })).toBeOnTheScreen();
  });

  it.each([
    ['Gameplay', 'gameplay'],
    ['Board & look', 'board'],
    ['Sound & haptics', 'sound'],
    ['Language, Phone language', 'language'],
    ['Usage data, Off', 'usage-data'],
  ] as const)('the %s row opens its page', async (name, page) => {
    const user = userEvent.setup();
    const props = allProps();
    await render(<SettingsScreen {...props} />);

    await user.press(screen.getByRole('button', { name }));
    expect(props.onPage).toHaveBeenCalledWith(page);
  });

  it('opens the screens outside Settings', async () => {
    const user = userEvent.setup();
    const props = allProps();
    await render(<SettingsScreen {...props} />);

    await user.press(screen.getByRole('button', { name: 'How to play' }));
    expect(props.onHowToPlay).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: "What's new" }));
    expect(props.onWhatsNew).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Account' }));
    expect(props.onAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeOnTheScreen();
  });

  it('shows Friends, Leaderboards and Blocked players only after online play', async () => {
    const props = allProps();
    const view = await render(<SettingsScreen {...props} visit={0} />);
    for (const id of ['settings-friends', 'settings-ratings', 'settings-blocked']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }

    rememberOnlineAccount();
    await view.rerender(<SettingsScreen {...props} visit={1} />);
    for (const id of ['settings-friends', 'settings-ratings', 'settings-blocked']) {
      expect(screen.getByTestId(id)).toBeOnTheScreen();
    }
  });

  it('has no Online group in a build with no online play', async () => {
    await render(<SettingsScreen onPage={jest.fn()} />);
    expect(screen.queryByRole('header', { name: 'Online' })).toBeNull();
    expect(screen.queryByTestId('settings-account-card')).toBeNull();
  });

  it("has no Help group without a way to open the tutorial, the rules or What's new", async () => {
    await render(<SettingsScreen />);
    expect(screen.queryByRole('header', { name: 'Help' })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('settings-learn-to-play')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('settings-whats-new')).not.toBeOnTheScreen();
  });

  it("puts a gold dot on What's new while an update has news", async () => {
    await render(<SettingsScreen onWhatsNew={jest.fn()} />);
    expect(screen.queryByTestId('settings-whats-new-dot')).toBeNull();
    expect(screen.getByRole('button', { name: "What's new" })).toBeOnTheScreen();
  });

  it('shows the dot when the last page seen is older (#471)', async () => {
    storage.setString(WHATS_NEW_STORAGE_KEY, RELEASES[1]!.date);
    try {
      await render(<SettingsScreen onWhatsNew={jest.fn()} />);
      expect(
        screen.getByTestId('settings-whats-new-dot', { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: "What's new. New in this update." }),
      ).toBeOnTheScreen();
    } finally {
      markWhatsNewSeenForTest();
    }
  });

  it('names the groups in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<SettingsScreen {...allProps()} />);
    for (const name of ['Παιχνίδι', 'Online', 'Βοήθεια', 'Απόρρητο']) {
      expect(screen.getByRole('header', { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'Ταμπλό και εμφάνιση' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Δεδομένα χρήσης, Κλειστό' })).toBeOnTheScreen();
  });

  it.each([
    ['Portes', 'portes'],
    ['Plakoto', 'plakoto'],
    ['Fevga', 'fevga'],
    ['Asodio', 'asodio'],
  ] as const)('Help → Learn to play lets the player pick %s (#159)', async (label, game) => {
    const user = userEvent.setup();
    const onLearnToPlay = jest.fn();
    await render(<SettingsScreen onLearnToPlay={onLearnToPlay} />);
    expect(screen.queryByTestId('tutorial-picker')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Learn to play' }));
    const picker = within(screen.getByTestId('tutorial-picker'));
    expect(picker.getByRole('header', { name: 'Learn to play' })).toBeOnTheScreen();
    await user.press(picker.getByRole('button', { name: label }));

    expect(onLearnToPlay).toHaveBeenCalledTimes(1);
    expect(onLearnToPlay).toHaveBeenCalledWith(game);
    expect(screen.queryByTestId('tutorial-picker')).not.toBeOnTheScreen();
  });

  it('closes the game picker with Cancel, and opens nothing', async () => {
    const user = userEvent.setup();
    const onLearnToPlay = jest.fn();
    await render(<SettingsScreen onLearnToPlay={onLearnToPlay} />);
    await user.press(screen.getByRole('button', { name: 'Learn to play' }));
    await user.press(
      within(screen.getByTestId('tutorial-picker')).getByRole('button', { name: 'Cancel' }),
    );
    expect(screen.queryByTestId('tutorial-picker')).not.toBeOnTheScreen();
    expect(onLearnToPlay).not.toHaveBeenCalled();
  });

  it('names the games in Greek in the picker', async () => {
    const user = userEvent.setup();
    await act(async () => {
      settingsStore.setState({ language: 'el' });
    });
    await render(<SettingsScreen onLearnToPlay={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Μάθε να παίζεις' }));
    const picker = within(screen.getByTestId('tutorial-picker'));
    for (const name of ['Πόρτες', 'Πλακωτό', 'Φεύγα', 'Ασόδιο', 'Άκυρο']) {
      expect(picker.getByRole('button', { name })).toBeOnTheScreen();
    }
    await act(async () => {
      settingsStore.setState({ language: 'system' });
    });
  });
});

describe('Settings → account card (#501)', () => {
  it('says "On this phone only" and asks the server nothing on a phone that never played online', async () => {
    const user = userEvent.setup();
    const ready = jest.spyOn(auth!, 'ready');
    const props = allProps();
    await render(<SettingsScreen {...props} />);

    const card = within(screen.getByTestId('settings-account-card'));
    expect(card.getByText('No online account')).toBeOnTheScreen();
    expect(card.getByText('On this phone only')).toBeOnTheScreen();
    expect(ready).not.toHaveBeenCalled();
    ready.mockRestore();

    await user.press(screen.getByTestId('settings-account-card'));
    expect(props.onAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the guest name of a guest, still on this phone only', async () => {
    const user = await signInForOnline(auth!);
    await onlineFake.invites.createInvite(GAME);
    rememberOnlineAccount();
    const number = onlineFake.guestNumber(user.id);
    await render(<SettingsScreen {...allProps()} />);

    const card = within(screen.getByTestId('settings-account-card'));
    expect(await card.findByText(`Guest ${number}`)).toBeOnTheScreen();
    expect(card.getByText('On this phone only')).toBeOnTheScreen();
  });

  it('shows the username of a saved account', async () => {
    const nonce = await auth!.keyNonce();
    await auth!.signInWithKey({
      provider: 'apple',
      idToken: memoryAppleIdToken('apple-1', nonce),
      nonce,
    });
    rememberOnlineAccount();
    await usernames!.setMine({ name: 'Lemoni', acceptTerms: TERMS_VERSION, ageChecked: true });
    await render(<SettingsScreen {...allProps()} />);

    const card = within(screen.getByTestId('settings-account-card'));
    expect(await card.findByText('Lemoni')).toBeOnTheScreen();
    expect(card.getByText('Saved account')).toBeOnTheScreen();
  });
});
