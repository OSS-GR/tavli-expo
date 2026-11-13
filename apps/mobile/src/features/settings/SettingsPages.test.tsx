/**
 * The pages of Settings (#501): Gameplay, Board & look, Sound & haptics,
 * Language, Move list and Usage data. Each change saves at once and sends
 * only the setting's key (when usage data is on).
 */
import type { createRecordingAnalytics } from '@tavli/contracts';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';

// The analytics wiring, which the root layout loads in the app.
import '@/features/analytics/store';
import { consentStore } from '@/features/privacy/consentStore';
import i18n from '@/i18n';
import { analytics } from '@/services';

import { BoardLookSettings } from './BoardLookSettings';
import { GameplaySettings } from './GameplaySettings';
import { DEFAULT_SETTINGS } from './settings';
import {
  LanguageSettings,
  MoveListSettings,
  SoundSettings,
  UsageDataSettings,
} from './SettingsSubPages';
import { settingsStore } from './store';

const recorded = analytics as ReturnType<typeof createRecordingAnalytics>;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    consentStore.setState({ status: 'unset' });
  });
  recorded.sent.length = 0;
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function grantUsageData() {
  await act(async () => {
    consentStore.setState({ status: 'granted' });
  });
}

describe('Settings → Gameplay', () => {
  it('shows the toggles, the bot speed and the move list row', async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    const onMoveList = jest.fn();
    await render(<GameplaySettings onBack={onBack} onMoveList={onMoveList} />);

    expect(screen.getByRole('header', { name: 'Gameplay' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Auto-confirm moves' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Show hints' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Offer fast forward in races' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
    expect(screen.getByRole('header', { name: 'Accessibility' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Move list, Automatic' }));
    expect(onMoveList).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('the move list row shows the saved choice', async () => {
    await act(async () => {
      settingsStore.setState({ moveList: 'off' });
    });
    await render(<GameplaySettings onMoveList={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Move list, Off' })).toBeOnTheScreen();
  });

  it('turns the Hint button off and on (#209), and sends only the key', async () => {
    const user = userEvent.setup();
    await grantUsageData();
    await render(<GameplaySettings />);

    await user.press(screen.getByRole('switch', { name: 'Show hints' }));
    expect(settingsStore.getState().showHints).toBe(false);
    expect(screen.getByRole('switch', { name: 'Show hints' })).not.toBeChecked();
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'showHints' },
    });
    await user.press(screen.getByRole('switch', { name: 'Show hints' }));
    expect(settingsStore.getState().showHints).toBe(true);
  });

  it('turns the race card off and back on, and sends only the key', async () => {
    const user = userEvent.setup();
    await grantUsageData();
    await render(<GameplaySettings />);

    const toggle = () => screen.getByRole('switch', { name: 'Offer fast forward in races' });
    await user.press(toggle());
    expect(settingsStore.getState().offerFastForward).toBe(false);
    expect(toggle()).not.toBeChecked();
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'offerFastForward' },
    });
    // "Don't ask again" on the card turns it off; the switch turns it back on.
    await user.press(toggle());
    expect(settingsStore.getState().offerFastForward).toBe(true);
  });

  it('picks the bot speed: Normal by default, then Slow or Fast (#172)', async () => {
    const user = userEvent.setup();
    await grantUsageData();
    await render(<GameplaySettings />);

    expect(screen.getByText('The bot plays at a pace that is easy to follow.')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Slow' }));
    expect(settingsStore.getState().botSpeed).toBe('slow');
    expect(
      screen.getByText('The bot takes its time, so you can follow each move.'),
    ).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Fast' }));
    expect(settingsStore.getState().botSpeed).toBe('fast');
    expect(screen.getByText('The bot plays quickly.')).toBeOnTheScreen();
    // Only the key goes out, never the value.
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'botSpeed' },
    });
  });

  it('shows the bot speed in Greek', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<GameplaySettings />);

    expect(screen.getByText('Ταχύτητα υπολογιστή')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Κανονικά' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Αργά' }));
    expect(settingsStore.getState().botSpeed).toBe('slow');
    expect(screen.getByRole('radio', { name: 'Γρήγορα' })).not.toBeChecked();
  });
});

