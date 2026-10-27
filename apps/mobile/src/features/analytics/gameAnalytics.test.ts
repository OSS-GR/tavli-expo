import {
  createRecordingAnalytics,
  type Analytics,
  type AnalyticsEventName,
} from '@tavli/contracts';
import { createSeededRng, type MatchFlow } from '@tavli/engine';

import { createGameStore, turnView } from '@/features/game/gameStore';
import { nextOpeningRoller } from '@/features/game/opening';

import { createGameAnalytics, resultKind, type GameAnalyticsSetup } from './gameAnalytics';

function setup(game: GameAnalyticsSetup = { mode: 'local', game: 'portes' }, optedIn = true) {
  const analytics = createRecordingAnalytics();
  if (optedIn) analytics.optIn();
  let clock = 1_000_000;
  const tick = (seconds: number) => {
    clock += seconds * 1000;
  };
  const gameAnalytics = createGameAnalytics(game, { analytics, now: () => clock });
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 3,
    rng: createSeededRng(3),
    analytics: gameAnalytics,
  });
  return { analytics, gameAnalytics, store, tick };
}

type Store = ReturnType<typeof setup>['store'];

function finishOpening(store: Store) {
  for (let i = 0; i < 20 && store.getState().flow.game.phase === 'opening-roll'; i++) {
    store
      .getState()
      .dispatch({ type: 'rollOpening', player: nextOpeningRoller(store.getState().flow.game)! });
  }
}

function events(analytics: ReturnType<typeof createRecordingAnalytics>) {
  return analytics.sent.flatMap((s) =>
    s.type === 'track' ? [{ event: s.event, ...s.props }] : [],
  );
}

describe('gameAnalytics with the game store', () => {
  it('sends game_started when the store starts a match', () => {
    const { analytics } = setup();
    expect(events(analytics)).toEqual([
      {
        event: 'game_started',
        mode: 'local',
        game: 'portes',
        variant: 'portes',
        matchLength: 3,
        openingRoll: 'useOpeningDice',
      },
    ]);
  });

  it('adds the bot level for games vs the bot', () => {
    const { analytics } = setup({ mode: 'bot', game: 'portes', botLevel: 'easy' });
    expect(events(analytics)[0]).toEqual({
      event: 'game_started',
      mode: 'bot',
      game: 'portes',
      variant: 'portes',
      matchLength: 3,
      botLevel: 'easy',
      openingRoll: 'useOpeningDice',
    });
  });

  it('sends undo_used only when the engine accepts the undo', () => {
    const { analytics, store } = setup();
    finishOpening(store);
    analytics.sent.length = 0;

    // Nothing to undo yet: refused, no event.
    const toMove = store.getState().flow.game.state.toMove;
    expect(store.getState().dispatch({ type: 'undo', player: toMove })).toBe(false);
    expect(events(analytics)).toEqual([]);

    const move = turnView(store.getState().flow).legal[0]!.moves[0]!;
    expect(store.getState().dispatch({ type: 'move', player: toMove, move })).toBe(true);
    expect(store.getState().dispatch({ type: 'undo', player: toMove })).toBe(true);
    expect(events(analytics)).toEqual([{ event: 'undo_used' }]);
  });

  it('sends resign and game_finished, then game_started for the next game', () => {
    const { analytics, store, tick } = setup();
    finishOpening(store);
    tick(95.4);
    analytics.sent.length = 0;

    store.getState().dispatch({ type: 'resign', player: 'white' });
    expect(events(analytics)).toEqual([
      { event: 'resign' },
      {
        event: 'game_finished',
        mode: 'local',
        game: 'portes',
        variant: 'portes',
        result: 'resign',
        turns: 0,
        durationSec: 95,
      },
    ]);

    analytics.sent.length = 0;
    expect(store.getState().dispatch({ type: 'nextGame' })).toBe(true);
    expect(events(analytics)).toEqual([
      {
        event: 'game_started',
        mode: 'local',
        game: 'portes',
        variant: store.getState().flow.game.state.variant,
        matchLength: 3,
        openingRoll: 'useOpeningDice',
      },
    ]);
  });

  it('sends game_finished with result timeout, and no resign, when a turn timer runs out (#170)', () => {
    const { analytics, store, tick } = setup();
    finishOpening(store);
    tick(42);
    analytics.sent.length = 0;

    const toMove = store.getState().flow.game.state.toMove;
    expect(store.getState().dispatch({ type: 'timeout', player: toMove })).toBe(true);
    expect(store.getState().flow.game.result).toMatchObject({ reason: 'timeout' });
    expect(events(analytics)).toEqual([
      {
        event: 'game_finished',
        mode: 'local',
        game: 'portes',
        variant: 'portes',
        result: 'timeout',
        turns: 0,
        durationSec: 42,
      },
    ]);
  });

  it('ends the game in play when the match is resigned', () => {
    const { analytics, store } = setup();
    finishOpening(store);
    analytics.sent.length = 0;

    store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(events(analytics).map((e) => [e.event, 'result' in e ? e.result : undefined])).toEqual([
      ['resign', undefined],
      ['game_finished', 'resign'],
    ]);
  });

  it('leaves durationSec out for a resumed game, and counts it again from the next game', () => {
    const first = setup();
    finishOpening(first.store);
    const saved = first.store.getState().flow;

    // The app restarts: a new helper and a store for the saved flow.
    const analytics = createRecordingAnalytics();
    analytics.optIn();
    let clock = 5_000_000;
    const gameAnalytics = createGameAnalytics(
      { mode: 'local', game: 'portes' },
      { analytics, now: () => clock },
    );
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(3),
      flow: saved,
      analytics: gameAnalytics,
    });
    clock += 30_000;
    store.getState().dispatch({ type: 'resign', player: 'white' });
    const resumed = events(analytics).find((e) => e.event === 'game_finished');
    expect(resumed).toMatchObject({ event: 'game_finished', result: 'resign' });
    expect(resumed).not.toHaveProperty('durationSec');

    analytics.sent.length = 0;
    store.getState().dispatch({ type: 'nextGame' });
    finishOpening(store);
    clock += 42_000;
    store.getState().dispatch({ type: 'resign', player: 'black' });
    expect(events(analytics).find((e) => e.event === 'game_finished')).toMatchObject({
      durationSec: 42,
    });
  });

  it('sends game_started for a rematch', () => {
    const { analytics, store } = setup();
    store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    analytics.sent.length = 0;

    store.getState().rematch();
    expect(events(analytics).map((e) => e.event)).toEqual(['game_started']);
  });

  it('sends game_abandoned once, and never for a finished game', () => {
    const { analytics, gameAnalytics, store } = setup();
    finishOpening(store);
    analytics.sent.length = 0;

    gameAnalytics.gameAbandoned(store.getState().flow);
    gameAnalytics.gameAbandoned(store.getState().flow);
    expect(events(analytics)).toEqual([
      { event: 'game_abandoned', mode: 'local', game: 'portes', variant: 'portes', turn: 1 },
    ]);

    const other = setup();
    finishOpening(other.store);
    other.store.getState().dispatch({ type: 'resign', player: 'white' });
    other.analytics.sent.length = 0;
    other.gameAnalytics.gameAbandoned(other.store.getState().flow);
    expect(events(other.analytics)).toEqual([]);
  });

  it('sends nothing while the user has not opted in', () => {
    const { analytics, store } = setup({ mode: 'local', game: 'portes' }, false);
    finishOpening(store);
    store.getState().dispatch({ type: 'resign', player: 'white' });
    expect(analytics.sent).toEqual([]);
  });

  it('maps a bear-off to mono or diplo', () => {
    const { analytics, gameAnalytics, store } = setup();
    finishOpening(store);
    const previous = store.getState().flow;
    const won = (points: number): MatchFlow => ({
      ...previous,
      game: {
        ...previous.game,
        phase: 'game-over',
        result: { winner: 'white', points, reason: 'borneOff' },
      },
    });
    analytics.sent.length = 0;

    const move = { type: 'confirm', player: 'white' } as const;
    gameAnalytics.actionApplied(previous, won(2), move);
    expect(events(analytics)).toMatchObject([{ event: 'game_finished', result: 'diplo' }]);
  });
});

