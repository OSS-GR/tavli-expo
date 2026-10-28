/**
 * One live online store for a component (#255). The options are read
 * once: key the component by the game id, so another game gets a new
 * component and a new store.
 *
 * The store lives while the component is subscribed to it. It is made
 * in `subscribe`, never while rendering: a render that React throws away
 * (a suspended or failed mount) leaves no open subscription behind. Until
 * then the hook gives `null`. When the last subscription ends (the
 * component unmounts), the store is disposed. A store cannot start again
 * after `dispose()`, so a new subscription after that (React runs effects
 * twice in StrictMode, Fast Refresh runs them again, a hidden screen comes
 * back) makes a new store, and the component renders with it.
 */
import { useState, useSyncExternalStore } from 'react';

import { createOnlineStore, type OnlineStore, type OnlineStoreOptions } from './onlineStore';

interface StoreHolder {
  current: () => OnlineStore | null;
  subscribe: (listener: () => void) => () => void;
}

function storeHolder(options: OnlineStoreOptions): StoreHolder {
  let store: OnlineStore | null = null;
  let live = false;
  const listeners = new Set<() => void>();
  return {
    current: () => store,
    subscribe: (listener) => {
      listeners.add(listener);
      if (!live) {
        store = createOnlineStore(options);
        live = true;
        // A new store: tell the component.
        for (const other of listeners) other();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && store !== null) {
          live = false;
          store.getState().dispose();
        }
      };
    },
  };
}

/** The component's store: `null` until it is subscribed (the first render). */
export function useOnlineGame(options: OnlineStoreOptions): OnlineStore | null {
  const [holder] = useState(() => storeHolder(options));
  return useSyncExternalStore(holder.subscribe, holder.current, holder.current);
}
