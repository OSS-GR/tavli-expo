import {
  createMatch,
  recordGameResult,
  resignMatch,
  type GameResult,
  type Match,
  type PlayerId,
} from '@tavli/engine';
import { act, screen, userEvent, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import i18n from '@/i18n';

import { MatchEndScreen } from './MatchEndScreen';
import { defaultSetup, type MatchSetup } from './setup';

import { renderWithRoot } from '../../../test/render';

const botSetup = defaultSetup('bot');
const localSetup: MatchSetup = { ...defaultSetup('local'), names: { white: 'Maria', black: '' } };

/** A match to 3 with these games (winner, points), each won by bearing off. */
function playedMatch(games: readonly [PlayerId, number][], target = 3): Match {
  let match = createMatch({ targetPoints: target, players: { white: 'a', black: 'b' } });
  for (const [winner, points] of games) {
    const result: GameResult = { winner, points, reason: 'borneOff' };
    match = recordGameResult(match, result, { starter: match.nextStarter ?? 'white' });
  }
  return match;
}

function show(setup: MatchSetup, match: Match) {
  const props = { onRematch: jest.fn(), onChangeSettings: jest.fn(), onHome: jest.fn() };
  const view = renderWithRoot(<MatchEndScreen setup={setup} match={match} {...props} />);
  return { props, view };
}

const hidden = { includeHiddenElements: true };

afterEach(() => {
  jest.restoreAllMocks();
});

describe('<MatchEndScreen />', () => {
  it('shows the win, the final score, every game and the celebration', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const match = playedMatch([
      ['white', 1],
      ['black', 1],
      ['white', 2],
    ]);
    await show(botSetup, match).view;

    expect(screen.getByRole('header', { name: 'You won the match!' })).toBeOnTheScreen();
    expect(screen.getByText('3 – 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Final score: You 3 – 1 Bot')).toBeOnTheScreen();
    expect(screen.getByText('Portes · vs Bot (Easy) · first to 3')).toBeOnTheScreen();

    const rows = within(screen.getByTestId('match-games'));
    expect(rows.getByLabelText('Game 1, You won, Mono, 1 point')).toBeOnTheScreen();
    expect(rows.getByLabelText('Game 2, Bot won, Mono, 1 point')).toBeOnTheScreen();
    expect(rows.getByLabelText('Game 3, You won, Diplo, 2 points')).toBeOnTheScreen();
    expect(within(screen.getByTestId('match-game-3')).getByText('+2')).toBeOnTheScreen();

    // The human won: cup and confetti, hidden from screen readers.
    const area = screen.getByTestId('match-celebration', hidden);
    // 14 confetti pieces and the cup.
    expect(area.children).toHaveLength(15);
    expect(screen.getByTestId('match-celebration-icon', hidden)).toHaveTextContent('🏆');
    expect(announce).toHaveBeenCalledWith('You won the match! You 3 – 1 Bot');
  });

  it('offers a rematch where the last winner starts, change settings and home', async () => {
    const user = userEvent.setup();
    const { props, view } = show(
      botSetup,
      playedMatch([
        ['white', 2],
        ['white', 1],
      ]),
    );
    await view;

    // Rematch is the main button; the engine's rule says who starts.
    await user.press(screen.getByRole('button', { name: 'Rematch, Same settings · you start' }));
    expect(props.onRematch).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Change settings' }));
    expect(props.onChangeSettings).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(props.onHome).toHaveBeenCalledTimes(1);
  });

  it('a lost match looks the same, with no celebration', async () => {
    await show(
      botSetup,
      playedMatch([
        ['black', 2],
        ['black', 1],
      ]),
    ).view;
    expect(screen.getByRole('header', { name: 'Bot wins the match!' })).toBeOnTheScreen();
    expect(screen.getByText('0 – 3')).toBeOnTheScreen();
    expect(screen.queryByTestId('match-celebration', hidden)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Rematch, Same settings · Bot starts' }),
    ).toBeOnTheScreen();
  });

  it('says who resigned', async () => {
    const match = resignMatch(playedMatch([['white', 1]]), 'white');
    await show(botSetup, match).view;
    expect(screen.getByText('Bot wins the match!')).toBeOnTheScreen();
    expect(screen.getByText('You resigned.')).toBeOnTheScreen();
    expect(screen.getByText('1 – 0')).toBeOnTheScreen();
  });

  it('pass-and-play: names, and the winner is always celebrated', async () => {
    await show(
      localSetup,
      playedMatch([
        ['black', 2],
        ['black', 2],
      ]),
    ).view;
    expect(screen.getByText('Player 2 wins the match!')).toBeOnTheScreen();
    expect(screen.getByText('Portes · pass-and-play · first to 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Game 1, Player 2 won, Diplo, 2 points')).toBeOnTheScreen();
    expect(screen.getByTestId('match-celebration', hidden)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Rematch, Same settings · Player 2 starts' }),
    ).toBeOnTheScreen();
  });

  it('with reduce motion on, shows the still cup and no confetti', async () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const { view } = show(
      botSetup,
      playedMatch([
        ['white', 2],
        ['white', 2],
      ]),
    );
    await view;
    const area = screen.getByTestId('match-celebration', hidden);
    // Only the icon is left inside the area.
    expect(area.children).toHaveLength(1);
    expect(screen.getByTestId('match-celebration-icon', hidden)).toBeOnTheScreen();
  });

  it('shows the Greek texts', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      await show(
        botSetup,
        playedMatch([
          ['white', 2],
          ['white', 1],
        ]),
      ).view;
      expect(screen.getByText('Κέρδισες το ματς!')).toBeOnTheScreen();
      expect(screen.getByLabelText('Παρτίδα 1, Κέρδισες, Διπλό, 2 βαθμοί')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Ρεβάνς/ })).toBeOnTheScreen();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });
});
