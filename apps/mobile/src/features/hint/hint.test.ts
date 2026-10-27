/**
 * The Hint (#209), without the screen: the best turn comes from the
 * Analyzer, and after part of the turn the hint is the best way to finish
 * it. Every game: Portes, Plakoto, Fevga and Asodio.
 */
import { createAnalyzer } from '@tavli/bot';
import { createRecordingAnalytics, type Analytics } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  applyGameAction,
  applyMoveToBoard,
  asodio,
  createBoard,
  createGameFlow,
  currentPrompt,
  fevga,
  getVariant,
  legalNextMoves,
  plakoto,
  portes,
  resolveRules,
  type BoardState,
  type DieValue,
  type GameFlow,
  type GameState,
  type Move,
  type Variant,
} from '@tavli/engine';

import i18n from '@/i18n';

import { bestRest, boardKey, hintGroups, hintHasChoice, turnFinishes } from './hint';
import { sendHintShown } from './hintAnalytics';
import { hintShortText, hintSpokenText } from './hintText';

const analyzer = createAnalyzer();

function rolled(
  variant: Variant,
  dice: [DieValue, DieValue],
  board?: BoardState,
  rules = resolveRules(variant.id),
): GameFlow {
  const start = variant.initialState({ startingPlayer: 'white', rules });
  const state: GameState = board ? { ...start, board } : start;
  const game = createGameFlow({ state, starter: 'white' });
  return applyGameAction(game, { type: 'roll', player: 'white', dice });
}

const play = (game: GameFlow, move: Move) =>
  applyGameAction(game, { type: 'move', player: game.state.toMove, move });

/** The board after `moves` of the player to move, from the start of the turn. */
const after = (game: GameFlow, moves: readonly Move[]) =>
  moves.reduce(
    (board, move) =>
      applyMoveToBoard(board, game.state.toMove, move, game.state.rules.movement.direction),
    game.state.board,
  );

const GAMES = [portes, plakoto, fevga] as const;
/** Four turns of a game, white and black in turn. */
const OPENING: readonly [DieValue, DieValue][] = [
  [3, 1],
  [6, 4],
  [5, 2],
  [6, 3],
];
const ROLLS: readonly [DieValue, DieValue][] = [
  [6, 5],
  [4, 2],
  [6, 1],
  [5, 3],
  [2, 2],
  [3, 3],
];

describe('bestRest', () => {
  it.each(GAMES.map((v) => [v.id, v] as const))(
    '%s: before a move, the hint is the best turn of the Analyzer',
    (_id, variant) => {
      for (const dice of [
        [6, 5],
        [3, 1],
        [4, 4],
      ] as [DieValue, DieValue][]) {
        const game = rolled(variant, dice);
        const [best] = analyzer.rankTurns(game.state, dice, { top: 1 });
        expect(bestRest(game, analyzer)).toEqual(best!.turn.moves);
      }
    },
  );

  it('asks the Analyzer for the best turn only when it can reach it', () => {
    const game = rolled(portes, [6, 5]);
    const spy = jest.spyOn(analyzer, 'rankTurns');
    try {
      bestRest(game, analyzer);
      expect(spy.mock.calls.map((call) => call[2])).toEqual([{ top: 1 }]);
      const [best] = analyzer.rankTurns(game.state, [6, 5], { top: 1 });
      spy.mockClear();
      bestRest(play(game, best!.turn.moves[0]!), analyzer);
      expect(spy.mock.calls.map((call) => call[2])).toEqual([{ top: 1 }]);
    } finally {
      spy.mockRestore();
    }
  });

  it.each(GAMES.map((v) => [v.id, v] as const))(
    '%s: after the first move of the best turn, the hint is the rest of it',
    (_id, variant) => {
      const game = rolled(variant, [6, 5]);
      const [best] = analyzer.rankTurns(game.state, [6, 5], { top: 1 });
      const moves = best!.turn.moves;
      const next = play(game, moves[0]!);
      const rest = bestRest(next, analyzer)!;
      expect(rest).toHaveLength(moves.length - 1);
      expect(boardKey(after(next, [...next.played, ...rest]))).toBe(boardKey(after(game, moves)));
    },
  );

  it.each(GAMES.map((v) => [v.id, v] as const))(
    '%s: after another first move, the hint is the best turn it can still reach',
    (_id, variant) => {
      // Some turns into the game, where the first move matters.
      let state = variant.initialState({ startingPlayer: 'white' });
      for (const dice of OPENING) {
        const [best] = analyzer.rankTurns({ ...state, dice }, dice, { top: 1 });
        state = variant.applyTurn({ ...state, dice }, best!.turn);
      }
      expect(state.toMove).toBe('white');
      let found = 0;
      for (const dice of ROLLS) {
        const game = rolled(variant, dice, state.board);
        if (game.phase !== 'moving') continue;
        const ranked = analyzer.rankTurns(game.state, dice);
        const bestEnd = boardKey(after(game, ranked[0]!.turn.moves));
        // A first move that cannot reach the best end.
        const first = legalNextMoves(game)
          .flatMap((g) => g.moves)
          .find((move) => !turnFinishes(play(game, move)).has(bestEnd));
        if (first === undefined) continue;
        found += 1;
        const next = play(game, first);
        const finishes = turnFinishes(next);
        const want = ranked.find((r) => finishes.has(boardKey(after(game, r.turn.moves))))!;
        const rest = bestRest(next, analyzer)!;
        expect(boardKey(after(next, [...next.played, ...rest]))).toBe(
          boardKey(after(game, want.turn.moves)),
        );
        // Each move of the hint is legal in turn.
        let flow = next;
        for (const move of rest) flow = play(flow, move);
        expect(flow.phase).toBe('awaiting-confirm');
      }
      expect(found).toBeGreaterThan(0);
    },
  );

  it('works for an Asodio double chosen after a 1-2 (Acey-Deucey)', () => {
    const rules = resolveRules('asodio.aceyDeuceyGreek');
    let game = rolled(asodio, [1, 2], undefined, rules);
    for (let next = legalNextMoves(game)[0]; next; next = legalNextMoves(game)[0]) {
      game = play(game, next.moves[0]!);
    }
    game = applyGameAction(game, { type: 'confirm', player: 'white' });
    expect(game.phase).toBe('awaiting-answer');
    expect(currentPrompt(game)).not.toBeNull();
    // The question is open: no hint.
    expect(hintHasChoice(game)).toBe(false);
    expect(bestRest(game, analyzer)).toBeNull();
    game = applyGameAction(game, { type: 'answer', player: 'white', choice: '4' });
    expect(game.state.toMove).toBe('white');
    expect(game.state.dice).toEqual([4, 4]);
    const [best] = analyzer.rankTurns(game.state, [4, 4], { top: 1 });
    expect(bestRest(game, analyzer)).toEqual(best!.turn.moves);
  });

  it('is null when the game does not wait for a move', () => {
    const start = createGameFlow({
      state: portes.initialState({ startingPlayer: 'white' }),
      starter: 'white',
    });
    expect(start.phase).toBe('awaiting-roll');
    expect(bestRest(start, analyzer)).toBeNull();
  });
});

