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
      {
        event: 'game_started',
        mode: 'bot',
        game: 'portes',
        variant: 'portes',
        matchLength: 5,
        botLevel: 'easy',
        openingRoll: 'useOpeningDice',
        rulesVersion: 'portes',
      },
    ]);
  });

  it('sends the opening roll house rule as a value id (#207)', () => {
    matchSessions.start({ ...localSetup, openingRoll: 'rerollBoth' });
    expect(tracked()[0]).toMatchObject({ event: 'game_started', openingRoll: 'rerollBoth' });
  });

  it('sends the rules version as a value id: the preset of the game in play (#241)', () => {
    matchSessions.start({
      ...localSetup,
      game: 'asodio',
      rulesVersions: { plakoto: 'plakoto', asodio: 'asodio.aceyDeuceyAmerican' },
    });
    expect(tracked()[0]).toMatchObject({
      event: 'game_started',
      game: 'asodio',
      rulesVersion: 'asodio.aceyDeuceyAmerican',
    });
  });

  it('sends game: tavli for a Tavli match, and the game in play as variant', () => {
    matchSessions.start({ ...localSetup, game: 'tavli' });
    expect(tracked()).toEqual([
      {
        event: 'game_started',
        mode: 'local',
        game: 'tavli',
        variant: 'portes',
        matchLength: 3,
        openingRoll: 'useOpeningDice',
        rulesVersion: 'portes',
      },
    ]);
  });

  it('a Tavli match sends the Plakoto version only for its Plakoto game (#247)', () => {
    const { store } = matchSessions.start({
      ...localSetup,
      game: 'tavli',
      targetPoints: 7,
      rulesVersions: { plakoto: 'plakoto.federation', asodio: 'asodio.kafeneio' },
    });
    const { dispatch } = store.getState();
    for (let game = 0; game < 2; game += 1) {
      dispatch({ type: 'rollOpening', player: 'white', die: 6 });
      dispatch({ type: 'rollOpening', player: 'black', die: 1 });
      dispatch({ type: 'resign', player: 'white' });
      dispatch({ type: 'nextGame' });
    }
    const started = tracked().filter((e) => e.event === 'game_started');
    expect(started).toMatchObject([
      { game: 'tavli', variant: 'portes', rulesVersion: 'portes' },
      { game: 'tavli', variant: 'plakoto', rulesVersion: 'plakoto.federation' },
      { game: 'tavli', variant: 'fevga', rulesVersion: 'fevga' },
    ]);
  });

  it('sends game_started for pass-and-play, with no player names', () => {
    matchSessions.start(localSetup);
    expect(tracked()).toEqual([
      {
        event: 'game_started',
        mode: 'local',
        game: 'portes',
        variant: 'portes',
        matchLength: 3,
        openingRoll: 'useOpeningDice',
        rulesVersion: 'portes',
      },
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
      game: 'portes',
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
        createGameAnalytics({ mode: setup.mode, game: setup.game }, { analytics: recorded }),
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
