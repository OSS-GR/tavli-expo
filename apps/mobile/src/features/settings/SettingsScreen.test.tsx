import type { createRecordingAnalytics } from '@tavli/contracts';
import { act, render, screen, userEvent } from '@testing-library/react-native';

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
});
