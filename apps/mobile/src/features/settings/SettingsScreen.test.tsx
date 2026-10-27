import type { createRecordingAnalytics } from '@tavli/contracts';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';

// The analytics wiring, which the root layout loads in the app.
import '@/features/analytics/store';
import { consentStore } from '@/features/privacy/consentStore';
import i18n from '@/i18n';
import { analytics } from '@/services';

import { DEFAULT_SETTINGS } from './settings';
import { SettingsScreen } from './SettingsScreen';
import { settingsStore } from './store';

const recorded = analytics as ReturnType<typeof createRecordingAnalytics>;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    consentStore.setState({ status: 'unset' });
  });
  recorded.sent.length = 0;
});

describe('<SettingsScreen />', () => {
  it('shows the settings in the phone language (English in tests)', async () => {
    await render(<SettingsScreen />);

    expect(screen.getByRole('header', { name: 'Game' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Sound' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Haptics' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Auto-confirm moves' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Show pip counts' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Phone language' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Flip' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Face-to-face' })).toBeDisabled();
  });

  it('switches to Greek at once when the user picks Ελληνικά', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    await user.press(screen.getByRole('radio', { name: 'Ελληνικά' }));

    expect(settingsStore.getState().language).toBe('el');
    expect(i18n.language).toBe('el');
    expect(await screen.findByRole('header', { name: 'Παιχνίδι' })).toBeOnTheScreen();
    expect(screen.getByText('ΠΑΙΧΝΙΔΙ')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Ήχος' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Αυτόματη επιβεβαίωση κινήσεων' })).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: 'Sound' })).not.toBeOnTheScreen();

    // Back to the phone language (English in tests).
    await user.press(screen.getByRole('radio', { name: 'Γλώσσα κινητού' }));
    expect(await screen.findByRole('switch', { name: 'Sound' })).toBeOnTheScreen();
  });

  it('saves a toggle in the store', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    await user.press(screen.getByRole('switch', { name: 'Sound' }));

    expect(settingsStore.getState().sound).toBe(false);
    expect(screen.getByRole('switch', { name: 'Sound' })).not.toBeChecked();
  });

  it('changes the board view and ignores the locked option', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    await user.press(screen.getByRole('radio', { name: 'Fixed' }));
    expect(settingsStore.getState().boardFlipMode).toBe('fixed');
    expect(screen.getByText('The board stays the same for both players.')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Face-to-face' }));
    expect(settingsStore.getState().boardFlipMode).toBe('fixed');
  });

  it('picks where your home is: bottom right by default, or bottom left (#175)', async () => {
    const user = userEvent.setup();
    await act(async () => {
      consentStore.setState({ status: 'granted' });
    });
    await render(<SettingsScreen />);

    const group = screen.getByTestId('settings-home-board');
    expect(group).toHaveAccessibleName('Your home');
    expect(within(group).getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Bottom left' })).not.toBeChecked();
    expect(screen.getByText('Your checkers go round counterclockwise.')).toBeOnTheScreen();
    expect(screen.getByText('Your checkers go round clockwise.')).toBeOnTheScreen();
    // A small board picture for each side, hidden from screen readers.
    for (const side of ['right', 'left']) {
      const preview = `settings-home-board-${side}-preview`;
      expect(screen.queryByTestId(preview)).toBeNull();
      expect(screen.getByTestId(preview, { includeHiddenElements: true })).toBeTruthy();
    }

    await user.press(within(group).getByRole('radio', { name: 'Bottom left' }));
    expect(settingsStore.getState().homeBoardSide).toBe('left');
    expect(within(group).getByRole('radio', { name: 'Bottom left' })).toBeChecked();
    // Only the key goes out, never the value.
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'homeBoardSide' },
    });

    await user.press(within(group).getByRole('radio', { name: 'Bottom right' }));
    expect(settingsStore.getState().homeBoardSide).toBe('right');
  });

  it('names the home board sides in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      await render(<SettingsScreen />);
      const group = screen.getByTestId('settings-home-board');
      expect(group).toHaveAccessibleName('Το σπίτι σου');
      expect(within(group).getByRole('radio', { name: 'Κάτω δεξιά' })).toBeChecked();
      expect(within(group).getByRole('radio', { name: 'Κάτω αριστερά' })).toBeOnTheScreen();
      expect(screen.getByText('Τα πούλια σου γυρίζουν δεξιόστροφα.')).toBeOnTheScreen();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('picks the move list: automatic by default, then on or off (#134)', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    expect(screen.getByRole('header', { name: 'Accessibility' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Automatic' })).toBeChecked();
    expect(
      screen.getByText('Shows a button for each move when a screen reader is on.'),
    ).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'On' }));
    expect(settingsStore.getState().moveList).toBe('on');
    expect(screen.getByText('Shows a button for each move under the board.')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Off' }));
    expect(settingsStore.getState().moveList).toBe('off');
    expect(screen.getByText('Play on the board only.')).toBeOnTheScreen();
  });

  it('picks the bot speed: Normal by default, then Slow or Fast (#172)', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
    expect(screen.getByText('The bot plays at a pace that is easy to follow.')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Slow' }));
    expect(settingsStore.getState().botSpeed).toBe('slow');
    expect(
      screen.getByText('The bot takes its time, so you can follow each move.'),
    ).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Fast' }));
    expect(settingsStore.getState().botSpeed).toBe('fast');
    expect(screen.getByText('The bot plays quickly.')).toBeOnTheScreen();
  });

  it('shows the bot speed in Greek', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    await user.press(screen.getByRole('radio', { name: 'Ελληνικά' }));
    expect(await screen.findByText('Ταχύτητα υπολογιστή')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Κανονικά' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Αργά' }));
    expect(settingsStore.getState().botSpeed).toBe('slow');
    expect(screen.getByRole('radio', { name: 'Γρήγορα' })).not.toBeChecked();

    await user.press(screen.getByRole('radio', { name: 'Γλώσσα κινητού' }));
    expect(await screen.findByRole('radio', { name: 'Slow' })).toBeChecked();
  });

  it('sends the bot speed key, never the value, when usage data is on', async () => {
    const user = userEvent.setup();
    await act(async () => {
      consentStore.setState({ status: 'granted' });
    });
    await render(<SettingsScreen />);

    await user.press(screen.getByRole('radio', { name: 'Fast' }));
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'botSpeed' },
    });
  });

  it('turns usage data on and off from Privacy (one switch for the Analytics port)', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    expect(screen.getByRole('header', { name: 'Privacy' })).toBeOnTheScreen();
    const toggle = screen.getByRole('switch', { name: 'Share anonymous usage data' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Privacy policy ›' })).toBeOnTheScreen();

    await user.press(toggle);
    expect(consentStore.getState().status).toBe('granted');
    expect(recorded.isOptedIn()).toBe(true);
    expect(screen.getByRole('switch', { name: 'Share anonymous usage data' })).toBeChecked();

    // Opted in: a settings change sends its key.
    await user.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'sound' },
    });

    await user.press(screen.getByRole('switch', { name: 'Share anonymous usage data' }));
    expect(consentStore.getState().status).toBe('denied');
    expect(recorded.isOptedIn()).toBe(false);

    // Opted out: nothing more is sent.
    const count = recorded.sent.length;
    await user.press(screen.getByRole('switch', { name: 'Haptics' }));
    expect(recorded.sent).toHaveLength(count);
  });

  it('has no Help section without a way to open the tutorial', async () => {
    await render(<SettingsScreen />);
    expect(screen.queryByRole('header', { name: 'Help' })).not.toBeOnTheScreen();
    expect(screen.queryByTestId('settings-learn-to-play')).not.toBeOnTheScreen();
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

    await user.press(screen.getByRole('button', { name: 'Learn to play ›' }));
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
    await user.press(screen.getByRole('button', { name: 'Learn to play ›' }));
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
    await user.press(screen.getByRole('button', { name: 'Μάθε να παίζεις ›' }));
    const picker = within(screen.getByTestId('tutorial-picker'));
    for (const name of ['Πόρτες', 'Πλακωτό', 'Φεύγα', 'Ασόδιο', 'Άκυρο']) {
      expect(picker.getByRole('button', { name })).toBeOnTheScreen();
    }
    await act(async () => {
      settingsStore.setState({ language: 'system' });
    });
  });
});