describe('hintHasChoice', () => {
  it('is true for a roll with several turns, before and after the first move', () => {
    const game = rolled(portes, [6, 5]);
    expect(hintHasChoice(game)).toBe(true);
    expect(hintHasChoice(play(game, legalNextMoves(game)[0]!.moves[0]!))).toBe(true);
  });

  it('is false when the roll has only one turn', () => {
    // One white checker can move: 24/18/13 and 24/19/13 end the same way.
    const board = createBoard(
      { white: { points: { 24: 1, 1: 14 } }, black: { points: { 2: 15 } } },
      portes.direction,
    );
    const game = rolled(portes, [6, 5], board);
    expect(game.phase).toBe('moving');
    expect(portes.legalTurns(game.state, [6, 5])).toHaveLength(1);
    expect(hintHasChoice(game)).toBe(false);
    // After 24/18 only 18/13 is left.
    const next = play(game, { from: 24, to: 18, die: 6, capture: 'none' });
    expect(turnFinishes(next).size).toBe(1);
    expect(hintHasChoice(next)).toBe(false);
  });

  it('is false once every die is played', () => {
    let game = rolled(portes, [6, 5]);
    for (let next = legalNextMoves(game)[0]; next; next = legalNextMoves(game)[0]) {
      game = play(game, next.moves[0]!);
    }
    expect(game.phase).toBe('awaiting-confirm');
    expect(hintHasChoice(game)).toBe(false);
  });
});

describe('turnFinishes', () => {
  it('lists each end position once, like legalTurns', () => {
    const game = rolled(portes, [6, 5]);
    const variant = getVariant(VARIANT_REGISTRY, 'portes');
    const ends = new Set(
      variant.legalTurns(game.state, [6, 5]).map((t) => boardKey(after(game, t.moves))),
    );
    expect(new Set(turnFinishes(game).keys())).toEqual(ends);
  });

  it('stops at the limit', () => {
    expect(turnFinishes(rolled(portes, [4, 4]), 2).size).toBe(2);
  });
});

describe('the hint text', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  const m = (
    from: Move['from'],
    to: Move['to'],
    die: DieValue,
    capture: Move['capture'] = 'none',
  ) => ({ from, to, die, capture }) as Move;

  it('joins the moves of one checker run', () => {
    expect(hintGroups([m(13, 8, 5), m(8, 5, 3), m(24, 18, 6)])).toEqual([
      [m(13, 8, 5), m(8, 5, 3)],
      [m(24, 18, 6)],
    ]);
  });

  it('says the moves in the move list notation', () => {
    const moves = [m(13, 8, 5), m(8, 5, 3), m(6, 1, 5, 'hit')];
    expect(hintShortText(i18n.t, moves)).toBe('Hint: 13 → 8 → 5, 6 → 1 · hit');
    expect(hintSpokenText(i18n.t, moves)).toBe(
      'Hint: Checker from point 13 to point 8, then to point 5; Checker from point 6 to point 1, hits',
    );
  });

  it('is short in Greek too', async () => {
    await i18n.changeLanguage('el');
    try {
      expect(hintShortText(i18n.t, [m(13, 8, 5)])).toBe('Υπόδειξη: 13 → 8');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('sendHintShown', () => {
  it('sends the game and the variant only, after opt-in', () => {
    const analytics = createRecordingAnalytics();
    sendHintShown('tavli', 'plakoto', analytics);
    expect(analytics.sent).toEqual([]);
    analytics.optIn();
    sendHintShown('tavli', 'plakoto', analytics);
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'hint_shown', props: { game: 'tavli', variant: 'plakoto' } },
    ]);
  });

  it('never throws when analytics fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = {
      track: () => {
        throw new Error('down');
      },
    } as unknown as Analytics;
    expect(() => sendHintShown('portes', 'portes', broken)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
