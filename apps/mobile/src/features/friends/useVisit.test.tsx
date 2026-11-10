/**
 * `useVisit` (#406): a new visit after a blur and a focus, or when the
 * app comes back to the front while the screen has the focus. Strict
 * Mode runs the effects twice: that is no visit.
 */
import { act, render, screen } from '@testing-library/react-native';
import { StrictMode } from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { useVisit } from './useVisit';

type Listener = () => void;

/** A stand-in for the route's navigation: its events and its focus. */
const mockNavigation = {
  focused: true,
  listeners: new Map<string, Set<Listener>>(),
  addListener(type: string, fn: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(type, set);
    return () => set.delete(fn);
  },
  isFocused() {
    return this.focused;
  },
  send(type: 'blur' | 'focus') {
    this.focused = type === 'focus';
    for (const fn of this.listeners.get(type) ?? []) fn();
  },
};

jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));

// React Native's Jest setup makes `AppState.addEventListener` a mock.
const addListener = jest.mocked(AppState.addEventListener);
let firstCall = 0;

/** Sends an app state change to the listeners that are still on. */
function sendAppState(state: AppStateStatus): void {
  addListener.mock.calls.slice(firstCall).forEach(([type, fn], i) => {
    const sub = addListener.mock.results[firstCall + i]?.value as { remove: jest.Mock } | undefined;
    const removed = (sub?.remove.mock.calls.length ?? 0) > 0;
    if (type === 'change' && !removed) (fn as (next: AppStateStatus) => void)(state);
  });
}

function Probe() {
  return <Text testID="visit">{useVisit()}</Text>;
}

beforeEach(() => {
  mockNavigation.focused = true;
  mockNavigation.listeners.clear();
  firstCall = addListener.mock.calls.length;
  // Each listener gets its own remove, so a test knows which are off.
  addListener.mockImplementation(() => ({ remove: jest.fn() }));
  AppState.currentState = 'active';
});

const visit = () => screen.getByTestId('visit').props.children as number;

describe('useVisit', () => {
  it('is 1 at first, also in Strict Mode', async () => {
    await render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(visit()).toBe(1);
  });

  it('counts a focus after a blur, not a focus alone', async () => {
    await render(<Probe />);
    await act(async () => mockNavigation.send('focus'));
    expect(visit()).toBe(1);
    await act(async () => mockNavigation.send('blur'));
    await act(async () => mockNavigation.send('focus'));
    expect(visit()).toBe(2);
  });

  it('counts the app coming back to the front, once, in Strict Mode too', async () => {
    await render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await act(async () => sendAppState('background'));
    expect(visit()).toBe(1);
    await act(async () => sendAppState('active'));
    expect(visit()).toBe(2);
    await act(async () => sendAppState('inactive'));
    await act(async () => sendAppState('active'));
    expect(visit()).toBe(3);
    // Already in front: no visit.
    await act(async () => sendAppState('active'));
    expect(visit()).toBe(3);
  });

  it('does not count the app coming back while another screen is on top', async () => {
    await render(<Probe />);
    await act(async () => mockNavigation.send('blur'));
    await act(async () => sendAppState('background'));
    await act(async () => sendAppState('active'));
    expect(visit()).toBe(1);
    // Back to this screen: that is the visit.
    await act(async () => mockNavigation.send('focus'));
    expect(visit()).toBe(2);
  });
});
