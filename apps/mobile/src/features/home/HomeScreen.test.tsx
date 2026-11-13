import type { Difficulty } from '@tavli/contracts';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import i18n from '@/i18n';

import { homeIntroDue, resetIntrosForTest } from '@/features/intro/introRuns';
import { startBoard } from '@/features/rules/content';

import { ContinueCard } from './ContinueCard';
import { HomeScreen, levelList, type HomeScreenProps } from './HomeScreen';
import { QUICK_START_GAMES } from './QuickStartHero';

function setup(
  botLevels: readonly Difficulty[] = ['easy'],
  quickStart: Partial<HomeScreenProps['quickStart']> = {},
) {
  const props = {
    onNewGame: jest.fn(),
    onSettings: jest.fn(),
    onHowToPlay: jest.fn(),
    onQuickStart: jest.fn(),
    onBotLevel: jest.fn(),
    quickStart: {
      games: QUICK_START_GAMES,
      last: 'portes',
      level: botLevels[0] ?? 'easy',
      ...quickStart,
    } satisfies HomeScreenProps['quickStart'],
    botLevels,
  };
  return props;
}

describe('<HomeScreen />', () => {
  it('starts a game vs the bot or pass-and-play', async () => {
    const user = userEvent.setup();
    const props = setup();
    await render(<HomeScreen {...props} />);

    await user.press(screen.getByRole('button', { name: 'Play vs bot' }));
    expect(props.onNewGame).toHaveBeenLastCalledWith('bot');
    await user.press(screen.getByRole('button', { name: /^Pass-and-play/ }));
    expect(props.onNewGame).toHaveBeenLastCalledWith('local');
    await user.press(screen.getByRole('button', { name: 'Settings' }));
    expect(props.onSettings).toHaveBeenCalled();
    await user.press(screen.getByRole('link', { name: 'How to play' }));
    expect(props.onHowToPlay).toHaveBeenCalled();
  });

  it("shows What's new by name left of Settings, only with a handler (#471)", async () => {
    const user = userEvent.setup();
    const onWhatsNew = jest.fn();
    const { rerender } = await render(<HomeScreen {...setup()} />);
    expect(screen.queryByTestId('home-whats-new')).toBeNull();

    await rerender(<HomeScreen {...setup()} onWhatsNew={onWhatsNew} />);
    expect(screen.getByText("What's new")).toBeOnTheScreen();
    expect(screen.queryByTestId('home-whats-new-dot', { includeHiddenElements: true })).toBeNull();
    expect(
      screen.queryByTestId('home-whats-new-heartbeat', { includeHiddenElements: true }),
    ).toBeNull();
    const row = screen.getByTestId('home-settings').parent!;
    const order = row.children.map((child) =>
      typeof child === 'string' ? child : (child.props.testID as string | undefined),
    );
    expect(order.indexOf('home-whats-new')).toBeLessThan(order.indexOf('home-settings'));
    await user.press(screen.getByRole('button', { name: "What's new" }));
    expect(onWhatsNew).toHaveBeenCalledTimes(1);
  });

  it("gives What's new a dot and a heartbeat while a release is new (#471)", async () => {
    await render(<HomeScreen {...setup()} onWhatsNew={jest.fn()} whatsNewFresh />);
    expect(
      screen.getByRole('button', { name: "What's new. New in this update." }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('home-whats-new-dot', { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getByTestId('home-whats-new-heartbeat', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("keeps What's new still with reduce motion: the dot only (#471)", async () => {
    const reduce = jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      await render(<HomeScreen {...setup()} onWhatsNew={jest.fn()} whatsNewFresh />);
      expect(
        screen.getByTestId('home-whats-new-dot', { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(
        screen.queryByTestId('home-whats-new-heartbeat', { includeHiddenElements: true }),
      ).toBeNull();
    } finally {
      reduce.mockRestore();
    }
  });

  it('plays the table scene by the greeting once per app run (#509)', async () => {
    resetIntrosForTest({ home: true });
    expect(homeIntroDue()).toBe(true);
    await render(<HomeScreen {...setup()} />);
    // Decoration: screen readers skip it.
    expect(screen.getByTestId('home-table-scene', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('home-table-scene')).toBeNull();
    expect(homeIntroDue()).toBe(false);
  });

  it('lists the bot levels on the "Play vs bot" tile next to a saved game (#182)', async () => {
    const { Text } = jest.requireActual('react-native');
    const save = <Text>Continue game</Text>;
    const { rerender } = await render(<HomeScreen {...setup(['easy'])} continueCard={save} />);
    expect(screen.getByRole('button', { name: 'Play vs bot, Easy' })).toBeOnTheScreen();
    await rerender(<HomeScreen {...setup(['easy', 'medium'])} continueCard={save} />);
    expect(screen.getByText('Easy or Medium')).toBeOnTheScreen();
    await rerender(<HomeScreen {...setup(['easy', 'medium', 'hard'])} continueCard={save} />);
    expect(screen.getByText('Easy, Medium or Hard')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Play vs bot, Easy, Medium or Hard' }),
    ).toBeOnTheScreen();
  });

  it('builds the level list from any levels, in both languages', () => {
    const en = i18n.getFixedT('en');
    const el = i18n.getFixedT('el');
    expect(levelList([], en)).toBeUndefined();
    expect(levelList(['medium'], en)).toBe('Medium');
    expect(levelList(['easy', 'hard'], en)).toBe('Easy or Hard');
    expect(levelList(['easy', 'medium', 'hard'], en)).toBe('Easy, Medium or Hard');
    expect(levelList(['easy'], el)).toBe('Εύκολο');
    expect(levelList(['easy', 'medium'], el)).toBe('Εύκολο ή Μέτριο');
    expect(levelList(['easy', 'medium', 'hard'], el)).toBe('Εύκολο, Μέτριο ή Δύσκολο');
  });

  it('opens Play a friend when online play is on (#281)', async () => {
    const user = userEvent.setup();
    const onPlayFriend = jest.fn();
    await render(<HomeScreen {...setup()} onPlayFriend={onPlayFriend} />);

    const friend = screen.getByRole('button', { name: 'Play a friend, Online, with a link' });
    expect(friend).toBeEnabled();
    await user.press(friend);
    expect(onPlayFriend).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('shows "Coming soon" for Play a friend without online play, and does not navigate', async () => {
    const user = userEvent.setup();
    const props = setup();
    await render(<HomeScreen {...props} />);

    const friend = screen.getByRole('button', {
      name: 'Play a friend, Online, with a link, Coming soon',
    });
    expect(friend).toBeDisabled();
    await user.press(friend);
    expect(screen.getByTestId('toast')).toHaveTextContent('Coming soon: play friends online.');
    expect(props.onNewGame).not.toHaveBeenCalled();
    // No online play: no way to join with a code either.
    expect(screen.queryByTestId('home-join')).toBeNull();
  });

  it('opens Join with a code when online play is on (#333)', async () => {
    const user = userEvent.setup();
    const onJoinWithCode = jest.fn();
    await render(<HomeScreen {...setup()} onJoinWithCode={onJoinWithCode} />);

    // One row in the links list now (#517); the line is its hint.
    const join = screen.getByRole('button', { name: 'Join with a code' });
    expect(join.props.accessibilityHint).toBe('Got a code from a friend?');
    expect(within(screen.getByTestId('home-links')).getByTestId('home-join')).toBeTruthy();
    await user.press(join);
    expect(onJoinWithCode).toHaveBeenCalledTimes(1);
  });

  it('opens Friends and Leaderboards from their tiles when online play is on (#486)', async () => {
    const user = userEvent.setup();
    const onFriends = jest.fn();
    const onRatings = jest.fn();
    await render(<HomeScreen {...setup()} onFriends={onFriends} onRatings={onRatings} />);

    await user.press(screen.getByRole('button', { name: 'Friends, Add and invite' }));
    expect(onFriends).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Leaderboards, Your rating' }));
    expect(onRatings).toHaveBeenCalledTimes(1);
  });

  it('shows no Friends or Leaderboards tile with no online play (#486)', async () => {
    await render(<HomeScreen {...setup()} />);
    expect(screen.queryByTestId('home-friends')).toBeNull();
    expect(screen.queryByTestId('home-ratings')).toBeNull();
  });

  it('hides the Continue card when there is no saved game, and shows one when given', async () => {
    const { rerender } = await render(<HomeScreen {...setup()} />);
    expect(screen.queryByText('Continue game')).toBeNull();
    const { Text } = jest.requireActual('react-native');
    await rerender(<HomeScreen {...setup()} continueCard={<Text>Continue game</Text>} />);
    expect(screen.getByText('Continue game')).toBeOnTheScreen();
  });

  it('shows Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      await render(<HomeScreen {...setup()} />);
      expect(screen.getByText('Παίξε με τον υπολογιστή')).toBeOnTheScreen();
      expect(screen.getByText('Δύο παίκτες, ένα κινητό')).toBeOnTheScreen();
      expect(screen.getByText('Εύκολο')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Παίξε Πόρτες' })).toBeOnTheScreen();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('shows the Continue card with game, opponent, score and time', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <HomeScreen
        {...setup()}
        continueCard={
          <ContinueCard
            summary={{
              game: 'Portes · vs Bot (Easy)',
              status: 'You 1 – 0 Bot · first to 3 · 12 min ago',
            }}
            onPress={onPress}
          />
        }
      />,
    );
    await user.press(
      screen.getByRole('button', {
        name: 'Continue game, Portes · vs Bot (Easy), You 1 – 0 Bot · first to 3 · 12 min ago',
      }),
    );
    expect(onPress).toHaveBeenCalled();
  });

  it('opens the match history from a small link (#142)', async () => {
    const user = userEvent.setup();
    const onHistory = jest.fn();
    await render(<HomeScreen {...setup()} onHistory={onHistory} />);
    await user.press(screen.getByRole('link', { name: 'History' }));
    expect(onHistory).toHaveBeenCalled();
  });

  it('greets for the part of the day (#342)', async () => {
    const { rerender } = await render(<HomeScreen {...setup()} hour={8} />);
    expect(screen.getByText('Good morning')).toBeOnTheScreen();
    await rerender(<HomeScreen {...setup()} hour={14} />);
    expect(screen.getByText('Good afternoon')).toBeOnTheScreen();
    await rerender(<HomeScreen {...setup()} hour={22} />);
    expect(screen.getByText('Good evening')).toBeOnTheScreen();
    expect(screen.getByText('Welcome to the kafeneio. Grab a chair.')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Tavlaki' })).toBeOnTheScreen();
  });

  it('makes Play vs bot the hero with the start board when there is no save (#342)', async () => {
    const user = userEvent.setup();
    const props = setup();
    await render(<HomeScreen {...props} />);

    expect(screen.getAllByTestId('home-vs-bot')).toHaveLength(1);
    expect(screen.getByTestId('home-vs-bot-board', { includeHiddenElements: true })).toBeTruthy();
    // The board is a picture only: screen readers use the title.
    expect(screen.queryByTestId('home-vs-bot-board')).toBeNull();
    expect(screen.getByRole('header', { name: 'More ways to play' })).toBeOnTheScreen();
    const title = screen.getByRole('button', { name: 'Play vs bot' });
    expect(title.props.accessibilityHint).toBe(
      'Opens New game: match length, level and house rules.',
    );
    await user.press(title);
    expect(props.onNewGame).toHaveBeenLastCalledWith('bot');
  });

  it('starts a game vs the bot with one tap on its button (#517)', async () => {
    const user = userEvent.setup();
    const props = setup(['easy', 'medium'], { last: 'fevga', level: 'medium' });
    await render(<HomeScreen {...props} />);

    for (const name of ['Portes', 'Plakoto', 'Fevga', 'Tavli']) {
      expect(screen.getByRole('button', { name: `Play ${name}` }).props.accessibilityHint).toBe(
        'Starts a match vs the bot at Medium.',
      );
    }
    await user.press(screen.getByRole('button', { name: 'Play Plakoto' }));
    expect(props.onQuickStart).toHaveBeenLastCalledWith('plakoto');
    expect(props.onNewGame).not.toHaveBeenCalled();
    // The Greek name sits under each one, as decoration.
    expect(within(screen.getByTestId('home-quick-tavli')).getByText('Τάβλι')).toBeOnTheScreen();
  });

  it('makes the last game played the one brass button (#517)', async () => {
    const { rerender } = await render(<HomeScreen {...setup(['easy'], { last: 'fevga' })} />);
    const brass = () =>
      QUICK_START_GAMES.filter(
        (game) =>
          within(screen.getByTestId(`home-quick-${game}`)).queryByTestId('home-quick-play-icon', {
            includeHiddenElements: true,
          }) !== null,
      );
    expect(brass()).toEqual(['fevga']);
    // A last game with no button (Asodio) leaves the first one brass.
    await rerender(<HomeScreen {...setup(['easy'], { last: 'asodio' })} />);
    expect(brass()).toEqual(['portes']);
    // Only the games the bot can play get a button.
    await rerender(<HomeScreen {...setup(['easy'], { games: ['portes', 'tavli'] })} />);
    expect(screen.queryByTestId('home-quick-plakoto')).toBeNull();
    expect(screen.getByTestId('home-quick-tavli')).toBeTruthy();
  });

  it('picks the bot level from the chip (#517)', async () => {
    const user = userEvent.setup();
    const props = setup(['easy', 'medium', 'hard'], { level: 'easy' });
    await render(<HomeScreen {...props} />);

    await user.press(screen.getByRole('button', { name: 'Bot level: Easy' }));
    await user.press(screen.getByRole('radio', { name: /^Hard/ }));
    expect(props.onBotLevel).toHaveBeenLastCalledWith('hard');
    expect(screen.queryByTestId('home-bot-level-picker')).toBeNull();
  });

  it('shows the one level as a plain label, with nothing to pick (#517)', async () => {
    await render(<HomeScreen {...setup(['easy'])} />);
    expect(screen.queryByRole('button', { name: 'Bot level: Easy' })).toBeNull();
    expect(screen.getByLabelText('Bot level: Easy')).toBeOnTheScreen();
  });

  it('shows no quick start next to a saved game: a start would replace it (#517)', async () => {
    const { Text } = jest.requireActual('react-native');
    await render(<HomeScreen {...setup()} continueCard={<Text>Continue game</Text>} />);
    expect(screen.queryByTestId('home-quick-start')).toBeNull();
    expect(screen.queryByTestId('home-quick-portes')).toBeNull();
  });

  it('moves Play vs bot to a tile when the hero is the saved game (#342)', async () => {
    const user = userEvent.setup();
    const props = setup();
    const onContinue = jest.fn();
    await render(
      <HomeScreen
        {...props}
        continueCard={
          <ContinueCard
            summary={{ game: 'Portes · vs Bot (Easy)', status: 'You 0 – 0 Bot' }}
            board={{ board: startBoard('portes'), direction: 'contrary' }}
            onPress={onContinue}
          />
        }
      />,
    );

    expect(screen.getByTestId('home-continue-board', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('home-vs-bot-board', { includeHiddenElements: true })).toBeNull();
    expect(screen.getAllByTestId('home-vs-bot')).toHaveLength(1);
    expect(screen.getByRole('header', { name: 'New game' })).toBeOnTheScreen();
    expect(screen.getByText('Continue')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Play vs bot, Easy' }));
    expect(props.onNewGame).toHaveBeenLastCalledWith('bot');
    await user.press(screen.getByRole('button', { name: /^Continue game, Portes/ }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('draws no board on the Continue card without a position', async () => {
    await render(
      <ContinueCard
        summary={{ game: 'Portes · pass-and-play', status: '1 – 0' }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('home-continue-board', { includeHiddenElements: true })).toBeNull();
  });

  it('shows a notice once, for example a broken save', async () => {
    await render(<HomeScreen {...setup()} notice="Your saved game could not be opened." />);
    expect(screen.getByTestId('toast')).toHaveTextContent('Your saved game could not be opened.');
  });
});
