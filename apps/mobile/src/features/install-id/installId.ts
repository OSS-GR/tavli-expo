/**
 * A random id for this install of the app. It is not linked to a person:
 * no account, email or device id. Crash reports (and later analytics, #61)
 * use it to group reports from the same phone.
 *
 * It is saved through the `Storage` port and lives until the app is deleted.
 */
import { isAnonymousInstallId, type Storage } from '@tavli/contracts';
import { uuid } from 'expo';

export const INSTALL_ID_STORAGE_KEY = 'install-id';

/** A random UUID: from Expo's native generator, else from `Math.random`. */
export function randomInstallId(): string {
  try {
    return uuid.v4();
  } catch {
    // No native module (tests, or a broken build). Not secure, but random enough for an id.
    const hex = () =>
      Math.floor(Math.random() * 0x1_0000_0000)
        .toString(16)
        .padStart(8, '0');
    return `${hex()}${hex()}${hex()}${hex()}`;
  }
}

/** The saved install id. Makes and saves a new one on first launch. */
export function getInstallId(storage: Storage, makeId: () => string = randomInstallId): string {
  const saved = storage.getString(INSTALL_ID_STORAGE_KEY);
  if (isAnonymousInstallId(saved)) return saved;
  const id = makeId();
  storage.setString(INSTALL_ID_STORAGE_KEY, id);
  return id;
}
