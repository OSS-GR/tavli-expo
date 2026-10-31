// One live online store per component (#255), also when React runs the
// effects again (a hidden screen that comes back, Fast Refresh, StrictMode).
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { act, render, renderHook } from '@testing-library/react-native';
import { Activity, StrictMode, Suspense, type ReactNode } from 'react';

import type { OnlineStore } from './onlineStore';
import { useOnlineGame } from './useOnlineGame';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

function setup() {
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => Date.now() });
  const gameId = server.createGame('me', { white: 'me', black: 'bot' }, 'portes', 3, 1);
  return { server, gameId, transport: server.transportFor('me') };
}

describe('useOnlineGame', () => {
  it('has a live store again when a hidden screen comes back (Activity)', async () => {
    const { server, gameId, transport } = setup();
    let seen: OnlineStore | null = null;
    function Game() {
      seen = useOnlineGame({ transport, gameId, me: 'me' });
      return null;
    }
    const screen = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <Game />
      </Activity>
    );
    const { rerender } = await render(screen('visible'));
    await flush();
    const first = seen!;
    expect(first.getState().flow).not.toBeNull();

    // Hidden: React runs the effect cleanups. Shown again: the effects run again.
    await rerender(screen('hidden'));
    await rerender(screen('visible'));
    await flush();
    const store = seen!;
    expect(store.getState().flow).not.toBeNull();
    let sent = false;
    await act(async () => {
      sent = store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    });
    expect(store.getState().lastError).toBeNull();
    expect(sent).toBe(true);
    await flush();
    expect(server.getGame(gameId)?.status).toBe('finished');
  });

  it('keeps a live store when the effects run twice (StrictMode)', async () => {
    const { server, gameId, transport } = setup();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = await renderHook(
      () => useOnlineGame({ transport, gameId, me: 'me' }),
      { wrapper },
    );
    await flush();
    const store = result.current!;
    expect(store.getState().flow).not.toBeNull();
    // The store still talks to the server: Resign match goes through.
    let sent = false;
    await act(async () => {
      sent = store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    });
    expect(sent).toBe(true);
    expect(store.getState().lastError).toBeNull();
    await flush();
    expect(server.getGame(gameId)?.status).toBe('finished');
    expect(result.current!.getState().view?.status).toBe('finished');

    // Unmounting disposes it.
    await unmount();
    expect(store.getState().dispatch({ type: 'resignMatch', player: 'white' })).toBe(false);
  });

  it('keeps one store across renders', async () => {
    const { gameId, transport } = setup();
    const { result, rerender } = await renderHook(() =>
      useOnlineGame({ transport, gameId, me: 'me' }),
    );
    await flush();
    const first = result.current!;
    await rerender({});
    expect(result.current).toBe(first);
    expect(first.getState().flow).not.toBeNull();
  });

  it('opens nothing in a render that React throws away', async () => {
    const { gameId, transport } = setup();
    let open = 0;
    const counted = {
      ...transport,
      subscribe: (...args: Parameters<typeof transport.subscribe>) => {
        open += 1;
        const stop = transport.subscribe(...args);
        return () => {
          open -= 1;
          stop();
        };
      },
    };
    function Game(): ReactNode {
      useOnlineGame({ transport: counted, gameId, me: 'me' });
      // The mount suspends for good: React drops this render.
      throw new Promise<never>(() => {});
    }
    const { unmount } = await render(
      <Suspense fallback={null}>
        <Game />
      </Suspense>,
    );
    await flush();
    expect(open).toBe(0);
    await unmount();
    expect(open).toBe(0);
  });
});
