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
