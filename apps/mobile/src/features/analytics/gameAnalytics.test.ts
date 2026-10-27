import { createRecordingAnalytics } from '@tavli/contracts';
import { createSeededRng, type MatchFlow } from '@tavli/engine';

import { createGameStore, turnView } from '@/features/game/gameStore';
import { nextOpeningRoller } from '@/features/game/opening';

import { createGameAnalytics, resultKind, type GameAnalyticsSetup } from './gameAnalytics';

function setup(game: GameAnalyticsSetup = { mode: 'local' }, optedIn = true) {
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
      { event: 'game_started', mode: 'local', variant: 'portes', matchLength: 3 },
    ]);
  });

  it('adds the bot level for games vs the bot', () => {
    const { analytics } = setup({ mode: 'bot', botLevel: 'easy' });
    expect(events(analytics)[0]).toEqual({
      event: 'game_started',
      mode: 'bot',
      variant: 'portes',
      matchLength: 3,
      botLevel: 'easy',
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
        variant: store.getState().flow.game.state.variant,
        matchLength: 3,
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
      { event: 'game_abandoned', mode: 'local', variant: 'portes', turn: 1 },
    ]);

    const other = setup();
    finishOpening(other.store);
    other.store.getState().dispatch({ type: 'resign', player: 'white' });
    other.analytics.sent.length = 0;
    other.gameAnalytics.gameAbandoned(other.store.getState().flow);
    expect(events(other.analytics)).toEqual([]);
  });

  it('sends nothing while the user has not opted in', () => {
    const { analytics, store } = setup({ mode: 'local' }, false);
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

describe('resultKind', () => {
  it('maps engine results to the event plan', () => {
    expect(resultKind({ winner: 'white', points: 1, reason: 'borneOff' })).toBe('mono');
    expect(resultKind({ winner: 'black', points: 2, reason: 'borneOff' })).toBe('diplo');
    expect(resultKind({ winner: 'black', points: 2, reason: 'motherPinned' })).toBe('diplo');
    expect(resultKind({ winner: 'white', points: 3, reason: 'borneOff' })).toBe('diplo');
    expect(resultKind({ winner: 'white', points: 2, reason: 'resigned' })).toBe('resign');
    expect(resultKind({ winner: null, points: 0, reason: 'deadlock' })).toBe('draw');
  });
});
