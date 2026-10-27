import type { createRecordingAnalytics } from '@tavli/contracts';

import { analytics } from '@/services';

import { matchSessions } from './appSessions';
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
});
