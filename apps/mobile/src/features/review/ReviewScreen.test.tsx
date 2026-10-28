/**
 * The review screen (#215): busy first, then the biggest mistakes with
 * the played and the best turn, or "Well played!". Each card's switch
 * marks the best or the played turn on its board (#230). Scripted Portes
 * games (`test/reviewGame.ts`) on fake timers: the work runs on timers.
 */
import { BotError, type Analyzer } from '@tavli/bot';
import type { CrashReporter, RecordingCrashReporter } from '@tavli/contracts';
import type { Turn } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { boardLayout } from '@/features/board/BoardCanvas';
import type { BoardView } from '@/features/board/boardModel';
import { fitBoardWithShadow } from '@/features/board/geometry';
import { hintHighlights } from '@/features/board/hintMarks';
import { defaultSetup, type MatchSetup } from '@/features/match/setup';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';
import { crashReporter } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { nativePath } from '../../../test/nativeParent';
import { renderWithRoot } from '../../../test/render';
import { allBest, oneBadTurn, testAnalyzer } from '../../../test/reviewGame';
import { findAllNodes, type JsonNode } from '../../../test/tree';

import { lastGameTurns, reviewGame, type Mistake } from './review';
import { ReviewScreen } from './ReviewScreen';
import { mistakeText } from './reviewText';
import { reportReviewFailure } from './useGameReview';

runOnFakeTimers();

// The fake from `jest.setup.ts`: it keeps every report.
const crash = crashReporter as RecordingCrashReporter;

const vsBot = defaultSetup('bot');
const local: MatchSetup = { ...defaultSetup('local'), names: { white: 'Maria', black: 'Bob' } };

