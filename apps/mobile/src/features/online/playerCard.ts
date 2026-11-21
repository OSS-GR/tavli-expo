/**
 * The other player's card in an online match (#651): one load per game
 * screen, through `Friends.playerCard`. The player strip shows the rating
 * from it, and the card sheet (`OpponentCard.tsx`) shows it whole.
 *
 * A failed load leaves `failed`: the strip keeps its plain line, and the
 * card offers Try again. Nothing here goes to analytics or the logs.
 */
import type { Friends, PlayerCard } from '@tavli/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

export type PlayerCardLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly card: PlayerCard };

export interface PlayerCardState {
  readonly load: PlayerCardLoad;
  /** Loads again; what shows stays until the answer comes. */
  readonly reload: () => void;
  /** Shows what a call just answered (a request sent, cancelled). */
  readonly update: (change: (card: PlayerCard) => PlayerCard) => void;
}

const FAILED: PlayerCardLoad = { kind: 'failed' };

/** The card of `playerId`, or a quiet `failed` with no `friends` or no id. */
export function usePlayerCard(
  friends: Friends | null,
  playerId: string | undefined,
): PlayerCardState {
  const [load, setLoad] = useState<PlayerCardLoad>({ kind: 'loading' });
  // An older answer never replaces a newer one.
  const asked = useRef(0);

  const fetchCard = useCallback(() => {
    asked.current += 1;
    const ask = asked.current;
    if (friends === null || playerId === undefined) return;
    friends.playerCard(playerId).then(
      (card) => {
        if (ask === asked.current) setLoad({ kind: 'ready', card });
      },
      () => {
        if (ask === asked.current) {
          setLoad((shown) => (shown.kind === 'ready' ? shown : { kind: 'failed' }));
        }
      },
    );
  }, [friends, playerId]);

  useEffect(() => {
    fetchCard();
    return () => {
      // A screen that goes away takes no late answer.
      asked.current += 1;
    };
  }, [fetchCard]);

  const update = useCallback((change: (card: PlayerCard) => PlayerCard) => {
    setLoad((shown) =>
      shown.kind === 'ready' ? { kind: 'ready', card: change(shown.card) } : shown,
    );
  }, []);

  const off = friends === null || playerId === undefined;
  return { load: off ? FAILED : load, reload: fetchCard, update };
}
