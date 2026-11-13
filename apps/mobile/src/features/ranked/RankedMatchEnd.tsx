/**
 * The end of a ranked match (#532, Figma 81:2): what it did to your
 * rating, and what next.
 *
 * - The rating change: your rating when the match was found
 *   (`rankedStartRating`, this app run only) and now (`ratings.mine()`).
 *   After an app restart only the new rating shows, and so does a match
 *   that left it the same (not rated: the daily cap of a pair, an account
 *   gone). A tap opens the Leaderboards.
 * - Play <name> again: only with a friend, through a friend invite. A
 *   ranked game starts only from the queue, so a new ranked match with
 *   the same player cannot be asked for.
 * - New player: Play ranked again, in the same game.
 * - Add friend: a friend request (`sendRequest`), when you are not
 *   friends yet. "Request sent" after it.
 *
 * Nothing here goes to analytics: no ids, names or ratings.
 */
import type { FriendStatus, Friends, PlayerName, Ratings } from '@tavli/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { playerNameText } from '@/features/online/playerName';

import { rankedStartRating } from './rankedStarts';

export interface RatingChange {
  /** Your rating when the match was found, or `null` after an app restart. */
  readonly before: number | null;
  readonly after: number;
}

export interface RankedEnd {
  /** `null` while it loads, or when it failed. */
  readonly rating: RatingChange | null;
  /** `null` while it loads, or with no friends port. */
  readonly friend: FriendStatus | null;
  readonly sending: boolean;
  readonly addFriend: () => void;
}

export interface RankedEndDeps {
  readonly ratings: Ratings | undefined;
  readonly friends: Friends | undefined;
  readonly gameId: string;
  readonly opponentId: string;
  /** Load only for a ranked match. */
  readonly enabled: boolean;
}

export function useRankedEnd({
  ratings,
  friends,
  gameId,
  opponentId,
  enabled,
}: RankedEndDeps): RankedEnd {
  const [rating, setRating] = useState<RatingChange | null>(null);
  const [friend, setFriend] = useState<FriendStatus | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!enabled || ratings === undefined) return;
    let live = true;
    ratings.mine().then(
      (mine) => {
        if (live) setRating({ before: rankedStartRating(gameId), after: mine.rating });
      },
      () => {
        // No rating row: the screen shows the match without it.
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, ratings, gameId]);

  useEffect(() => {
    if (!enabled || friends === undefined) return;
    let live = true;
    friends.recentPlayers().then(
      (players) => {
        if (!live) return;
        const row = players.find((p) => p.playerId === opponentId);
        setFriend(row?.status ?? null);
      },
      () => {
        // No Add friend: the friends screen still has them.
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, friends, opponentId]);

  const addFriend = () => {
    if (friends === undefined || sending) return;
    setSending(true);
    friends.sendRequest(opponentId).then(
      (status) => {
        setFriend(status);
        setSending(false);
      },
      () => {
        // A block or a deleted account: no button, no problem to show.
        setFriend(null);
        setSending(false);
      },
    );
  };

  return { rating, friend, sending, addFriend };
}

/** "Rating 1490 → 1502 · +12": under the games. */
export function RankedRatingChange({
  rating,
  onLeaderboards,
}: {
  rating: RatingChange;
  onLeaderboards: () => void;
}) {
  const { t } = useTranslation();
  const change =
    rating.before === null || rating.before === rating.after ? null : rating.after - rating.before;
  const sign = change === null ? '' : change > 0 ? '+' : '−';
  return (
    <SectionCard>
      <SectionRow
        testID="ranked-end-rating"
        icon="trophy"
        label={
          change === null || rating.before === null
            ? t('ranked.end.ratingNow', { after: rating.after })
            : t('ranked.end.rating', { before: rating.before, after: rating.after })
        }
        hint={t('ranked.end.ratingHint')}
        right={
          change === null ? undefined : (
            <Text testID="ranked-end-change" style={styles.change(change)}>
              {`${sign}${Math.abs(change)}`}
            </Text>
          )
        }
        onPress={onLeaderboards}
      />
    </SectionCard>
  );
}

export interface RankedEndActionsProps {
  opponentName: PlayerName | null;
  friend: FriendStatus | null;
  sending: boolean;
  onPlayAgain: () => void;
  onAddFriend: () => void;
  onNewPlayer: () => void;
}

/** The ranked buttons, above Home. */
export function RankedEndActions({
  opponentName,
  friend,
  sending,
  onPlayAgain,
  onAddFriend,
  onNewPlayer,
}: RankedEndActionsProps) {
  const { t } = useTranslation();
  const name = playerNameText(opponentName, t) ?? t('online.opponent');
  const friends = friend === 'friends';
  return (
    <>
      {friends ? (
        <ActionButton
          testID="ranked-end-play-again"
          label={t('ranked.end.playAgain', { name })}
          onPress={onPlayAgain}
        />
      ) : null}
      <ActionButton
        testID="ranked-end-new-player"
        label={t('ranked.end.newPlayer')}
        kind={friends ? 'secondary' : 'primary'}
        onPress={onNewPlayer}
      />
      {friend === 'none' || friend === 'received' ? (
        <ActionButton
          testID="ranked-end-add-friend"
          label={t('ranked.end.addFriend')}
          kind="secondary"
          icon="userPlus"
          busy={sending}
          onPress={onAddFriend}
        />
      ) : friend === 'sent' ? (
        <Text testID="ranked-end-request-sent" style={styles.note}>
          {t('ranked.end.requestSent', { name })}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  change: (change: number) => ({
    ...theme.type.headline,
    color: change > 0 ? theme.colors.turn : theme.colors.textDim,
  }),
  note: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
}));
