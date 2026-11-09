/**
 * The players this phone knows the user blocks, for this app run (#441
 * review). It saves nothing.
 *
 * A screen that offers Report or block reads it: a blocked player gets
 * Report only, so the dialog never offers Block again. Each signed-in
 * player (`owner`, the user id; `onlinePlayerId` in dev games) has a list
 * of their own, so another account on the phone, or a dev game, never
 * sees it. The ids come from the server once per app run and owner
 * (`useKnownBlocks`, `Safety.listBlocked`) and from what the user does
 * here: a block or a report adds the player, an Unblock in Settings takes
 * them out. A list that does not load is no problem: the dialog then
 * offers Block, and the server takes a second block of the same player.
 */
import { isSafetyErrorData, type Safety } from '@tavli/contracts';
import { useEffect } from 'react';
import { create } from 'zustand';

/** How long a failed list waits before a screen asks again. */
export const BLOCKS_RETRY_MS = 60_000;

interface OwnerBlocks {
  readonly ids: readonly string[];
  /**
   * `listed`: the server's list is in. `asking`: it is on its way, with
   * the changes made here since it left. `failed`: asked at `at`, no list.
   */
  readonly list:
    | { readonly kind: 'none' }
    | { readonly kind: 'listed' }
    | {
        readonly kind: 'asking';
        readonly added: readonly string[];
        readonly removed: readonly string[];
      }
    | { readonly kind: 'failed'; readonly at: number };
}

const NONE: OwnerBlocks = { ids: [], list: { kind: 'none' } };

const blockedStore = create<{ readonly owners: Readonly<Record<string, OwnerBlocks>> }>(() => ({
  owners: {},
}));

function entry(owner: string): OwnerBlocks {
  return blockedStore.getState().owners[owner] ?? NONE;
}

function setEntry(owner: string, next: OwnerBlocks): void {
  blockedStore.setState((s) => ({ owners: { ...s.owners, [owner]: next } }));
}

/** True when `owner` blocks this player, as far as this phone knows. */
export function useIsBlocked(owner: string | null, playerId: string | null): boolean {
  return blockedStore(
    (s) =>
      owner !== null && playerId !== null && (s.owners[owner]?.ids.includes(playerId) ?? false),
  );
}

/** The ids of the players `owner` blocks, as far as this phone knows. */
export function useBlockedIds(owner: string | null): readonly string[] {
  return blockedStore((s) => (owner === null ? NONE.ids : (s.owners[owner]?.ids ?? NONE.ids)));
}

/** A block or a report of `owner` went through. */
export function markBlocked(owner: string, playerId: string): void {
  const { ids, list } = entry(owner);
  setEntry(owner, {
    ids: ids.includes(playerId) ? ids : [...ids, playerId],
    list:
      list.kind === 'asking'
        ? {
            kind: 'asking',
            added: [...list.added, playerId],
            removed: list.removed.filter((id) => id !== playerId),
          }
        : list,
  });
}

/** An Unblock of `owner` went through. */
export function markUnblocked(owner: string, playerId: string): void {
  const { ids, list } = entry(owner);
  setEntry(owner, {
    ids: ids.filter((id) => id !== playerId),
    list:
      list.kind === 'asking'
        ? {
            kind: 'asking',
            added: list.added.filter((id) => id !== playerId),
            removed: [...list.removed, playerId],
          }
        : list,
  });
}

/** The server's whole list for `owner` (Settings → Blocked players loaded it). */
export function setBlockedList(owner: string, playerIds: readonly string[]): void {
  setEntry(owner, { ids: [...playerIds], list: { kind: 'listed' } });
}

/**
 * Asks the server once per app run which players `owner` blocks. Call it
 * only on a screen that already talks to the server for that signed-in
 * user. A failed list is asked again by a later screen, after
 * `BLOCKS_RETRY_MS`; a `NOT_SIGNED_IN` one is not.
 */
export function useKnownBlocks(safety: Safety | undefined, owner: string | null): void {
  useEffect(() => {
    if (safety === undefined || owner === null) return;
    const { list } = entry(owner);
    if (list.kind === 'listed' || list.kind === 'asking') return;
    if (list.kind === 'failed' && Date.now() - list.at < BLOCKS_RETRY_MS) return;
    setEntry(owner, { ids: entry(owner).ids, list: { kind: 'asking', added: [], removed: [] } });
    safety.listBlocked().then(
      (players) => {
        const now = entry(owner);
        if (now.list.kind !== 'asking') return;
        // Keep what the user did while the list was on its way.
        const { added, removed } = now.list;
        const listed = players.map((p) => p.playerId).filter((id) => !removed.includes(id));
        setEntry(owner, { ids: [...new Set([...listed, ...added])], list: { kind: 'listed' } });
      },
      (error: unknown) => {
        const now = entry(owner);
        if (now.list.kind !== 'asking') return;
        // No session: asking again would fail the same way.
        const at =
          isSafetyErrorData(error) && error.code === 'NOT_SIGNED_IN'
            ? Number.POSITIVE_INFINITY
            : Date.now();
        setEntry(owner, { ids: now.ids, list: { kind: 'failed', at } });
      },
    );
  }, [safety, owner]);
}

/** Tests: one test file is one app run, so each test starts knowing no block. */
export function resetBlockedForTest(): void {
  blockedStore.setState({ owners: {} });
}
