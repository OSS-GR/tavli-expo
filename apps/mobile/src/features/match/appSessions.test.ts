import { createMemoryStorage, type createRecordingAnalytics, type Storage } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';

import { createGameAnalytics } from '@/features/analytics/gameAnalytics';
import { analytics } from '@/services';

import { matchSessions } from './appSessions';
import { createSessionRegistry } from './sessions';
import { defaultSetup, type MatchSetup } from './setup';

const recorded = analytics as ReturnType<typeof createRecordingAnalytics>;

const botSetup: MatchSetup = { ...defaultSetup('bot'), targetPoints: 5 };
const localSetup: MatchSetup = { ...defaultSetup('local'), names: { white: 'Maria', black: '' } };

function tracked() {
  return recorded.sent.flatMap((s) => (s.type === 'track' ? [{ event: s.event, ...s.props }] : []));
}

beforeEach(() => {
  recorded.optIn();
  recorded.sent.length = 0;
});

afterEach(() => {
  recorded.optOut();
  const current = matchSessions.current();
  if (current) matchSessions.end(current.id);
});

describe('game events for real matches (#61)', () => {
  it('sends game_started with the bot level for a match vs the bot', () => {
    matchSessions.start(botSetup);
    expect(tracked()).toEqual([
      { event: 'game_started', mode: 'bot', variant: 'portes', matchLength: 5, botLevel: 'easy' },
    ]);
  });

  it('sends game_started for pass-and-play, with no player names', () => {
    matchSessions.start(localSetup);
    expect(tracked()).toEqual([
      { event: 'game_started', mode: 'local', variant: 'portes', matchLength: 3 },
    ]);
    expect(JSON.stringify(recorded.sent)).not.toContain('Maria');
  });

  it('sends resign and game_finished when a player resigns the match', () => {
    const { store } = matchSessions.start(localSetup);
    recorded.sent.length = 0;

    store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    expect(tracked().map((e) => e.event)).toEqual(['resign', 'game_finished']);
  });

  it('sends nothing before opt-in', () => {
    recorded.optOut();
    const { store } = matchSessions.start(botSetup);
    store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    expect(recorded.sent).toEqual([]);
  });

  it('sends game_abandoned when a new match replaces an unfinished one', () => {
    matchSessions.start(localSetup);
    recorded.sent.length = 0;

    matchSessions.start(botSetup);
    expect(tracked().map((e) => e.event)).toEqual(['game_abandoned', 'game_started']);
    expect(tracked()[0]).toEqual({
      event: 'game_abandoned',
      mode: 'local',
      variant: 'portes',
      turn: 1,
    });
  });

  it('sends no game_abandoned when the match before was over', () => {
    const { store } = matchSessions.start(localSetup);
    store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    recorded.sent.length = 0;

    matchSessions.start(botSetup);
    expect(tracked().map((e) => e.event)).toEqual(['game_started']);
  });
});

describe('game events after an app restart (#61)', () => {
  /** A fresh registry on the same storage: the app after a restart. */
  function launch(storage: Storage) {
    return createSessionRegistry({
      createRng: () => createSeededRng(5),
      storage,
      createAnalytics: (setup) =>
        createGameAnalytics({ mode: setup.mode }, { analytics: recorded }),
    });
  }

  it('a resumed match sends no new game_started, but sends the later events', () => {
    const storage = createMemoryStorage();
    const { id } = launch(storage).start(localSetup);
    recorded.sent.length = 0;

    const resumed = launch(storage).get(id);
    expect(resumed).not.toBeNull();
    expect(tracked()).toEqual([]);

    resumed!.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    expect(tracked().map((e) => e.event)).toEqual(['resign', 'game_finished']);
  });

  it('replacing a saved unfinished match sends game_abandoned for it', () => {
    const storage = createMemoryStorage();
    launch(storage).start(localSetup);
    recorded.sent.length = 0;

    launch(storage).start(botSetup);
    expect(tracked().map((e) => e.event)).toEqual(['game_abandoned', 'game_started']);
  });
});
