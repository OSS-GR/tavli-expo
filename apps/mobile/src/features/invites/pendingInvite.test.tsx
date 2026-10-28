/**
 * `usePendingInvite` (#256) on its own, with a fake path: it keeps the
 * code of an invite link that came during the welcome flow, and drops it
 * once the welcome flow has redirected, wherever that went.
 */
import { renderHook } from '@testing-library/react-native';

import { usePendingInvite } from './pendingInvite';

let mockPathname = '/';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));

async function at(path: string, welcome: boolean, rerender: (props: boolean) => Promise<void>) {
  mockPathname = path;
  await rerender(welcome);
}

describe('usePendingInvite', () => {
  it('keeps the code during the welcome flow, then drops it at the invite', async () => {
    mockPathname = '/invite/abcd2345';
    const { result, rerender } = await renderHook((welcome: boolean) => usePendingInvite(welcome), {
      initialProps: true,
    });
    expect(result.current).toBe('ABCD2345');
    await at('/welcome/language', true, rerender);
    expect(result.current).toBe('ABCD2345');
    // The answer is in: the redirect still needs the code on the welcome route.
    await at('/welcome/privacy', false, rerender);
    expect(result.current).toBe('ABCD2345');
    await at('/invite/ABCD2345', false, rerender);
    expect(result.current).toBeNull();
  });

  it('drops the code when the welcome flow went somewhere else', async () => {
    mockPathname = '/invite/ABCD2345';
    const { result, rerender } = await renderHook((welcome: boolean) => usePendingInvite(welcome), {
      initialProps: true,
    });
    await at('/welcome/language', true, rerender);
    await at('/', false, rerender);
    expect(result.current).toBeNull();
    // A later welcome flow does not open the old invite.
    await at('/welcome/language', true, rerender);
    expect(result.current).toBeNull();
  });

  it('keeps nothing for an app route after the welcome flow, or for a bad code', async () => {
    mockPathname = '/invite/ABCD2345';
    const { result, rerender } = await renderHook((welcome: boolean) => usePendingInvite(welcome), {
      initialProps: false,
    });
    expect(result.current).toBeNull();
    await at('/invite/ABCD234O', true, rerender);
    expect(result.current).toBeNull();
  });
});
