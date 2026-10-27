/**
 * Screen tests on a fake clock.
 *
 * The game screen closes cards on timers: the opening result, the pass
 * card, the bot's answer note, the match end. The bot waits on timers
 * before it rolls and between moves. On a real clock a busy
 * machine can close a card before the test looks at it or taps it, so the
 * test fails at random. On a fake clock time only moves when the test
 * moves it: `jest.advanceTimersByTime`, `waitFor` (it moves the fake clock
 * while it waits) or the small waits of `setupUser()`.
 */
import { userEvent } from '@testing-library/react-native';

/** Call once at the top of a test file: every test in it runs on fake timers. */
export function runOnFakeTimers(): void {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });
}

/** `userEvent.setup()` for fake timers: its small waits move the fake clock. */
export const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