describe('Settings → Board & look', () => {
  it('shows a big preview of the board as picked', async () => {
    await render(<BoardLookSettings />);
    expect(screen.getByRole('header', { name: 'Board & look' })).toBeOnTheScreen();
    // Hidden from screen readers: the picks below say the same.
    expect(screen.queryByTestId('settings-board-preview')).toBeNull();
    expect(
      screen.getByTestId('settings-board-preview', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('changes the pass-and-play view: Flip or Fixed', async () => {
    const user = userEvent.setup();
    await render(<BoardLookSettings />);

    const group = screen.getByTestId('settings-board-view');
    expect(group).toHaveAccessibleName('Pass-and-play view');
    expect(within(group).getByRole('radio', { name: 'Flip' })).toBeChecked();
    expect(within(group).queryByRole('radio', { name: 'Face-to-face' })).toBeNull();

    await user.press(within(group).getByRole('radio', { name: 'Fixed' }));
    expect(settingsStore.getState().boardFlipMode).toBe('fixed');
    expect(screen.getByText('The board stays the same for both players.')).toBeOnTheScreen();
  });

  it('shows Face-to-face as a locked row that says it comes later', async () => {
    const user = userEvent.setup();
    await render(<BoardLookSettings />);

    const row = screen.getByTestId('settings-face-to-face');
    expect(row).toHaveAccessibleName('Face-to-face');
    expect(row.props.accessibilityHint).toBe('Face-to-face view comes in a later update.');
    expect(row).toBeDisabled();
    expect(within(row).getByText('Soon')).toBeOnTheScreen();
    await user.press(row);
    expect(settingsStore.getState().boardFlipMode).toBe('flip');
  });

  it('picks where your home is: bottom right by default, or bottom left (#175)', async () => {
    const user = userEvent.setup();
    await grantUsageData();
    await render(<BoardLookSettings />);

    const group = screen.getByTestId('settings-home-board');
    expect(group).toHaveAccessibleName('Your home');
    expect(within(group).getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Bottom left' })).not.toBeChecked();
    expect(screen.getByText('Your checkers go round counterclockwise.')).toBeOnTheScreen();

    await user.press(within(group).getByRole('radio', { name: 'Bottom left' }));
    expect(settingsStore.getState().homeBoardSide).toBe('left');
    expect(within(group).getByRole('radio', { name: 'Bottom left' })).toBeChecked();
    expect(screen.getByText('Your checkers go round clockwise.')).toBeOnTheScreen();
    // Only the key goes out, never the value.
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'homeBoardSide' },
    });
  });

  it('names the home board sides in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<BoardLookSettings />);
    const group = screen.getByTestId('settings-home-board');
    expect(group).toHaveAccessibleName('Το σπίτι σου');
    expect(within(group).getByRole('radio', { name: 'Κάτω δεξιά' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Κάτω αριστερά' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Ταμπλό και εμφάνιση' })).toBeOnTheScreen();
  });

  it('picks the board layout: tall by default, or classic (#184)', async () => {
    const user = userEvent.setup();
    await grantUsageData();
    await render(<BoardLookSettings />);

    const group = screen.getByTestId('settings-board-layout');
    expect(group).toHaveAccessibleName('Board layout');
    expect(within(group).getByRole('radio', { name: 'Tall' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Classic' })).not.toBeChecked();
    expect(
      screen.getByText('The board on its side, as big as the screen allows. Bigger checkers.'),
    ).toBeOnTheScreen();

    await user.press(within(group).getByRole('radio', { name: 'Classic' }));
    expect(settingsStore.getState().boardLayout).toBe('classic');
    expect(
      screen.getByText('The board as on a table, as wide as the screen. Smaller checkers.'),
    ).toBeOnTheScreen();
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'boardLayout' },
    });
  });

  it('names the board layouts in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<BoardLookSettings />);
    const group = screen.getByTestId('settings-board-layout');
    expect(group).toHaveAccessibleName('Διάταξη ταμπλό');
    expect(within(group).getByRole('radio', { name: 'Ψηλό' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Κλασικό' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Μόνο για το παιχνίδι. Το μάθημα και οι κανόνες δείχνουν πάντα το ψηλό ταμπλό.',
      ),
    ).toBeOnTheScreen();
  });

  it('keeps the app colors next to the board', async () => {
    await render(<BoardLookSettings />);
    const list = within(screen.getByTestId('settings-theme'));
    expect(screen.getByTestId('settings-theme')).toHaveAccessibleName('App colors');
    // Match the board first and picked, then each theme (#528).
    expect(list.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
      'Match the board',
      'Walnut Kafeneio',
      'Olive Inlay',
      'Kafeneio Night',
    ]);
    expect(list.getByRole('radio', { name: 'Match the board' })).toBeChecked();
  });

  it('matches the app colors to the board, or keeps a picked theme (#528)', async () => {
    const user = userEvent.setup();
    await render(<BoardLookSettings />);
    const list = () => within(screen.getByTestId('settings-theme'));
    const strip = () => within(screen.getByTestId('settings-board-theme'));
    expect(screen.getByText('Default. Now: Walnut Kafeneio colors, dark')).toBeOnTheScreen();
    // The board hint says the app colors follow it, and the list sits right under it.
    expect(
      screen.getByText(
        'The game, the tutorial and the rules use this board. The app colors change with it (App colors, below).',
      ),
    ).toBeOnTheScreen();

    // Match the board: the Olive Inlay board brings its light colors.
    await user.press(strip().getByRole('radio', { name: 'Olive Inlay' }));
    expect(settingsStore.getState().theme).toBe('match-board');
    expect(screen.getByText('Default. Now: Olive Inlay colors, light')).toBeOnTheScreen();

    // A picked theme stays with any board.
    await user.press(list().getByRole('radio', { name: 'Kafeneio Night' }));
    expect(settingsStore.getState().theme).toBe('kafeneio-night');
    expect(list().getByRole('radio', { name: 'Kafeneio Night' })).toBeChecked();
    expect(list().getByRole('radio', { name: 'Match the board' })).not.toBeChecked();
    await user.press(strip().getByRole('radio', { name: 'Walnut Kafeneio' }));
    expect(settingsStore.getState().theme).toBe('kafeneio-night');
    expect(settingsStore.getState().boardTheme).toBe('walnut-kafeneio');
    expect(
      screen.getByText('The game, the tutorial and the rules use this board.'),
    ).toBeOnTheScreen();
  });

  it('names the app colors in Greek (#528)', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<BoardLookSettings />);
    const list = within(screen.getByTestId('settings-theme'));
    expect(list.getByRole('radio', { name: 'Όπως το ταμπλό' })).toBeChecked();
    expect(list.getByRole('radio', { name: 'Ελιά με ένθετα' })).toBeOnTheScreen();
    expect(screen.getByText('Αρχική επιλογή. Τώρα: Καρυδιά Καφενείου, σκούρα')).toBeOnTheScreen();
  });
});

