/**
 * The free account step before an invite on the server (#281): a saved
 * session, the guest made once on "Show the invite", a failed sign-in,
 * and a build with no online server.
 */
import {
  createMemoryAuthProvider,
  createMemoryAuthStore,
  type AuthProvider,
} from '@tavli/contracts';
import { act, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import i18n from '@/i18n';

import { InviteAccountGate } from './InviteAccountGate';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

runOnFakeTimers();

afterAll(async () => {
  await i18n.changeLanguage('en');
});

async function openGate(auth: AuthProvider | undefined) {
  const onHome = jest.fn();
  await renderWithRoot(
    <InviteAccountGate auth={auth} onHome={onHome}>
      {(me) => <Text>{`invite for ${me}`}</Text>}
    </InviteAccountGate>,
  );
  return { onHome };
}

describe('InviteAccountGate', () => {
  it('asks first, then makes the guest once and shows the invite', async () => {
    const user = setupUser();
    const store = createMemoryAuthStore();
    const { onHome } = await openGate(createMemoryAuthProvider(store));
    expect(await screen.findByRole('header', { name: 'Game invite' })).toBeOnTheScreen();
    expect(store.guests).toBe(0);
    await user.press(screen.getByRole('button', { name: 'Show the invite' }));
    expect(await screen.findByText('invite for guest-1')).toBeOnTheScreen();
    expect(store.guests).toBe(1);
    expect(onHome).not.toHaveBeenCalled();
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
    await openGate(auth);
    await user.press(await screen.findByRole('button', { name: 'Show the invite' }));
    expect(
      await screen.findByText(
        'Your free account was not made. Check the connection and try again.',
      ),
    ).toBeOnTheScreen();
    fail = false;
    await user.press(screen.getByRole('button', { name: 'Show the invite' }));
    expect(await screen.findByText('invite for guest-1')).toBeOnTheScreen();
  });

  it('Home goes Home', async () => {
    const user = setupUser();
    const { onHome } = await openGate(createMemoryAuthProvider(createMemoryAuthStore()));
    await user.press(await screen.findByRole('button', { name: 'Home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('says online play is off in a build with no server', async () => {
    const { onHome } = await openGate(undefined);
    expect(screen.getByRole('header', { name: 'Online play is off' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show the invite' })).toBeNull();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('shows Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await openGate(createMemoryAuthProvider(createMemoryAuthStore()));
    expect(await screen.findByRole('button', { name: 'Δες την πρόσκληση' })).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});
