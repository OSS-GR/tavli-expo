/**
 * The free account step before an invite on the server (#281, #401): a
 * saved session, the sign-in choices (Apple, the guest made once, Not
 * now), a failed sign-in, and a build with no online server.
 */
import {
  createMemoryAppleSheet,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  createRecordingAnalytics,
  type AuthProvider,
  type MemoryAppleSheet,
} from '@tavli/contracts';
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import i18n from '@/i18n';

import { InviteAccountGate } from './InviteAccountGate';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

runOnFakeTimers();

afterAll(async () => {
  await i18n.changeLanguage('en');
});

async function openGate(
  auth: AuthProvider | undefined,
  appleSheet: MemoryAppleSheet = createMemoryAppleSheet(),
) {
  const onHome = jest.fn();
  const analytics = createRecordingAnalytics();
  analytics.optIn();
  await renderWithRoot(
    <InviteAccountGate auth={auth} onHome={onHome} appleSheet={appleSheet} analytics={analytics}>
      {(me) => <Text>{`invite for ${me}`}</Text>}
    </InviteAccountGate>,
  );
  return { onHome, analytics, appleSheet };
}

describe('InviteAccountGate', () => {
  it('asks first, then makes the guest once and shows the invite', async () => {
    const user = setupUser();
    const store = createMemoryAuthStore();
    const { onHome, analytics } = await openGate(createMemoryAuthProvider(store));
    expect(await screen.findByRole('header', { name: 'Game invite' })).toBeOnTheScreen();
    expect(store.guests).toBe(0);
    await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
    expect(await screen.findByText('invite for guest-1')).toBeOnTheScreen();
    expect(store.guests).toBe(1);
    expect(onHome).not.toHaveBeenCalled();
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'online_sign_in', props: { method: 'guest' } },
    ]);
  });

  it('signs in with Apple and shows the invite (the invite stays)', async () => {
    const user = setupUser();
    const store = createMemoryAuthStore();
    const { analytics, appleSheet } = await openGate(createMemoryAuthProvider(store));
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    expect(await screen.findByText('invite for user-1')).toBeOnTheScreen();
    // Apple's sheet got the server's nonce; the code went with the sign-in.
    expect(appleSheet.shown).toEqual(['nonce-1']);
    expect(store.appleCodes).toEqual(['code-apple-1']);
    expect(store.guests).toBe(0);
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'online_sign_in', props: { method: 'apple' } },
    ]);
    // Never the user id or the Apple id.
    expect(JSON.stringify(analytics.sent)).not.toMatch(/user-1|apple-1/);
  });

  it('a closed Apple sheet signs in nothing and shows no problem', async () => {
    const user = setupUser();
    const store = createMemoryAuthStore();
    const appleSheet = createMemoryAppleSheet();
    appleSheet.next = 'cancel';
    const { analytics } = await openGate(createMemoryAuthProvider(store), appleSheet);
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    expect(appleSheet.shown).toEqual(['nonce-1']);
    expect(store.session).toBeNull();
    expect(screen.getByRole('header', { name: 'Game invite' })).toBeOnTheScreen();
    expect(screen.queryByTestId('sign-in-failed')).toBeNull();
    expect(analytics.sent).toEqual([]);
    // The buttons work again.
    expect(screen.getByRole('button', { name: 'Continue as a guest' })).toBeEnabled();
  });

  it('a failed Apple sheet says so; the guest still works', async () => {
    const user = setupUser();
    const appleSheet = createMemoryAppleSheet();
    appleSheet.next = 'fail';
    await openGate(createMemoryAuthProvider(createMemoryAuthStore()), appleSheet);
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    expect(
      await screen.findByText('That did not work. Check the connection and try again.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
    expect(await screen.findByText('invite for guest-1')).toBeOnTheScreen();
  });

  it('a phone with no Apple ID points to Settings, not the connection (#442)', async () => {
    const user = setupUser();
    const store = createMemoryAuthStore();
    const appleSheet = createMemoryAppleSheet();
    appleSheet.next = 'unfinished';
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    await openGate(createMemoryAuthProvider(store), appleSheet);
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    const text =
      'Apple sign-in did not finish. Check that this phone is signed in to an Apple ID in Settings, or continue as a guest.';
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(text);
    expect(screen.queryByText(/Check the connection/)).toBeNull();
    expect(store.session).toBeNull();
    // The guest still works.
    await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
    expect(await screen.findByText('invite for guest-1')).toBeOnTheScreen();
    announce.mockRestore();
  });

  it('shows no Apple button where Apple sign-in does not work (Android)', async () => {
    const appleSheet = createMemoryAppleSheet();
    appleSheet.available = false;
    await openGate(createMemoryAuthProvider(createMemoryAuthStore()), appleSheet);
    expect(await screen.findByRole('button', { name: 'Continue as a guest' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
    expect(screen.queryByText(/With Apple you can sign in again/)).toBeNull();
  });

  it('shows the invite at once with a saved session, and makes no account', async () => {
    const store = createMemoryAuthStore();
    store.session = { id: 'guest-7', isGuest: true };
    await openGate(createMemoryAuthProvider(store));
    expect(await screen.findByText('invite for guest-7')).toBeOnTheScreen();
    expect(store.guests).toBe(0);
  });

  it('says so when the account is not made; the button tries again', async () => {
    const user = setupUser();
    const store = createMemoryAuthStore();
    const real = createMemoryAuthProvider(store);
    let fail = true;
    const auth: AuthProvider = {
      ...real,
      signInAsGuest: () =>
        fail ? Promise.reject({ code: 'NETWORK', message: 'offline' }) : real.signInAsGuest(),
    };
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await openGate(auth);
    await user.press(await screen.findByRole('button', { name: 'Continue as a guest' }));
    const text = 'That did not work. Check the connection and try again.';
    expect(await screen.findByText(text)).toBeOnTheScreen();
    // Read out: iOS VoiceOver does not read alert roles.
    expect(announce).toHaveBeenLastCalledWith(text);
    announce.mockRestore();
    fail = false;
    await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
    expect(await screen.findByText('invite for guest-1')).toBeOnTheScreen();
  });

  it('Not now goes Home and makes no account', async () => {
    const user = setupUser();
    const store = createMemoryAuthStore();
    const { onHome, analytics } = await openGate(createMemoryAuthProvider(store));
    await user.press(await screen.findByRole('button', { name: 'Not now' }));
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(store.session).toBeNull();
    expect(analytics.sent).toEqual([]);
  });

  it('says online play is off in a build with no server', async () => {
    const { onHome } = await openGate(undefined);
    expect(screen.getByRole('header', { name: 'Online play is off' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Continue as a guest' })).toBeNull();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('shows Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await openGate(createMemoryAuthProvider(createMemoryAuthStore()));
    expect(await screen.findByRole('button', { name: 'Συνέχεια ως επισκέπτης' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Όχι τώρα' })).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});
