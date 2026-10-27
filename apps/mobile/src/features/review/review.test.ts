/**
 * The game review (#215), without the screen: the turns come from the
 * match log, the loss from the Analyzer, and only real mistakes of a
 * person count.
 */
import { createRecordingAnalytics, type Analytics } from '@tavli/contracts';
import {
  applyMatchAction,
  createBoard,
  portes,
  resolveRules,
  sameTurn,
  type GameState,
  type Turn,
} from '@tavli/engine';

import i18n from '@/i18n';

import {
  BAD_TURN,
  ROLLS,
  allBest,
  best,
  oneBadTurn,
  playRolled,
  playTurn,
  startFlow,
  testAnalyzer,
  worst,
} from '../../../test/reviewGame';

import {
  BIG_MISTAKE,
  MAX_MISTAKES,
  MEDIUM_MISTAKE,
  MISTAKE_THRESHOLD,
  biggestMistakes,
  gradeTurn,
  lastGameTurns,
  mistakeBand,
  reviewGame,
  type GradedTurn,
} from './review';
import { sendReviewOpened } from './reviewAnalytics';
import { mistakeText, moveRuns, turnShortText } from './reviewText';

describe('mistakeBand', () => {
  it('names the loss with fixed bands', () => {
    expect(mistakeBand(0)).toBeNull();
    expect(mistakeBand(MISTAKE_THRESHOLD)).toBeNull();
    expect(mistakeBand(MISTAKE_THRESHOLD + 0.001)).toBe('small');
    expect(mistakeBand(MEDIUM_MISTAKE - 0.001)).toBe('small');
    expect(mistakeBand(MEDIUM_MISTAKE)).toBe('medium');
    expect(mistakeBand(BIG_MISTAKE - 0.001)).toBe('medium');
    expect(mistakeBand(BIG_MISTAKE)).toBe('big');
    expect(mistakeBand(2)).toBe('big');
    expect(mistakeBand(Number.NaN)).toBeNull();
  });
});

