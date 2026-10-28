/**
 * One online store for the life of a component (#255). It subscribes when
 * the component mounts and stops when it unmounts. The options are read
 * once: key the component by the game id, so another game gets a new
 * component and a new store.
 */
import { useEffect, useState } from 'react';

import { createOnlineStore, type OnlineStore, type OnlineStoreOptions } from './onlineStore';

export function useOnlineGame(options: OnlineStoreOptions): OnlineStore {
  const [store] = useState(() => createOnlineStore(options));
  useEffect(() => () => store.getState().dispose(), [store]);
  return store;
}
