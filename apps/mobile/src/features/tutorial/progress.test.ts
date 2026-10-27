import { createMemoryStorage, createRecordingAnalytics, type Analytics } from '@tavli/contracts';

import {
  TUTORIAL_STORAGE_KEY,
  createTutorialStore,
  offersTutorial,
  statusOf,
  tutorialStorageKey,
} from './progress';
import { createTutorialAnalytics } from './tutorialAnalytics';

describe('tutorial status', () => {
  it('is new at first, and Home offers the tutorial', () => {
    const store = createTutorialStore(createMemoryStorage());
    expect(store.getState().status).toBe('new');
    expect(offersTutorial('new')).toBe(true);
    expect(offersTutorial('dismissed')).toBe(false);
    expect(offersTutorial('done')).toBe(false);
  });

  it('saves "dismissed" and "done", and loads them again', () => {
    const storage = createMemoryStorage();
    createTutorialStore(storage).getState().dismiss();
    expect(createTutorialStore(storage).getState().status).toBe('dismissed');
    createTutorialStore(storage).getState().finish();
    expect(createTutorialStore(storage).getState().status).toBe('done');
  });

  it('never goes from done back to dismissed (a skip after a replay)', () => {
    const storage = createMemoryStorage();
    const store = createTutorialStore(storage);
    store.getState().finish();
    store.getState().dismiss();
    expect(store.getState().status).toBe('done');
    expect(createTutorialStore(storage).getState().status).toBe('done');
  });

  it.each(['not json', 'null', '{"status":"maybe"}', '[]'])('loads bad data (%s) as new', (raw) => {
    const storage = createMemoryStorage();
    storage.setString(TUTORIAL_STORAGE_KEY, raw);
    expect(createTutorialStore(storage).getState().status).toBe('new');
  });

  it('saves Plakoto and Fevga apart from Portes (#149)', () => {
    const storage = createMemoryStorage();
    const store = createTutorialStore(storage);
    expect(store.getState().variants).toEqual({ plakoto: 'new', fevga: 'new' });
    store.getState().finish('plakoto');
    store.getState().dismiss('fevga');
    // Portes, and so the Home card, did not change.
    expect(store.getState().status).toBe('new');
    expect(storage.getString(TUTORIAL_STORAGE_KEY)).toBeUndefined();
    expect(JSON.parse(storage.getString('tutorial.plakoto') ?? '')).toEqual({
      version: 1,
      status: 'done',
    });
    const again = createTutorialStore(storage).getState();
    expect(statusOf(again, 'portes')).toBe('new');
    expect(statusOf(again, 'plakoto')).toBe('done');
    expect(statusOf(again, 'fevga')).toBe('dismissed');
  });

  it('takes anything but a lesson set as Portes (a press event as the argument)', () => {
    const store = createTutorialStore(createMemoryStorage());
    store.getState().dismiss({ nativeEvent: {} } as never);
    expect(store.getState().status).toBe('dismissed');
    expect(store.getState().variants).toEqual({ plakoto: 'new', fevga: 'new' });
  });

  it('reads a Portes status saved before #149 (same key, same format)', () => {
    const storage = createMemoryStorage();
    storage.setString('tutorial', JSON.stringify({ version: 1, status: 'done' }));
    const state = createTutorialStore(storage).getState();
    expect(state.status).toBe('done');
    expect(state.variants).toEqual({ plakoto: 'new', fevga: 'new' });
    expect(tutorialStorageKey('portes')).toBe(TUTORIAL_STORAGE_KEY);
    expect(tutorialStorageKey('fevga')).toBe('tutorial.fevga');
  });

  it('keeps working when the storage fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = createMemoryStorage();
    storage.setString = () => {
      throw new Error('disk full');
    };
    const store = createTutorialStore(storage);
    expect(() => store.getState().dismiss()).not.toThrow();
    expect(store.getState().status).toBe('dismissed');
    warn.mockRestore();
  });
});

describe('tutorial analytics', () => {
  const run = (analytics: Analytics) => {
    const events = createTutorialAnalytics(analytics);
    events.started('home');
    events.step(1, 'move');
    events.skipped(2, 'bothDice');
    events.finished();
  };

  it('sends nothing before the user allows usage data', () => {
    const analytics = createRecordingAnalytics();
    run(analytics);
    expect(analytics.sent).toEqual([]);
  });

  it('sends the four events after "Allow", with no personal data', () => {
    const analytics = createRecordingAnalytics();
    analytics.optIn();
    run(analytics);
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'tutorial_started', props: { source: 'home', game: 'portes' } },
      { type: 'track', event: 'tutorial_step', props: { game: 'portes', step: 1, lesson: 'move' } },
      {
        type: 'track',
        event: 'tutorial_skipped',
        props: { game: 'portes', step: 2, lesson: 'bothDice' },
      },
      { type: 'track', event: 'tutorial_finished', props: { game: 'portes' } },
    ]);
  });

  it('names the lesson set in every event (#149)', () => {
    const analytics = createRecordingAnalytics();
    analytics.optIn();
    const events = createTutorialAnalytics(analytics, 'fevga');
    events.started('rules');
    events.step(3, 'runner');
    events.finished();
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'tutorial_started', props: { source: 'rules', game: 'fevga' } },
      {
        type: 'track',
        event: 'tutorial_step',
        props: { game: 'fevga', step: 3, lesson: 'runner' },
      },
      { type: 'track', event: 'tutorial_finished', props: { game: 'fevga' } },
    ]);
  });

  it('drops an analytics error: the tutorial goes on', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const analytics = createRecordingAnalytics();
    analytics.track = () => {
      throw new Error('boom');
    };
    expect(() => run(analytics)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