describe('Settings → Sound & haptics', () => {
  it('saves each toggle in the store', async () => {
    const user = userEvent.setup();
    await render(<SoundSettings />);

    expect(screen.getByRole('header', { name: 'Sound & haptics' })).toBeOnTheScreen();
    await user.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(settingsStore.getState().sound).toBe(false);
    expect(screen.getByRole('switch', { name: 'Sound' })).not.toBeChecked();
    await user.press(screen.getByRole('switch', { name: 'Haptics' }));
    expect(settingsStore.getState().haptics).toBe(false);
  });
});

describe('Settings → Language', () => {
  it('switches to Greek at once, then back to the phone language', async () => {
    const user = userEvent.setup();
    await render(<LanguageSettings />);
    expect(screen.getByRole('radio', { name: 'Phone language' })).toBeChecked();

    await user.press(screen.getByRole('radio', { name: 'Ελληνικά' }));
    expect(settingsStore.getState().language).toBe('el');
    expect(i18n.language).toBe('el');
    expect(await screen.findByRole('header', { name: 'Γλώσσα' })).toBeOnTheScreen();

    // Back to the phone language (English in tests).
    await user.press(screen.getByRole('radio', { name: 'Γλώσσα κινητού' }));
    expect(await screen.findByRole('header', { name: 'Language' })).toBeOnTheScreen();
    expect(settingsStore.getState().language).toBe('system');
  });

  it('has no pip count row (#238)', async () => {
    await render(<LanguageSettings />);
    expect(screen.queryByTestId('settings-pip-counts')).toBeNull();
    expect(screen.queryByText(/pip/i)).toBeNull();
  });
});

describe('Settings → Move list', () => {
  it('picks the move list: automatic by default, then on or off (#134)', async () => {
    const user = userEvent.setup();
    await render(<MoveListSettings />);

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
});

describe('Settings → Usage data', () => {
  it('turns usage data on and off (one switch for the Analytics port)', async () => {
    const user = userEvent.setup();
    await render(<UsageDataSettings />);

    const toggle = () => screen.getByRole('switch', { name: 'Share anonymous usage data' });
    expect(toggle()).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeOnTheScreen();

    await user.press(toggle());
    expect(consentStore.getState().status).toBe('granted');
    expect(recorded.isOptedIn()).toBe(true);
    expect(toggle()).toBeChecked();

    // Opted in: a settings change sends its key.
    await act(async () => {
      settingsStore.getState().setSetting('sound', false);
    });
    expect(recorded.sent.at(-1)).toEqual({
      type: 'track',
      event: 'settings_changed',
      props: { key: 'sound' },
    });

    await user.press(toggle());
    expect(consentStore.getState().status).toBe('denied');
    expect(recorded.isOptedIn()).toBe(false);

    // Opted out: nothing more is sent.
    const count = recorded.sent.length;
    await act(async () => {
      settingsStore.getState().setSetting('haptics', false);
    });
    expect(recorded.sent).toHaveLength(count);
  });
});