let announce: jest.SpyInstance;
beforeEach(() => {
  crash.clear();
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

  it('says when the game cannot be reviewed, and reports the error with safe context only', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new BotError('NOT_IMPLEMENTED', 'no evaluator');
    // The third ranking fails: the third turn of the game (index 2).
    let calls = 0;
    const broken: Analyzer = {
      ...testAnalyzer,
      rankTurns: (...args) => {
        calls += 1;
        if (calls === 3) throw failure;
        return testAnalyzer.rankTurns(...args);
      },
    };
    try {
      await renderWithRoot(<ReviewScreen setup={local} flow={oneBadTurn()} analyzer={broken} />);
      expect(await screen.findByText('This game cannot be reviewed.')).toBeOnTheScreen();
      expect(screen.queryByTestId('review-mistake-1')).toBeNull();
      expect(warn).toHaveBeenCalled();
      // One report: the game, the variant and the turn index. No names,
      // positions or moves.
      expect(crash.reports).toEqual([
        {
          kind: 'exception',
          error: failure,
          context: {
            tags: { feature: 'review', game: 'portes', variant: 'portes' },
            extra: { turn: 2 },
          },
        },
      ]);
      expect(JSON.stringify(crash.reports)).not.toMatch(/Maria|Bob/);
    } finally {
      warn.mockRestore();
    }
  });

  it('sends no crash report for a normal review', async () => {
    await renderWithRoot(<ReviewScreen setup={vsBot} flow={oneBadTurn()} />);
    await screen.findByTestId('review-mistake-1');
    expect(crash.reports).toEqual([]);
  });

  it('keeps the failed state when the crash reporter itself throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const throwing: CrashReporter = {
      ...crash,
      captureException: () => {
        throw new Error('reporter down');
      },
    };
    try {
      expect(() =>
        reportReviewFailure(throwing, new Error('boom'), {
          game: 'tavli',
          variant: 'plakoto',
          turn: null,
        }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith('could not report the failed review', expect.any(Error));
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

/** The space the small board gets in these tests. */
const BOARD_SIZE = { width: 320, height: 150 };

/** Gives the card's board its size, so it draws. */
async function layoutBoard(card: string) {
  await act(async () => {
    fireEvent(screen.getByTestId(`${card}-board`, { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...BOARD_SIZE } },
    });
  });
}

const centre = (m: { x: number; y: number }) => ({ x: m.x, y: m.y });

/** The marks the Hint would draw for `turn` on the board before the mistake. */
function expectedMarks(mistake: Mistake, turn: Turn) {
  const { boardTheme, homeBoardSide } = settingsStore.getState();
  const theme = getTheme(boardTheme);
  const geo = fitBoardWithShadow(boardLayout(theme, 'classic', homeBoardSide), BOARD_SIZE);
  const view: BoardView = {
    viewer: mistake.turn.player,
    direction: mistake.state.rules.movement.direction,
  };
  const marks = hintHighlights(geo, mistake.state.board, view, turn.player, turn.moves);
  return { cues: (marks.cues ?? []).map(centre), targets: marks.targets.map(centre) };
}

/**
 * The marks on a card's board: the select rings (cues) and the dashed
 * target rings, by their centres. The dots of a combined target are
 * filled, so they are not cues.
 */
function drawnMarks(card: string) {
  const { boardTheme } = settingsStore.getState();
  const hl = getTheme(boardTheme).highlights;
  const [canvas] = findAllNodes(
    screen.toJSON() as JsonNode,
    (n) => n.props['testID'] === `${card}-board-canvas`,
  );
  expect(canvas).toBeDefined();
  const circles = findAllNodes(canvas!, (n) => n.type === 'Circle');
  const dashed = (n: JsonNode) =>
    (n.children ?? []).some((c) => typeof c !== 'string' && c.type === 'DashPathEffect');
  const at = (n: JsonNode) => ({ x: n.props['cx'] as number, y: n.props['cy'] as number });
  return {
    cues: circles
      .filter(
        (n) => n.props['color'] === hl.select.color && n.props['style'] === 'stroke' && !dashed(n),
      )
      .map(at),
    targets: circles.filter(dashed).map(at),
  };
}

const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe('<ReviewScreen /> marks on the board (#230)', () => {
  it('marks the best turn first, and the played turn after a tap, from the same board', async () => {
    const user = setupUser();
    const flow = oneBadTurn();
    const [mistake] = reviewGame(flow, ['white'], testAnalyzer);
    const text = mistakeText(i18n.t, mistake!, null);
    await renderWithRoot(<ReviewScreen setup={vsBot} flow={flow} />);
    const card = await screen.findByTestId('review-mistake-1');
    await layoutBoard('review-mistake-1');

    const best = expectedMarks(mistake!, mistake!.best);
    const played = expectedMarks(mistake!, mistake!.turn);
    // The two turns differ, so the marks tell them apart.
    expect(best).not.toEqual(played);
    expect(best.targets.length).toBeGreaterThan(0);
    expect(played.cues.length).toBeGreaterThan(0);

    // Best move by default.
    const bestButton = screen.getByRole('button', { name: 'Best move' });
    const playedButton = screen.getByRole('button', { name: 'Your move' });
    expect(bestButton).toBeSelected();
    expect(playedButton).not.toBeSelected();
    expect(drawnMarks('review-mistake-1')).toEqual(best);
    const boldStyle = flat('review-mistake-1-best');
    const plainStyle = flat('review-mistake-1-played');
    expect(boldStyle.fontWeight).not.toEqual(plainStyle.fontWeight);

    const canvas = screen.getByTestId('review-mistake-1-board-canvas', {
      includeHiddenElements: true,
    });
    const path = nativePath(canvas);

    await user.press(playedButton);
    expect(screen.getByRole('button', { name: 'Your move' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Best move' })).not.toBeSelected();
    expect(drawnMarks('review-mistake-1')).toEqual(played);
    // The line of the marked turn is the bold one.
    expect(flat('review-mistake-1-played')).toEqual(boldStyle);
    expect(flat('review-mistake-1-best')).toEqual(plainStyle);
    // The card reads the same, and the board keeps its native parent (#173).
    expect(card).toHaveAccessibleName(text.label);
    expect(
      nativePath(
        screen.getByTestId('review-mistake-1-board-canvas', { includeHiddenElements: true }),
      ),
    ).toBe(path);

    await user.press(screen.getByRole('button', { name: 'Best move' }));
    expect(screen.getByRole('button', { name: 'Best move' })).toBeSelected();
    expect(drawnMarks('review-mistake-1')).toEqual(best);
  });

  it('keeps the switch out of the card, and each card has its own', async () => {
    const user = setupUser();
    await renderWithRoot(<ReviewScreen setup={local} flow={oneBadTurn()} />);
    await screen.findByTestId('review-mistake-3');
    // Pass-and-play names the player.
    expect(
      within(screen.getByTestId('review-mistake-1-switch')).getByRole('button', {
        name: "Bob's move",
      }),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('review-mistake-3-switch')).getByRole('button', {
        name: "Maria's move",
      }),
    ).toBeOnTheScreen();
    // The switch is not inside the card's one element, so screen readers reach it.
    expect(within(screen.getByTestId('review-mistake-1')).queryByRole('button')).toBeNull();
    await user.press(screen.getByTestId('review-mistake-2-show-played'));
    expect(screen.getByTestId('review-mistake-2-show-played')).toBeSelected();
    expect(screen.getByTestId('review-mistake-1-show-best')).toBeSelected();
    expect(screen.getByTestId('review-mistake-3-show-best')).toBeSelected();
  });

  it('speaks Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const user = setupUser();
    await renderWithRoot(<ReviewScreen setup={vsBot} flow={oneBadTurn()} />);
    await screen.findByTestId('review-mistake-1');
    expect(screen.getByRole('button', { name: 'Η καλύτερη' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Η κίνησή σου' })).not.toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Η κίνησή σου' }));
    expect(screen.getByRole('button', { name: 'Η κίνησή σου' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Η καλύτερη' })).not.toBeSelected();
  });

  it('speaks Greek in pass-and-play', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await renderWithRoot(<ReviewScreen setup={local} flow={oneBadTurn()} />);
    await screen.findByTestId('review-mistake-3');
    expect(screen.getByRole('button', { name: 'Κίνηση: Maria' })).not.toBeSelected();
  });
});
