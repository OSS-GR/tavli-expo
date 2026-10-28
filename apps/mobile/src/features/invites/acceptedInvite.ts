/**
 * Who wants to know that this phone accepted an invite (#256).
 *
 * The invite route calls `inviteAccepted(gameId)` after Accept. Other
 * parts listen with `onInviteAccepted`. The dev invite (dev builds only,
 * `features/online/devGame.ts`) uses it to start its bot at once, so the
 * invite route needs no dev code.
 */

type Listener = (gameId: string) => void;

const listeners = new Set<Listener>();

/** Calls `listener` after each Accept. Returns a function that stops it. */
export function onInviteAccepted(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** This phone accepted an invite, and the server started `gameId`. */
export function inviteAccepted(gameId: string): void {
  // A copy: a listener may stop itself while it runs.
  for (const listener of [...listeners]) listener(gameId);
}
