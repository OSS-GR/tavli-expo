/**
 * `useAnnouncement` (#216): a keyed game event is read once per app run, so
 * a remount does not read it again. Text without a key is read on every
 * mount and on every change, as before.
 */
import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { KEPT_EVENTS, resetAnnouncements, useAnnouncement } from './useAnnouncement';

import { runOnFakeTimers } from '../../../test/clock';

function Announcer({ text, eventKey }: { text: string | null; eventKey?: string }) {
  useAnnouncement(text, eventKey);
  return null;
}

let announce: jest.SpyInstance;

runOnFakeTimers();

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  // React Native's Jest setup makes it a `jest.fn` that can keep calls between tests.
  announce.mockClear();
});

afterEach(() => {
  announce.mockRestore();
});

/** Mounts the announcer, then unmounts it (the screen goes away). */
async function mountOnce(text: string | null, eventKey?: string) {
  await render(<Announcer text={text} {...(eventKey === undefined ? {} : { eventKey })} />);
  await screen.unmount();
}

describe('useAnnouncement with a key', () => {
  it('does not read the same event again after an unmount and a mount', async () => {
    await mountOnce('Bob rolled 5-3.', 'm1:turn:0:2:roll');
    await mountOnce('Bob rolled 5-3.', 'm1:turn:0:2:roll');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Bob rolled 5-3.');
  });

  it('reads a new key, even with the same text (two rolls of 5-3 in a row)', async () => {
    await mountOnce('Bob rolled 5-3.', 'm1:turn:0:2:roll');
    await mountOnce('Bob rolled 5-3.', 'm1:turn:0:4:roll');
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('reads a new key while mounted, but not a remount of it', async () => {
    await render(<Announcer text="Bob rolled 5-3." eventKey="a" />);
    await screen.rerender(<Announcer text="Bob rolled 6-1." eventKey="b" />);
    expect(announce.mock.calls).toEqual([['Bob rolled 5-3.'], ['Bob rolled 6-1.']]);
    await screen.unmount();
    await mountOnce('Bob rolled 6-1.', 'b');
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('reads a new text under the same key (the opening card after one die)', async () => {
    await render(<Announcer text="Each player rolls one die." eventKey="m1:0:opening:rolling:0" />);
    await screen.rerender(<Announcer text="Ann rolled 5." eventKey="m1:0:opening:rolling:0" />);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('reads nothing for no text', async () => {
    await mountOnce(null, 'm1:turn:0:1:roll');
    await mountOnce('', 'm1:turn:0:1:roll');
    expect(announce).not.toHaveBeenCalled();
  });

  it('keeps the newest events only, so the store stays small', async () => {
    await mountOnce('First.', 'first');
    for (let i = 0; i < KEPT_EVENTS; i++) await mountOnce('Next.', `next:${i}`);
    announce.mockClear();
    // The newest event is still kept; the oldest was dropped.
    await mountOnce('Next.', `next:${KEPT_EVENTS - 1}`);
    expect(announce).not.toHaveBeenCalled();
    await mountOnce('First.', 'first');
    expect(announce).toHaveBeenCalledWith('First.');
  });

  it('forgets every event on reset (each test is a new app run)', async () => {
    await mountOnce('Bob rolled 5-3.', 'm1:turn:0:2:roll');
    resetAnnouncements();
    await mountOnce('Bob rolled 5-3.', 'm1:turn:0:2:roll');
    expect(announce).toHaveBeenCalledTimes(2);
  });
});

describe('useAnnouncement without a key', () => {
  it('reads the text on every mount', async () => {
    await mountOnce('Hint: Checker from point 13 to point 8.');
    await mountOnce('Hint: Checker from point 13 to point 8.');
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('reads the text again when it changes, not on a render with the same text', async () => {
    await render(<Announcer text="Try again." />);
    await screen.rerender(<Announcer text="Try again." />);
    await screen.rerender(<Announcer text="Well done!" />);
    expect(announce.mock.calls).toEqual([['Try again.'], ['Well done!']]);
  });
});