describe('lastGameTurns', () => {
  it('replays the log: the turns of the players asked for, oldest first', () => {
    const flow = oneBadTurn();
    const white = lastGameTurns(flow, ['white']);
    expect(white).toHaveLength(ROLLS.length / 2);
    expect(white.every((t) => t.turn.player === 'white')).toBe(true);
    expect(white.map((t) => t.state.dice)).toEqual(ROLLS.filter((_, i) => i % 2 === 0));
    // Each state is the start of its turn, with the player to move.
    expect(white.every((t) => t.state.toMove === 'white')).toBe(true);
    const both = lastGameTurns(flow, ['white', 'black']);
    expect(both.map((t) => t.state.turnNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps only the last game of the match', () => {
    let flow = oneBadTurn();
    flow = applyMatchAction(flow, { type: 'nextGame' });
    // The winner of game 1 (White) starts game 2.
    flow = playTurn(flow, [6, 5]).flow;
    flow = applyMatchAction(flow, { type: 'resign', player: 'white' });
    const turns = lastGameTurns(flow, ['white', 'black']);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.state.dice).toEqual([6, 5]);
    expect(turns[0]!.state.turnNumber).toBe(1);
  });

  it('is empty for a log with no start event', () => {
    expect(lastGameTurns({ ...oneBadTurn(), log: [] }, ['white'])).toEqual([]);
  });

  it('grades an Acey-Deucey chosen double as its own turn, never the answer', () => {
    const rules = resolveRules('asodio.aceyDeuceyGreek');
    let flow = startFlow(rules);
    flow = playTurn(flow, [1, 2]).flow;
    // After a 1-2 White chooses a double, then plays it: the same player again.
    expect(flow.game.phase).toBe('awaiting-answer');
    flow = applyMatchAction(flow, { type: 'answer', player: 'white', choice: '4' });
    expect(flow.game.state.dice).toEqual([4, 4]);
    flow = playRolled(flow).flow;
    flow = applyMatchAction(flow, { type: 'resign', player: 'black' });
    const turns = lastGameTurns(flow, ['white']);
    expect(turns.map((t) => t.state.dice)).toEqual([
      [1, 2],
      [4, 4],
    ]);
    // Both turns can be graded; the answer is not a turn.
    const graded = turns.map((t) => gradeTurn(testAnalyzer, t));
    expect(graded.every((g) => g === null || g.loss === 0)).toBe(true);
  });
});

describe('gradeTurn', () => {
  it('finds the played turn in the ranking and takes its loss', () => {
    const flow = oneBadTurn();
    const played = lastGameTurns(flow, ['white'])[BAD_TURN]!;
    const ranked = testAnalyzer.rankTurns(played.state, played.state.dice!);
    const graded = gradeTurn(testAnalyzer, played)!;
    expect(graded.loss).toBe(worst(ranked).equityLoss);
    expect(graded.loss).toBeGreaterThan(MISTAKE_THRESHOLD);
    expect(sameTurn(graded.best, ranked[0]!.turn)).toBe(true);
  });

  it('finds a turn played in another order by its end position', () => {
    const played = lastGameTurns(oneBadTurn(), ['white'])[0]!;
    const reversed: Turn = { ...played.turn, moves: [...played.turn.moves].reverse() };
    // Two checkers moved: the other order is not the turn as the engine lists it.
    expect(sameTurn(reversed, played.turn)).toBe(false);
    expect(gradeTurn(testAnalyzer, { ...played, turn: reversed })?.loss).toBe(0);
  });

  it('skips a roll with no choice (one legal turn)', () => {
    // One white checker can move: every way to play 6-5 ends the same.
    const board = createBoard(
      { white: { points: { 24: 1, 1: 14 } }, black: { points: { 2: 15 } } },
      portes.direction,
    );
    const start = portes.initialState({ startingPlayer: 'white' });
    const state: GameState = { ...start, board, dice: [6, 5] };
    const [only] = portes.legalTurns(state, [6, 5]);
    expect(portes.legalTurns(state, [6, 5])).toHaveLength(1);
    expect(gradeTurn(testAnalyzer, { state, turn: only! })).toBeNull();
    // A state with no dice is never graded.
    expect(gradeTurn(testAnalyzer, { state: { ...state, dice: null }, turn: only! })).toBeNull();
  });
});

describe('reviewGame', () => {
  it('shows the known bad turn first, with the best turn', () => {
    const flow = oneBadTurn();
    const mistakes = reviewGame(flow, ['white'], testAnalyzer);
    const played = lastGameTurns(flow, ['white'])[BAD_TURN]!;
    const ranked = testAnalyzer.rankTurns(played.state, played.state.dice!);
    expect(mistakes).toHaveLength(1);
    expect(sameTurn(mistakes[0]!.turn, worst(ranked).turn)).toBe(true);
    expect(sameTurn(mistakes[0]!.best, best(ranked).turn)).toBe(true);
    expect(mistakes[0]!.state.turnNumber).toBe(BAD_TURN * 2 + 1);
  });

  it('never lists the bot: Black played its worst turns', () => {
    const flow = oneBadTurn();
    expect(reviewGame(flow, ['white'], testAnalyzer).every((m) => m.turn.player === 'white')).toBe(
      true,
    );
    // In pass-and-play Black's turns count too, biggest first, at most three.
    const both = reviewGame(flow, ['white', 'black'], testAnalyzer);
    expect(both.length).toBe(MAX_MISTAKES);
    expect(both.some((m) => m.turn.player === 'black')).toBe(true);
    const losses = both.map((m) => m.loss);
    expect(losses).toEqual([...losses].sort((a, b) => b - a));
  });

  it('finds nothing when every turn was the best one', () => {
    expect(reviewGame(allBest(), ['white'], testAnalyzer)).toEqual([]);
  });

  it('asks for a 1-ply ranking of each turn of the player', () => {
    const flow = allBest();
    const spy = jest.spyOn(testAnalyzer, 'rankTurns');
    try {
      reviewGame(flow, ['white'], testAnalyzer);
      expect(spy.mock.calls.map((call) => call[2])).toEqual(
        Array.from({ length: ROLLS.length / 2 }, () => ({ plies: 1 })),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('is the same every time', () => {
    const flow = oneBadTurn();
    expect(reviewGame(flow, ['white', 'black'], testAnalyzer)).toEqual(
      reviewGame(flow, ['white', 'black'], testAnalyzer),
    );
  });
});

describe('biggestMistakes', () => {
  const graded = (loss: number, turnNumber: number) =>
    ({ loss, state: { turnNumber } }) as unknown as GradedTurn;

  it('keeps losses above the threshold, biggest first, the first played on a tie', () => {
    const list = biggestMistakes([
      graded(0.01, 1),
      graded(0.1, 2),
      graded(0.3, 3),
      graded(0.1, 4),
      graded(0.05, 5),
    ]);
    expect(list.map((m) => [m.state.turnNumber, m.band])).toEqual([
      [3, 'big'],
      [2, 'medium'],
      [4, 'medium'],
    ]);
  });
});

describe('the review text', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('joins the moves of one checker run', () => {
    const m = (from: number, to: number, die: 1 | 2 | 3 | 4 | 5 | 6) =>
      ({ from, to, die, capture: 'none' }) as const;
    expect(moveRuns([m(13, 8, 5), m(8, 5, 3), m(24, 18, 6)])).toEqual([
      [m(13, 8, 5), m(8, 5, 3)],
      [m(24, 18, 6)],
    ]);
  });

  it('says who played what, the best turn and the band, in English and Greek', async () => {
    const flow = oneBadTurn();
    const [mistake] = reviewGame(flow, ['white'], testAnalyzer);
    const text = mistakeText(i18n.t, mistake!, null);
    expect(text.played).toBe(`You played: ${turnShortText(i18n.t, mistake!.turn)}`);
    expect(text.best).toBe(`Best: ${turnShortText(i18n.t, mistake!.best)}`);
    expect(text.turn).toBe(`Turn 5 · roll ${mistake!.state.dice!.join('-')}`);
    expect(text.label).toContain('You played: Checker from point');
    expect(mistakeText(i18n.t, mistake!, 'Maria').played).toMatch(/^Maria played: /);
    await i18n.changeLanguage('el');
    try {
      const el = mistakeText(i18n.t, mistake!, null);
      expect(el.played).toMatch(/^Έπαιξες: /);
      expect(el.best).toMatch(/^Καλύτερο: /);
      expect(el.band).toMatch(/λάθος$/);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('sendReviewOpened', () => {
  it('sends the game only, after opt-in', () => {
    const analytics = createRecordingAnalytics();
    sendReviewOpened('tavli', analytics);
    expect(analytics.sent).toEqual([]);
    analytics.optIn();
    sendReviewOpened('tavli', analytics);
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'review_opened', props: { game: 'tavli' } },
    ]);
  });

  it('never throws when analytics fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = {
      track: () => {
        throw new Error('down');
      },
    } as unknown as Analytics;
    expect(() => sendReviewOpened('portes', broken)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
