/**
 * Drives the email code step (`EmailCodeForm`, #433) in screen tests: types
 * the address, sends, then types the newest code from the in-memory
 * provider's inbox (`MemoryAuthStore.sentEmailCodes`). No mail goes out.
 */
import type { MemoryAuthStore } from '@tavli/contracts';
import { screen } from '@testing-library/react-native';

import type { setupUser } from './clock';

type User = ReturnType<typeof setupUser>;

/** Types `email` and taps Send the code; resolves once the code step shows. */
export async function sendEmailCode(user: User, email: string): Promise<void> {
  await user.type(await screen.findByTestId('email-code-address'), email);
  await user.press(screen.getByTestId('email-code-send'));
  await screen.findByTestId('email-code-input');
}

/** The newest code the in-memory provider sent to `email` (normalized). */
export function newestCode(store: MemoryAuthStore, email: string): string {
  const address = email.trim().toLowerCase();
  const sent = store.sentEmailCodes.filter((mail) => mail.email === address);
  const last = sent[sent.length - 1];
  if (last === undefined) throw new Error(`no code sent to ${address}`);
  return last.code;
}

/** Sends a code to `email` and types it: six digits check it at once. */
export async function enterEmailCode(
  user: User,
  store: MemoryAuthStore,
  email: string,
): Promise<void> {
  await sendEmailCode(user, email);
  await user.type(screen.getByTestId('email-code-input'), newestCode(store, email));
}
