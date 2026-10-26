import { act, render, screen, userEvent } from '@testing-library/react-native';

import i18n from '@/i18n';

import { DEFAULT_SETTINGS } from './settings';
import { SettingsScreen } from './SettingsScreen';
import { settingsStore } from './store';

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
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
});
