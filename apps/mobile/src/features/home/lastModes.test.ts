import { createMemoryStorage, type Storage } from '@tavli/contracts';

import { LAST_MODES_STORAGE_KEY, createLastModes, isRankedRegular, parseModes } from './lastModes';

describe('isRankedRegular', () => {
  it('needs the newest match ranked and two of the last three', () => {
    expect(isRankedRegular([])).toBe(false);
    expect(isRankedRegular(['ranked'])).toBe(false);
    expect(isRankedRegular(['ranked', 'ranked'])).toBe(true);
    expect(isRankedRegular(['ranked', 'bot', 'ranked'])).toBe(true);
    expect(isRankedRegular(['bot', 'ranked', 'ranked'])).toBe(false);
    expect(isRankedRegular(['ranked', 'bot', 'friend'])).toBe(false);
  });
});

describe('parseModes', () => {
  it('reads a saved list and drops anything else', () => {
    expect(parseModes(undefined)).toEqual([]);
    expect(parseModes('not json')).toEqual([]);
    expect(parseModes('{"a":1}')).toEqual([]);
    expect(parseModes('["ranked","chess","bot","local","friend"]')).toEqual([
      'ranked',
      'bot',
      'local',
    ]);
  });
});

describe('createLastModes', () => {
  it('keeps the last three modes, newest first', () => {
    const storage = createMemoryStorage();
    const modes = createLastModes(storage);
    modes.record('bot');
    modes.record('ranked');
    expect(modes.rankedRegular()).toBe(false);
    modes.record('ranked');
    expect(modes.modes()).toEqual(['ranked', 'ranked', 'bot']);
    expect(modes.rankedRegular()).toBe(true);
    modes.record('friend');
    expect(modes.modes()).toEqual(['friend', 'ranked', 'ranked']);
    expect(modes.rankedRegular()).toBe(false);
    expect(storage.getString(LAST_MODES_STORAGE_KEY)).toBe('["friend","ranked","ranked"]');
  });

  it('shrugs off a storage error', () => {
    const broken: Storage = {
      getString: () => {
        throw new Error('disk');
      },
      setString: () => {
        throw new Error('disk');
      },
      remove: () => undefined,
    };
    const modes = createLastModes(broken);
    expect(() => modes.record('ranked')).not.toThrow();
    expect(modes.rankedRegular()).toBe(false);
  });
});
