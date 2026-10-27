/**
 * Asodio on the board screen (#124): whole games with taps only (a draw by
 * deadlock and a game borne off), the loading lock, entering by tap, the
 * frozen army (A6) and the bot's turn.
 */
import { InlineBotRunner, createBot } from '@tavli/bot';
import {
  asodio,
  createGameFlow,
  createSeededRng,
  resolveRules,
  type BoardState,
  type MatchAction,
  type PerPlayer,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { loadingGate } from '@/features/board/asodio';
import { fitBoardWithShadow } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { GameScreen, type GameScreenProps } from './GameScreen';
import { openingStatus } from './opening';
import type { Seat } from './seats';
import { passNotice } from './turnNotices';

import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 520 };
const geo = fitBoardWithShadow(getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'), SIZE);
const PAN = 'game-board-pan';

const center = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

/** One game of Asodio, the owner version (the app's `gameRuleSet('asodio')`). */
const rules = resolveRules('asodio.kafeneio', { match: { rotation: ['asodio'] } });

function newStore(seed: number, targetPoints = 1): GameStore {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints,
    rules,
    rng: createSeededRng(seed),
  });
}

/** A store whose game starts from `board`, `toMove` to roll. */
function storeAt(
  board: BoardState,
  toMove: 'white' | 'black',
  players: PerPlayer<string> = { white: 'Ann', black: 'Bob' },
): GameStore {
  const store = createGameStore({ players, targetPoints: 3, rules, rng: createSeededRng(5) });
  const state = { ...asodio.initialState({ startingPlayer: toMove, rules }), board };
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: toMove }) },
  });
  return store;
}

async function show(store: GameStore, props: Partial<GameScreenProps> = {}) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

const send = async (store: GameStore, action: MatchAction) => {
  await act(async () => {
    expect(store.getState().dispatch(action)).toBe(true);
  });
};

/** The sources and targets of the player to move, as the screen sees them (flip view). */
function sourcesNow(store: GameStore) {
  const view = turnView(store.getState().flow);
  const boardView = { viewer: view.toMove, direction: 'contrary' as const };
  return buildSources(geo, view.board, boardView, view.toMove, view.legal);
}

/** Taps a source, then one of its targets (by layout key). */
async function tapMove(sourceKey: string, targetKey: string) {
  const source = sourcesNow(storeRef.current!).find((s) => s.key === sourceKey)!;
  const target = source.targets.find((t) => t.key === targetKey)!;
  await touch(PAN, [center(source.rect)]);
  await touch(PAN, [center(target.rect)]);
}
const storeRef: { current: GameStore | null } = { current: null };

// The game screen closes its cards on timers (see test/clock.ts).
runOnFakeTimers();

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

/**
 * Plays the game in the store to its end through the screen, as two people
 * would: roll, tap a checker, tap a target, confirm, close cards. Checks
 * the Asodio parts on the way and returns what it saw.
 */
async function playToTheEnd(store: GameStore) {
  let steps = 0;
  const seen = { lockedPasses: 0, lockHints: 0, entries: 0, frozenLabels: 0 };
  for (; steps < 4000; steps++) {
    const { flow } = store.getState();
    const view = turnView(flow);
    if (view.matchPhase !== 'playing') break;
    const card = (testID: string) => screen.queryByTestId(testID) !== null;
    if (passNotice(flow) && card('pass-ok-button')) {
      if (screen.queryByText('Board locked') !== null) seen.lockedPasses++;
      await press('pass-ok-button');
    } else if (view.phase === 'opening-roll') await press('roll-button');
    else if (openingStatus(view.game) && card('opening-overlay')) await press('opening-overlay');
    else if (view.phase === 'awaiting-roll') {
      // The loading lock: a note says what opens the board.
      const locked = loadingGate(view.board, view.toMove, rules) !== null;
      expect(card('loading-lock-hint')).toBe(locked);
      if (locked) seen.lockHints++;
      await press('roll-button');
    } else if (view.phase === 'awaiting-confirm') await press('confirm-button');
    else {
      const sources = sourcesNow(store);
      // While checkers are outside, only the "to enter" stack moves (A2).
      if (view.board.outside[view.toMove] > 0) {
        expect(sources.map((s) => s.key)).toEqual(['bar:player']);
        seen.entries++;
      }
      if (screen.queryByLabelText(/are frozen|army is frozen/) !== null) seen.frozenLabels++;
      const source = sources[0]!;
      const target = source.targets[0]!;
      // No hitting in the owner version: pins only.
      expect(target.move.capture).not.toBe('hit');
      await touch(PAN, [center(source.rect)]);
      await touch(PAN, [center(target.rect)]);
      expect(store.getState().flow.log.length).toBeGreaterThan(flow.log.length);
    }
  }
  return { steps, seen };
}

