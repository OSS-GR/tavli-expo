import { createMemoryStorage, createRecordingAnalytics, type Analytics } from '@tavli/contracts';

import { TUTORIAL_STORAGE_KEY, createTutorialStore, offersTutorial } from './progress';
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
      { type: 'track', event: 'tutorial_started', props: { source: 'home' } },
      { type: 'track', event: 'tutorial_step', props: { step: 1, lesson: 'move' } },
      { type: 'track', event: 'tutorial_skipped', props: { step: 2, lesson: 'bothDice' } },
      { type: 'track', event: 'tutorial_finished', props: {} },
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