describe('gameAnalytics when a send throws', () => {
  /** Recording analytics whose `track` throws once for each named event. */
  function flaky(...failOnce: AnalyticsEventName[]) {
    const analytics = createRecordingAnalytics();
    analytics.optIn();
    const pending = new Set(failOnce);
    const port: Analytics = {
      ...analytics,
      track: (event, ...props) => {
        if (pending.delete(event)) throw new Error(`${event} failed`);
        analytics.track(event, ...props);
      },
    };
    return { analytics, port };
  }

  function play({ analytics, port }: ReturnType<typeof flaky>) {
    const gameAnalytics = createGameAnalytics(
      { mode: 'local', game: 'portes' },
      { analytics: port },
    );
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      targetPoints: 3,
      rng: createSeededRng(3),
      analytics: gameAnalytics,
    });
    finishOpening(store);
    analytics.sent.length = 0;
    return { gameAnalytics, store };
  }

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('still sends game_finished when resign fails', () => {
    const subject = flaky('resign');
    const { analytics } = subject;
    const { store } = play(subject);

    store.getState().dispatch({ type: 'resign', player: 'white' });
    expect(events(analytics)).toMatchObject([{ event: 'game_finished', result: 'resign' }]);
  });

  it('does not mark a game as reported when its event failed', () => {
    const subject = flaky('game_abandoned');
    const { analytics } = subject;
    const { gameAnalytics, store } = play(subject);

    gameAnalytics.gameAbandoned(store.getState().flow);
    expect(events(analytics)).toEqual([]);
    // The failed event did not close the game, so a later call sends it.
    gameAnalytics.gameAbandoned(store.getState().flow);
    expect(events(analytics)).toEqual([
      { event: 'game_abandoned', mode: 'local', game: 'portes', variant: 'portes', turn: 1 },
    ]);
  });
});

describe('resultKind', () => {
  it('maps engine results to the event plan', () => {
    expect(resultKind({ winner: 'white', points: 1, reason: 'borneOff' })).toBe('mono');
    expect(resultKind({ winner: 'black', points: 2, reason: 'borneOff' })).toBe('diplo');
    expect(resultKind({ winner: 'black', points: 2, reason: 'motherPinned' })).toBe('diplo');
    expect(resultKind({ winner: 'white', points: 3, reason: 'borneOff' })).toBe('diplo');
    expect(resultKind({ winner: 'white', points: 2, reason: 'resigned' })).toBe('resign');
    expect(resultKind({ winner: null, points: 0, reason: 'deadlock' })).toBe('draw');
    // A time-out is its own result, whatever the points (1, or 2 for a diplo).
    expect(resultKind({ winner: 'black', points: 1, reason: 'timeout' })).toBe('timeout');
    expect(resultKind({ winner: 'white', points: 2, reason: 'timeout' })).toBe('timeout');
  });
});
