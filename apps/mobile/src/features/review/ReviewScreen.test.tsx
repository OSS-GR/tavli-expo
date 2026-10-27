/**
 * The review screen (#215): busy first, then the biggest mistakes with
 * the played and the best turn, or "Well played!". Scripted Portes games
 * (`test/reviewGame.ts`) on fake timers: the work runs on timers.
 */
import { BotError, type Analyzer } from '@tavli/bot';
import { act, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { defaultSetup, type MatchSetup } from '@/features/match/setup';
import i18n from '@/i18n';

import { runOnFakeTimers } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';
import { allBest, oneBadTurn, testAnalyzer } from '../../../test/reviewGame';

import { lastGameTurns, reviewGame } from './review';
import { ReviewScreen } from './ReviewScreen';
import { mistakeText } from './reviewText';

runOnFakeTimers();

const vsBot = defaultSetup('bot');
const local: MatchSetup = { ...defaultSetup('local'), names: { white: 'Maria', black: 'Bob' } };

let announce: jest.SpyInstance;
beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(async () => {
  announce.mockRestore();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<ReviewScreen />', () => {
  it('shows the known bad turn first, with the best turn, after a busy state', async () => {
    const flow = oneBadTurn();
    const [mistake] = reviewGame(flow, ['white'], testAnalyzer);
    const text = mistakeText(i18n.t, mistake!, null);
    await renderWithRoot(<ReviewScreen setup={vsBot} flow={flow} />);
    // The work runs after the first render.
    expect(screen.getByTestId('review-busy')).toBeOnTheScreen();
    expect(screen.getByText('Looking at the moves…')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Game 1 · Portes' })).toBeOnTheScreen();

    const card = await screen.findByTestId('review-mistake-1');
    expect(screen.queryByTestId('review-busy')).toBeNull();
    expect(screen.getByText('Your biggest mistakes, the biggest first.')).toBeOnTheScreen();
    expect(within(card).getByText('Big mistake')).toBeOnTheScreen();
    expect(within(card).getByText('Turn 5 · roll 6-5')).toBeOnTheScreen();
    expect(within(card).getByText('You played: 8 → 2, 8 → 3 · hit')).toBeOnTheScreen();
    expect(within(card).getByText('Best: 24 → 18 → 13 · hit')).toBeOnTheScreen();
    expect(text.played).toBe('You played: 8 → 2, 8 → 3 · hit');
    // One group for screen readers, with every line in full words.
    expect(card).toHaveAccessibleName(text.label);
    expect(card.props.accessible).toBe(true);
    expect(text.label).toBe(
      'Big mistake. Turn 5 · roll 6-5. ' +
        'You played: Checker from point 8 to point 2; Checker from point 8 to point 3, hits. ' +
        'Best: Checker from point 24 to point 18, hits, then to point 13',
    );
    // The board inside is hidden from screen readers.
    expect(screen.queryByTestId('review-mistake-1-board')).toBeNull();
    const board = screen.getByTestId('review-mistake-1-board', { includeHiddenElements: true });
    expect(board).toBeTruthy();
    // The bot's turns are not listed: Black played its worst turns.
    expect(screen.queryByTestId('review-mistake-2')).toBeNull();
    expect(announce).toHaveBeenCalledWith('Your biggest mistakes, the biggest first.');
  });

  it('lists both players in pass-and-play, with their names', async () => {
    const flow = oneBadTurn();
    const mistakes = reviewGame(flow, ['white', 'black'], testAnalyzer);
    expect(mistakes.map((m) => m.turn.player)).toEqual(['black', 'black', 'white']);
    await renderWithRoot(<ReviewScreen setup={local} flow={flow} />);
    await screen.findByTestId('review-mistake-3');
    expect(screen.getByText('The biggest mistakes, the biggest first.')).toBeOnTheScreen();
    expect(within(screen.getByTestId('review-mistake-1')).getByText(/^Bob played: /)).toBeTruthy();
    expect(
      within(screen.getByTestId('review-mistake-3')).getByText('Maria played: 8 → 2, 8 → 3 · hit'),
    ).toBeTruthy();
    expect(screen.queryByTestId('review-mistake-4')).toBeNull();
  });

  it('says "Well played" when no turn passes the threshold', async () => {
    await renderWithRoot(<ReviewScreen setup={vsBot} flow={allBest()} />);
    expect(await screen.findByText('Well played! No mistakes found.')).toBeOnTheScreen();
    expect(screen.queryByTestId('review-mistake-1')).toBeNull();
    expect(announce).toHaveBeenCalledWith('Well played! No mistakes found.');
  });

  it('says so when the game had no turn to review', async () => {
    const flow = oneBadTurn();
    // The log up to the start: nobody played.
    const empty = { ...flow, log: flow.log.slice(0, 1) };
    expect(lastGameTurns(empty, ['white'])).toEqual([]);
    await renderWithRoot(<ReviewScreen setup={vsBot} flow={empty} />);
    expect(await screen.findByText('No moves to review in this game.')).toBeOnTheScreen();
  });

  it('says when the game cannot be reviewed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: Analyzer = {
      ...testAnalyzer,
      rankTurns: () => {
        throw new BotError('NOT_IMPLEMENTED', 'no evaluator');
      },
    };
    try {
      await renderWithRoot(<ReviewScreen setup={vsBot} flow={oneBadTurn()} analyzer={broken} />);
      expect(await screen.findByText('This game cannot be reviewed.')).toBeOnTheScreen();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('speaks Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await renderWithRoot(<ReviewScreen setup={vsBot} flow={oneBadTurn()} />);
    expect(screen.getByText('Ελέγχω τις κινήσεις…')).toBeOnTheScreen();
    const card = await screen.findByTestId('review-mistake-1');
    expect(screen.getByRole('header', { name: 'Παρτίδα 1 · Πόρτες' })).toBeOnTheScreen();
    expect(screen.getByText('Τα μεγαλύτερα λάθη σου, πρώτα το μεγαλύτερο.')).toBeOnTheScreen();
    expect(within(card).getByText('Μεγάλο λάθος')).toBeOnTheScreen();
    expect(within(card).getByText('Γύρος 5 · ζάρια 6-5')).toBeOnTheScreen();
    expect(within(card).getByText('Έπαιξες: 8 → 2, 8 → 3 · χτύπημα')).toBeOnTheScreen();
    expect(within(card).getByText('Καλύτερο: 24 → 18 → 13 · χτύπημα')).toBeOnTheScreen();
  });
});