describe('<GameScreen /> plays Asodio with taps only', () => {
  it('plays a whole game to a deadlock draw: the game-end sheet shows 0 points', async () => {
    const store = newStore(25);
    storeRef.current = store;
    await show(store);
    // Both stacks wait to enter, with their counts.
    expect(within(screen.getByTestId('strip-top')).getByText(/15 to enter/)).toBeOnTheScreen();
    expect(within(screen.getByTestId('strip-bottom')).getByText(/15 to enter/)).toBeOnTheScreen();
    // The board label (screen readers reach it once the opening card is gone).
    expect(
      screen.getByLabelText(/Ann has 15 checkers to enter/, { includeHiddenElements: true }),
    ).toBeOnTheScreen();

    const { steps, seen } = await playToTheEnd(store);
    const { flow } = store.getState();
    expect(flow.game.state.variant).toBe('asodio');
    expect(flow.game.result).toEqual({ winner: null, points: 0, reason: 'deadlock' });
    expect(flow.match.score).toEqual({ white: 0, black: 0 });
    expect(flow.match.status).toBe('in-progress');
    // Nothing ever went to the bar.
    for (const event of flow.log) {
      if (event.type === 'move') expect(event.move.from).not.toBe('bar');
    }
    expect(seen.lockHints).toBeGreaterThan(0);
    expect(seen.lockedPasses).toBeGreaterThan(0);
    expect(seen.entries).toBeGreaterThan(0);
    expect(seen.frozenLabels).toBeGreaterThan(0);
    expect(steps).toBeLessThan(4000);

    // The game-end sheet: a draw, 0 points, why, and the next game.
    const sheet = within(screen.getByTestId('game-end-card'));
    expect(sheet.getByText('The game is a draw')).toBeOnTheScreen();
    expect(sheet.getByText('Draw · 0 points')).toBeOnTheScreen();
    expect(sheet.getByText('No checker can ever move again.')).toBeOnTheScreen();
    await press('next-game-button');
    const next = store.getState().flow;
    expect(next.match.games).toHaveLength(1);
    expect(next.game.phase).toBe('opening-roll');
    expect(next.game.state.board.outside).toEqual({ white: 15, black: 15 });
  }, 120_000);

  it('plays a whole game to the end with a winner', async () => {
    const store = newStore(23);
    storeRef.current = store;
    const onMatchOver = jest.fn();
    await show(store, { onMatchOver });
    const { steps } = await playToTheEnd(store);
    const { flow } = store.getState();
    expect(flow.game.result).toMatchObject({ winner: 'white', reason: 'borneOff' });
    expect(flow.match.status).toBe('finished');
    expect(steps).toBeLessThan(4000);
  }, 180_000);
});

