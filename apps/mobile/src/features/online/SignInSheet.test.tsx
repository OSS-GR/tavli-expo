/**
 * The sign-in sheet has its own Not now button in its header, so the
 * dimmed part of the sheet is skipped by screen readers: they hear one
 * Not now button, not two. iOS already skips it (`accessibilityViewIsModal`
 * on the sheet), Android does not, so the test counts hidden views too.
 */
import {
  createMemoryAppleSheet,
  createMemoryAuthProvider,
  createMemoryAuthStore,
} from '@tavli/contracts';
import { screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

import { SignInSheet } from './SignInSheet';

runOnFakeTimers();

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('offers one Not now button to screen readers, and it closes the sheet', async () => {
  const onClose = jest.fn();
  await renderWithRoot(
    <SignInSheet
      auth={createMemoryAuthProvider(createMemoryAuthStore())}
      onSignedIn={jest.fn()}
      onClose={onClose}
      appleSheet={createMemoryAppleSheet()}
    />,
  );
  const notNow = screen.getAllByRole('button', { name: 'Not now', includeHiddenElements: true });
  expect(notNow).toHaveLength(1);
  const user = setupUser();
  await user.press(notNow[0]!);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('keeps the dimmed part as the close button on the email step', async () => {
  const onClose = jest.fn();
  await renderWithRoot(
    <SignInSheet
      auth={createMemoryAuthProvider(createMemoryAuthStore())}
      onSignedIn={jest.fn()}
      onClose={onClose}
      appleSheet={createMemoryAppleSheet()}
    />,
  );
  const user = setupUser();
  await user.press(screen.getByTestId('sign-in-email'));
  // The header and its close button are gone: the dimmed part is the
  // screen reader's way out.
  expect(screen.queryByTestId('sign-in-not-now')).toBeNull();
  // The test library counts views beside `accessibilityViewIsModal` as
  // hidden (iOS does too), so look at what Android's TalkBack reads.
  const closes = screen.getAllByRole('button', { name: 'Not now', includeHiddenElements: true });
  expect(closes).toHaveLength(1);
  expect(closes[0]!.props.accessible).toBe(true);
  expect(closes[0]!.props.importantForAccessibility).toBe('auto');
  await user.press(closes[0]!);
  expect(onClose).toHaveBeenCalledTimes(1);

  // Back to the choices: one Not now again, the header's.
  await user.press(screen.getByRole('button', { name: 'Back' }));
  expect(
    screen.getAllByRole('button', { name: 'Not now', includeHiddenElements: true }),
  ).toHaveLength(1);
  expect(screen.getByTestId('sign-in-not-now')).toBeTruthy();
});
