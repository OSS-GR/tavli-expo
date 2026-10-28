/**
 * One live online store for a component (#255). The options are read
 * once: key the component by the game id, so another game gets a new
 * component and a new store.
 *
 * The store lives while the component is subscribed to it. When the last
 * subscription ends (the component unmounts), the store is disposed. A
 * store cannot start again after `dispose()`, so a new subscription after
 * that (React runs effects twice in StrictMode, Fast Refresh runs them
 * again, a hidden screen comes back) gets a new store, and the component
 * renders with it.
 */
import { useState, useSyncExternalStore } from 'react';

import { createOnlineStore, type OnlineStore, type OnlineStoreOptions } from './onlineStore';

interface StoreHolder {
  current: () => OnlineStore;
  subscribe: (listener: () => void) => () => void;
}

function storeHolder(options: OnlineStoreOptions): StoreHolder {
  let store: OnlineStore | null = null;
  let live = false;
  const listeners = new Set<() => void>();
  const current = () => {
    if (store === null || !live) {
      store = createOnlineStore(options);
      live = true;
    }
    return store;
  };
  return {
    current,
    subscribe: (listener) => {
      const before = store;
      const now = current();
      listeners.add(listener);
      // The last store was disposed: tell the component about the new one.
      if (now !== before) for (const other of listeners) other();
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

export function useOnlineGame(options: OnlineStoreOptions): OnlineStore {
  const [holder] = useState(() => storeHolder(options));
  return useSyncExternalStore(holder.subscribe, holder.current, holder.current);
}