describe('<GameScreen /> Asodio loading lock and entering', () => {
  it('asodio.md #14: an opening 5-3 is locked: the turn passes with a clear card', async () => {
    const store = newStore(3, 3);
    storeRef.current = store;
    await show(store);
    await send(store, { type: 'rollOpening', player: 'white', die: 5 });
    await send(store, { type: 'rollOpening', player: 'black', die: 3 });
    const card = within(screen.getByTestId('pass-card'));
    expect(card.getByText('Board locked')).toBeOnTheScreen();
    expect(
      card.getByText('Ann rolled 5-3. The board opens only with a 1-2 or a double.'),
    ).toBeOnTheScreen();
    expect(card.getByText('The turn passes to Bob.')).toBeOnTheScreen();
    await press('pass-ok-button');
    // The pass was the opening turn: the opening card does not come back.
    expect(screen.queryByTestId('opening-overlay')).toBeNull();

    // Bob is still locked: the note says what opens the board.
    expect(screen.getByTestId('loading-lock-hint')).toHaveTextContent(
      'Roll 1-2 or a double to start',
    );
    // A1: Bob rolls 3-3 and enters four on spot 3 (own 22), one tap pair each.
    await send(store, { type: 'roll', player: 'black', dice: [3, 3] });
    expect(screen.queryByTestId('loading-lock-hint')).toBeNull();
    for (let n = 0; n < 4; n++) await tapMove('bar:player', 'p22');
    const board = turnView(store.getState().flow).board;
    expect(board.outside.black).toBe(11);
    expect(board.points[25 - 22 - 1]).toMatchObject({ black: 4 });
    expect(within(screen.getByTestId('strip-bottom')).getByText(/11 to enter/)).toBeOnTheScreen();
    // Undo takes one back to the stack.
    await press('undo-button');
    expect(turnView(store.getState().flow).board.outside.black).toBe(12);
    await tapMove('bar:player', 'p22');
    await press('confirm-button');

    // Ann's turn: the board turns to her. Both counts are read out.
    expect(within(screen.getByTestId('strip-bottom')).getByText('Ann')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Bob has 11 checkers to enter/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Ann has 15 checkers to enter/)).toBeOnTheScreen();
    expect(screen.getByTestId('loading-lock-hint')).toBeOnTheScreen();
  });

  it('asodio.md #15: a 1-2 enters on spots 1 and 2', async () => {
    const store = newStore(3, 3);
    storeRef.current = store;
    await show(store);
    await send(store, { type: 'rollOpening', player: 'white', die: 2 });
    await send(store, { type: 'rollOpening', player: 'black', die: 1 });
    await press('opening-overlay');
    expect(screen.queryByTestId('pass-card')).toBeNull();
    const [stack] = sourcesNow(store);
    expect(stack?.key).toBe('bar:player');
    expect(stack?.targets.map((t) => t.key).sort()).toEqual(['p23', 'p24']);
    await tapMove('bar:player', 'p24');
    await tapMove('bar:player', 'p23');
    const board = turnView(store.getState().flow).board;
    expect(board.points[23]).toMatchObject({ white: 1 });
    expect(board.points[22]).toMatchObject({ white: 1 });
    expect(board.outside.white).toBe(13);
  });
});

describe('<GameScreen /> Asodio frozen army (A6)', () => {
  it('marks the frozen army and explains the pass', async () => {
    const store = storeAt(SAMPLE_POSITIONS.asodioFrozen, 'white');
    storeRef.current = store;
    await show(store);
    expect(
      screen.getByLabelText(/Ann’s last checker is pinned: the whole army is frozen/),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(/Bob’s checkers on point 5 are frozen/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Ann’s checker on point 20 is pinned/)).toBeOnTheScreen();
    expect(within(screen.getByTestId('strip-bottom')).getByText(/Army frozen/)).toBeOnTheScreen();

    await send(store, { type: 'roll', player: 'white', dice: [6, 5] });
    const card = within(screen.getByTestId('pass-card'));
    expect(card.getByText('Army frozen')).toBeOnTheScreen();
    expect(
      card.getByText('Ann rolled 6-5. Their last checker is pinned, so no checker can move.'),
    ).toBeOnTheScreen();
    expect(store.getState().flow.game.state.toMove).toBe('black');
  });
});

describe('<GameScreen /> Asodio vs the bot', () => {
  const seats: PerPlayer<Seat> = {
    white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
    black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
  };

  it('the bot (Easy, the real bot package) rolls, enters and passes the turn back', async () => {
    // The bot (Black) has entered 2; any die enters one more.
    const board: BoardState = {
      ...SAMPLE_POSITIONS.asodioStart,
      points: SAMPLE_POSITIONS.asodioStart.points.map((p, i) => (i === 0 ? { ...p, black: 2 } : p)),
      outside: { white: 15, black: 13 },
    };
    const store = storeAt(board, 'black', { white: 'You', black: 'Bot' });
    storeRef.current = store;
    const bot = {
      player: 'black' as const,
      difficulty: 'easy' as const,
      runner: new InlineBotRunner(createBot()),
      rng: createSeededRng(1),
      timing: { beforeRollMs: 0, afterRollMs: 0, moveMs: 0, hitMs: 0, landMs: 0, thinkMs: () => 0 },
    };
    await show(store, { seats, bot });
    await waitFor(() => expect(store.getState().flow.game.state.toMove).toBe('white'), {
      timeout: 3000,
    });
    const moves = store.getState().flow.log.filter((e) => e.type === 'move');
    expect(moves.length).toBeGreaterThan(0);
    for (const event of moves) {
      if (event.type === 'move') expect(event.move.from).toBe('outside');
    }
    // Your turn now: you are still locked.
    expect(screen.getByTestId('loading-lock-hint')).toBeOnTheScreen();
    expect(screen.getByLabelText(/You have 15 checkers to enter/)).toBeOnTheScreen();
  });
});
