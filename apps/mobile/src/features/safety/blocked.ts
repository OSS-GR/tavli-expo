/**
 * The players this phone knows the user blocks, for this app run (#441
 * review). It saves nothing.
 *
 * A screen that offers Report or block reads it: a blocked player gets
 * Report only, so the dialog never offers Block again. The ids come from
 * the server once per app run (`useKnownBlocks`, `Safety.listBlocked`) and
 * from what the user does here: a block or a report adds the player, an
 * Unblock in Settings takes them out. A list that does not load is no
 * problem: the dialog then offers Block, and the server takes a second
 * block of the same player.
 */
import type { Safety } from '@tavli/contracts';
import { useEffect } from 'react';
import { create } from 'zustand';

interface BlockedState {
  readonly ids: readonly string[];
  /** The server's list came in (or a load is on its way). */
  readonly asked: boolean;
}

const blockedStore = create<BlockedState>(() => ({ ids: [], asked: false }));

/** True when the user blocks this player, as far as this phone knows. */
export function useIsBlocked(playerId: string | null): boolean {
  return blockedStore((s) => playerId !== null && s.ids.includes(playerId));
}

/** The ids of the players the user blocks, as far as this phone knows. */
export function useBlockedIds(): readonly string[] {
  return blockedStore((s) => s.ids);
}

/** A block or a report went through. */
export function markBlocked(playerId: string): void {
  const { ids } = blockedStore.getState();
  if (!ids.includes(playerId)) blockedStore.setState({ ids: [...ids, playerId] });
}

/** An Unblock went through. */
export function markUnblocked(playerId: string): void {
  const { ids } = blockedStore.getState();
  blockedStore.setState({ ids: ids.filter((id) => id !== playerId) });
}

/** The server's whole list (Settings → Blocked players loaded it). */
export function setBlockedList(playerIds: readonly string[]): void {
  blockedStore.setState({ ids: [...playerIds], asked: true });
}

/**
 * Asks the server once per app run which players the user blocks. Call it
 * only on a screen that already talks to the server for a signed-in user.
 */
export function useKnownBlocks(safety: Safety | undefined): void {
  useEffect(() => {
    if (safety === undefined || blockedStore.getState().asked) return;
    blockedStore.setState({ asked: true });
    safety.listBlocked().then(
      (players) => {
        // Keep what the user did while the list was on its way.
        const { ids } = blockedStore.getState();
        const listed = players.map((p) => p.playerId);
        blockedStore.setState({ ids: [...new Set([...listed, ...ids])] });
      },
      () => {
        // Ask again on the next screen.
        blockedStore.setState({ asked: false });
      },
    );
  }, [safety]);
}

/** Tests: one test file is one app run, so each test starts knowing no block. */
export function resetBlockedForTest(): void {
  blockedStore.setState({ ids: [], asked: false });
}
