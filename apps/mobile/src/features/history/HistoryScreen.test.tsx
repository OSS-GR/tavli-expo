import { act, render, screen, userEvent } from '@testing-library/react-native';

import { SettingsScreen } from '@/features/settings/SettingsScreen';
import i18n from '@/i18n';
import { storage } from '@/services';

import { HistoryScreen } from './HistoryScreen';
import { HISTORY_STORAGE_KEY, type HistoryRecord } from './records';
import { historyStore } from './store';

const DAY = 24 * 60 * 60 * 1000;
const OCT_27 = Date.UTC(2026, 9, 27, 12);

function rec(over: Partial<HistoryRecord>): HistoryRecord {
  return {
    id: 'r',
    endedAt: OCT_27,
    mode: 'bot',
    game: 'portes',
    botLevel: 'easy',
    names: { white: '', black: '' },
    targetPoints: 3,
    score: { white: 3, black: 1 },
    end: 'finished',
    winner: 'white',
    resignedBy: null,
    games: 4,
    diploWins: { white: 1, black: 0 },
    draws: 0,
    matchNumber: 1,
    ...over,
  };
}

/** Newest first, as the store keeps them. */
const RECORDS: HistoryRecord[] = [
  rec({ id: 'c', endedAt: OCT_27, game: 'plakoto', botLevel: 'medium', winner: 'black' }),
  rec({
    id: 'b',
    endedAt: OCT_27 - DAY,
    mode: 'local',
    botLevel: null,
    names: { white: 'Maria', black: 'Nikos' },
    score: { white: 1, black: 3 },
    winner: 'black',
    draws: 1,
  }),
  rec({ id: 'a', endedAt: OCT_27 - 2 * DAY, end: 'abandoned', winner: null }),
];

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<HistoryScreen />', () => {
  it('shows an empty state with a Play button', async () => {
    const user = userEvent.setup();
    const onPlay = jest.fn();
    await render(<HistoryScreen records={[]} onPlay={onPlay} />);

    expect(screen.getByRole('header', { name: 'No matches yet' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalled();
    expect(screen.queryByRole('header', { name: 'Stats' })).toBeNull();
  });

  it('lists the matches newest first, one label per row', async () => {
    await render(<HistoryScreen records={RECORDS} onPlay={jest.fn()} />);

    expect(screen.getByTestId('history-row-0')).toHaveAccessibleName(
      'Plakoto · vs Bot (Medium), You 3 – 1 Bot · first to 3, Lost, Oct 27, 2026',
    );
    expect(screen.getByTestId('history-row-1')).toHaveAccessibleName(
      'Portes · pass-and-play, Maria 1 – 3 Nikos · first to 3, Nikos won, Oct 26, 2026',
    );
    expect(screen.getByTestId('history-row-2')).toHaveAccessibleName(
      'Portes · vs Bot (Easy), You 3 – 1 Bot · first to 3, Not finished, Oct 25, 2026',
    );
    expect(screen.queryByTestId('history-row-3')).toBeNull();
  });

  it('shows stats per game and per bot level', async () => {
    await render(<HistoryScreen records={RECORDS} onPlay={jest.fn()} />);

    expect(screen.getByRole('header', { name: 'Stats' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Portes' })).toBeOnTheScreen();
    expect(screen.getByTestId('history-stats-portes-easy')).toHaveAccessibleName(
      'Bot · Easy, Played 1, Won 0, Lost 0, Win rate —, Diplo wins 1, Draws 0, Not finished 1',
    );
    expect(screen.getByTestId('history-stats-portes-local')).toHaveAccessibleName(
      'Pass-and-play, Played 1, Draws 1',
    );
    expect(screen.getByTestId('history-stats-plakoto-medium')).toHaveAccessibleName(
      'Bot · Medium, Played 1, Won 0, Lost 1, Win rate 0%, Diplo wins 1, Draws 0',
    );
    expect(screen.queryByTestId('history-stats-fevga')).toBeNull();
  });

  it('speaks Greek, with Greek dates', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<HistoryScreen records={RECORDS.slice(0, 1)} onPlay={jest.fn()} />);

    expect(screen.getByRole('header', { name: 'Στατιστικά' })).toBeOnTheScreen();
    expect(screen.getByText('Ήττα')).toBeOnTheScreen();
    expect(screen.getByTestId('history-row-0')).toHaveAccessibleName(/Οκτ/);
  });
});

describe('Settings → History', () => {
  beforeEach(async () => {
    await act(async () => historyStore.getState().clear());
  });

  it('opens the history and clears it after a confirm step', async () => {
    const user = userEvent.setup();
    const onHistory = jest.fn();
    await act(async () => historyStore.getState().add(RECORDS[0]!));
    await render(<SettingsScreen onHistory={onHistory} />);

    await user.press(screen.getByRole('button', { name: 'Match history ›' }));
    expect(onHistory).toHaveBeenCalled();

    // Cancel keeps the history.
    await user.press(screen.getByRole('button', { name: 'Clear history' }));
    expect(screen.getByRole('header', { name: 'Clear history?' })).toBeOnTheScreen();
    await user.press(screen.getByTestId('dialog-cancel'));
    expect(historyStore.getState().records).toHaveLength(1);

    await user.press(screen.getByRole('button', { name: 'Clear history' }));
    await user.press(screen.getByRole('button', { name: 'Clear' }));
    expect(historyStore.getState().records).toEqual([]);
    expect(storage.getString(HISTORY_STORAGE_KEY)).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Clear history' })).toBeDisabled();
    expect(screen.getByText('Your history is empty.')).toBeOnTheScreen();
  });

  it('has no History section without the link', async () => {
    await render(<SettingsScreen />);
    expect(screen.queryByRole('header', { name: 'History' })).toBeNull();
  });
});
