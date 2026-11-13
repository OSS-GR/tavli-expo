/**
 * Play a friend's "Make an invite link" in screen tests (#401, #516). With no saved
 * session it opens the sign-in sheet: this taps "Continue as a guest"
 * there, so the invite is made as before. With a session it only taps.
 */
import { screen } from '@testing-library/react-native';

import type { setupUser } from './clock';

export async function pressMakeInvite(user: ReturnType<typeof setupUser>): Promise<void> {
  await user.press(screen.getByRole('button', { name: 'Make an invite link' }));
  if (screen.queryByTestId('sign-in-sheet') === null) return;
  await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
}
