import {
  createMatch,
  getPreset,
  recordGameResult,
  resignMatch,
  type GameEndReason,
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

/** A match to 3 with these games (winner, points, reason: bear-off by default). */
function playedMatch(
  games: readonly (readonly [PlayerId, number, GameEndReason?])[],
  target = 3,
): Match {
  let match = createMatch({ targetPoints: target, players: { white: 'a', black: 'b' } });
  for (const [winner, points, reason = 'borneOff'] of games) {
    const result: GameResult = { winner, points, reason };
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
    expect(rows.getByLabelText('Game 1 · Portes, You won, Mono, 1 point')).toBeOnTheScreen();
    expect(rows.getByLabelText('Game 2 · Portes, Bot won, Mono, 1 point')).toBeOnTheScreen();
    expect(rows.getByLabelText('Game 3 · Portes, You won, Diplo, 2 points')).toBeOnTheScreen();
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

  it('offers Review of the last game when the route gives it (#215)', async () => {
    const user = userEvent.setup();
    const match = playedMatch([
      ['white', 2],
      ['white', 1],
    ]);
    const onReview = jest.fn();
    await renderWithRoot(
      <MatchEndScreen
        setup={botSetup}
        match={match}
        onRematch={jest.fn()}
        onReview={onReview}
        onChangeSettings={jest.fn()}
        onHome={jest.fn()}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('has no Review button without a review to open', async () => {
    await show(botSetup, playedMatch([['white', 3]])).view;
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
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

  it('says who resigned the match and keeps the score', async () => {
    const match = resignMatch(playedMatch([['white', 1]]), 'white');
    await show(botSetup, match).view;
    expect(screen.getByText('Bot wins the match!')).toBeOnTheScreen();
    expect(screen.getByText('You resigned the match.')).toBeOnTheScreen();
    expect(screen.getByText('1 – 0')).toBeOnTheScreen();
  });

  // #181: Resign match never resets the score and never gives the target.
  it('a match resigned at the start shows 0 – 0 and says why', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await show(botSetup, resignMatch(playedMatch([]), 'white')).view;
    expect(screen.getByRole('header', { name: 'Bot wins the match!' })).toBeOnTheScreen();
    expect(screen.getByText('You resigned the match.')).toBeOnTheScreen();
    expect(screen.getByText('0 – 0')).toBeOnTheScreen();
    expect(screen.queryByTestId('match-games')).toBeNull();
    expect(announce).toHaveBeenCalledWith(
      'Bot wins the match! You resigned the match. You 0 – 0 Bot',
    );
  });

  it('a match resigned after a resigned game keeps its 0 – 2', async () => {
    const match = playedMatch([['black', 2, 'resigned']]);
    await show(botSetup, resignMatch(match, 'white')).view;
    expect(screen.getByText('You resigned the match.')).toBeOnTheScreen();
    expect(screen.getByText('0 – 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Final score: You 0 – 2 Bot')).toBeOnTheScreen();
    expect(screen.getByLabelText('Game 1 · Portes, Bot won, Diplo, 2 points')).toBeOnTheScreen();
  });

  it('pass-and-play: names the player who resigned the match', async () => {
    await show(localSetup, resignMatch(playedMatch([['white', 2]]), 'white')).view;
    expect(screen.getByText('Player 2 wins the match!')).toBeOnTheScreen();
    expect(screen.getByText('Maria resigned the match.')).toBeOnTheScreen();
    expect(screen.getByText('2 – 0')).toBeOnTheScreen();
  });

  it('says who ran out of time, and which games were won on time (#170)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const match = playedMatch([
      ['black', 1, 'timeout'],
      ['white', 1],
      ['white', 2, 'timeout'],
    ]);
    await show(botSetup, match).view;
    expect(screen.getByRole('header', { name: 'You won the match!' })).toBeOnTheScreen();
    // The last game ended the match on time: the Bot ran out of time.
    expect(screen.getByText('Bot ran out of time.')).toBeOnTheScreen();
    const rows = within(screen.getByTestId('match-games'));
    expect(
      rows.getByLabelText('Game 1 · Portes, Bot won on time, Mono, 1 point'),
    ).toBeOnTheScreen();
    expect(rows.getByLabelText('Game 2 · Portes, You won, Mono, 1 point')).toBeOnTheScreen();
    expect(
      rows.getByLabelText('Game 3 · Portes, You won on time, Diplo, 2 points'),
    ).toBeOnTheScreen();
    // The reason is read once, with the title and the score.
    expect(announce.mock.calls.filter(([text]) => String(text).includes('out of time'))).toEqual([
      ['You won the match! Bot ran out of time. You 3 – 1 Bot'],
    ]);
  });

  it('a time-out before the last game is not why the match ended', async () => {
    const match = playedMatch([
      ['white', 1, 'timeout'],
      ['white', 2],
    ]);
    await show(localSetup, match).view;
    expect(screen.queryByText(/ran out of time/)).toBeNull();
    expect(
      screen.getByLabelText('Game 1 · Portes, Maria won on time, Mono, 1 point'),
    ).toBeOnTheScreen();
  });

  it('a resign of the match after a time-out names the resign only', async () => {
    await show(localSetup, resignMatch(playedMatch([['black', 1, 'timeout']]), 'black')).view;
    expect(screen.getByText('Player 2 resigned the match.')).toBeOnTheScreen();
    expect(screen.queryByText(/ran out of time/)).toBeNull();
  });

  it('says a loss on time in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      await show(botSetup, playedMatch([['black', 2, 'timeout']], 1)).view;
      expect(screen.getByText('Τελείωσε ο χρόνος σου.')).toBeOnTheScreen();
      expect(
        screen.getByLabelText(
          'Παρτίδα 1 · Πόρτες, Υπολογιστής: κέρδισε λόγω χρόνου, Διπλό, 2 βαθμοί',
        ),
      ).toBeOnTheScreen();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
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
    expect(
      screen.getByLabelText('Game 1 · Portes, Player 2 won, Diplo, 2 points'),
    ).toBeOnTheScreen();
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
      expect(
        screen.getByLabelText('Παρτίδα 1 · Πόρτες, Κέρδισες, Διπλό, 2 βαθμοί'),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: /^Ρεβάνς/ })).toBeOnTheScreen();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('names the game of each row in a Tavli match (#109)', async () => {
    let match = createMatch({ rules: getPreset('tavli'), players: { white: 'a', black: 'b' } });
    for (const winner of ['white', 'black', 'white', 'white'] as const) {
      const result: GameResult = { winner, points: 1, reason: 'borneOff' };
      match = recordGameResult(match, result, { starter: match.nextStarter ?? 'white' });
    }
    await show({ ...botSetup, game: 'tavli' }, match).view;

    expect(screen.getByText('Tavli · vs Bot (Easy) · first to 3')).toBeOnTheScreen();
    const rows = within(screen.getByTestId('match-games'));
    expect(rows.getByText('Game 1 · Portes')).toBeOnTheScreen();
    expect(rows.getByText('Game 2 · Plakoto')).toBeOnTheScreen();
    expect(rows.getByText('Game 3 · Fevga')).toBeOnTheScreen();
    expect(rows.getByLabelText('Game 4 · Portes, You won, Mono, 1 point')).toBeOnTheScreen();
  });
});

describe('<MatchEndScreen /> announcement after a remount (#216)', () => {
  const props = { onRematch: jest.fn(), onChangeSettings: jest.fn(), onHome: jest.fn() };
  const match = playedMatch([
    ['white', 1],
    ['white', 2],
  ]);
  const result = 'You won the match! You 3 – 0 Bot';

  // React Native's Jest setup makes it a `jest.fn` that keeps calls between tests.
  const spyOnAnnounce = () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    return announce;
  };

  it('reads the result once per match: a remount does not read it again', async () => {
    const announce = spyOnAnnounce();
    await renderWithRoot(
      <MatchEndScreen setup={botSetup} match={match} announceKey="m1" {...props} />,
    );
    await screen.unmount();
    await renderWithRoot(
      <MatchEndScreen setup={botSetup} match={match} announceKey="m1" {...props} />,
    );
    expect(announce.mock.calls).toEqual([[result]]);
    // Another match (a rematch has a new key) is read.
    await screen.unmount();
    await renderWithRoot(
      <MatchEndScreen setup={botSetup} match={match} announceKey="m2" {...props} />,
    );
    expect(announce.mock.calls).toEqual([[result], [result]]);
  });

  it('without a key, reads the result on every mount', async () => {
    const announce = spyOnAnnounce();
    await renderWithRoot(<MatchEndScreen setup={botSetup} match={match} {...props} />);
    await screen.unmount();
    await renderWithRoot(<MatchEndScreen setup={botSetup} match={match} {...props} />);
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
