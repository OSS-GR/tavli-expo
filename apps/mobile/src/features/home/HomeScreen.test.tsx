import { act, render, screen, userEvent } from '@testing-library/react-native';

import i18n from '@/i18n';

import { ContinueCard } from './ContinueCard';
import { HomeScreen } from './HomeScreen';

function setup(botLevels: readonly ('easy' | 'medium' | 'hard')[] = ['easy']) {
  const props = {
    onNewGame: jest.fn(),
    onSettings: jest.fn(),
    onHowToPlay: jest.fn(),
    botLevels,
  };
  return props;
}

describe('<HomeScreen />', () => {
  it('starts a game vs the bot or pass-and-play', async () => {
    const user = userEvent.setup();
    const props = setup();
    await render(<HomeScreen {...props} />);

    await user.press(screen.getByRole('button', { name: /^Play vs bot/ }));
    expect(props.onNewGame).toHaveBeenLastCalledWith('bot');
    await user.press(screen.getByRole('button', { name: /^Pass-and-play/ }));
    expect(props.onNewGame).toHaveBeenLastCalledWith('local');
    await user.press(screen.getByRole('button', { name: 'Settings' }));
    expect(props.onSettings).toHaveBeenCalled();
    await user.press(screen.getByRole('link', { name: 'How to play' }));
    expect(props.onHowToPlay).toHaveBeenCalled();
  });

  it('says Medium is coming soon while only Easy works', async () => {
    await render(<HomeScreen {...setup(['easy'])} />);
    expect(screen.getByText('Easy for now. Medium is coming soon.')).toBeOnTheScreen();
  });

  it('says "Easy or Medium" once Medium works', async () => {
    await render(<HomeScreen {...setup(['easy', 'medium'])} />);
    expect(screen.getByText('Easy or Medium')).toBeOnTheScreen();
  });

  it('shows "Coming soon" for Play a friend and does not navigate', async () => {
    const user = userEvent.setup();
    const props = setup();
    await render(<HomeScreen {...props} />);

    const friend = screen.getByRole('button', { name: 'Play a friend, Online, Coming soon' });
    expect(friend).toBeDisabled();
    await user.press(friend);
    expect(screen.getByTestId('toast')).toHaveTextContent('Coming soon: play friends online.');
    expect(props.onNewGame).not.toHaveBeenCalled();
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
      expect(screen.getByText('ΝΕΟ ΠΑΙΧΝΙΔΙ')).toBeOnTheScreen();
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

  it('shows a notice once, for example a broken save', async () => {
    await render(<HomeScreen {...setup()} notice="Your saved game could not be opened." />);
    expect(screen.getByTestId('toast')).toHaveTextContent('Your saved game could not be opened.');
  });
});
