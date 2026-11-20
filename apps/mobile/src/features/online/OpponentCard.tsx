/**
 * The other player's card in an online match (#651, Figma frame 37
 * "Opponent card"). A tap on their name in the player strip, or the game
 * menu's "Opponent's profile", opens it in the raised sheet.
 *
 * - The head: their checker avatar, the name and one line ("Your opponent
 *   in this match", "Friends" or "Guest account").
 * - Three numbers: the rating, the place on the global board ("—" off the
 *   board) and the rated matches. The rating always shows, also with "Show
 *   me" off (owner, 2026-11-20); only the place needs the board.
 * - The friend part: Add as friend, then "Friend request sent" with Cancel
 *   request; Accept request for a request to you; the record for friends.
 *   A guest gets two plain lines and no button.
 * - Report or block at the end, when the screen has `safety`.
 *
 * A failed call shows `ProblemCard` in place of the card (iOS shows no
 * second Modal). One call at a time; the sheet stays open while it runs
 * (`onHold`). Nothing here goes to analytics or the logs.
 */
import type { Friends, PlayerCard } from '@tavli/contracts';
import { fonts } from '@tavli/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { ProblemCard } from '@/components/Problem';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { friendsProblem } from '@/features/friends/friendsData';

import type { PlayerCardState } from './playerCard';

export interface OpponentCardProps {
  /** Their id: the avatar's wood and the friend calls. */
  playerId: string;
  /** Their name as the seat shows it ("Bob_Plays", "Guest 4821", "Opponent"). */
  name: string;
  card: PlayerCardState;
  friends: Friends;
  /** Report or block (#435). Left out: no such button. */
  onReportOrBlock?: () => void;
  onClose: () => void;
  /** True while a call runs: the sheet must not close then. */
  onHold?: (held: boolean) => void;
}

export function OpponentCard({
  playerId,
  name,
  card,
  friends,
  onReportOrBlock,
  onClose,
  onHold,
}: OpponentCardProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const titleRef = useFocusOnShow();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = <T,>(call: () => Promise<T>, after: (card: PlayerCard, answer: T) => PlayerCard) => {
    if (busy) return;
    setBusy(true);
    onHold?.(true);
    call().then(
      (answer) => {
        card.update((c) => after(c, answer));
        setBusy(false);
        onHold?.(false);
      },
      (error: unknown) => {
        const key = friendsProblem(error);
        setProblem(key === 'notSaved' ? t('online.card.youGuest') : t(`friends.problem.${key}`));
        setBusy(false);
        onHold?.(false);
        // What changed on the server (a request from them) shows after OK.
        card.reload();
      },
    );
  };

  if (problem !== null) {
    return (
      <ProblemCard
        testID="opponent-card-problem"
        problem={{ title: t('online.card.problemTitle'), text: problem }}
        okLabel={t('online.card.ok')}
        onOk={() => setProblem(null)}
      />
    );
  }

  const { load } = card;
  const head = (subtitle: string | null) => (
    <View style={styles.head}>
      <CheckerAvatar playerKey={playerId} name={name} size={50} />
      <View style={styles.headTexts}>
        <Text ref={titleRef} style={styles.name} accessibilityRole="header">
          {name}
        </Text>
        {subtitle !== null ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
  const report =
    onReportOrBlock === undefined ? null : (
      <ActionButton
        testID="opponent-card-report"
        kind="text"
        label={t('safety.action')}
        onPress={onReportOrBlock}
        disabled={busy}
      />
    );

  if (load.kind !== 'ready') {
    return (
      <View testID="opponent-card" style={styles.card}>
        {head(null)}
        {load.kind === 'loading' ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.sub}>{t('online.card.loading')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.body}>{t('online.card.failed')}</Text>
            <ActionButton
              testID="opponent-card-retry"
              label={t('online.card.retry')}
              kind="secondary"
              onPress={card.reload}
            />
          </>
        )}
        {report}
      </View>
    );
  }

  const shown = load.card;
  const guest = shown.rating === null;
  const subtitle = guest
    ? t('online.card.guest')
    : shown.status === 'friends'
      ? t('online.card.friends')
      : t('online.card.here');
  const rankText = shown.rank === null ? '—' : `#${shown.rank}`;

  return (
    <View testID="opponent-card" style={styles.card}>
      {head(subtitle)}
      {guest ? (
        <View style={styles.guest}>
          <Text style={styles.body}>{t('online.card.guestRating')}</Text>
          <Text style={styles.body}>{t('online.card.guestFriends')}</Text>
        </View>
      ) : (
        <>
          <View
            testID="opponent-card-stats"
            style={styles.stats}
            accessible
            accessibilityLabel={t('online.card.statsLabel', {
              rating: shown.rating,
              rank:
                shown.rank === null
                  ? t('online.card.noRank')
                  : t('online.card.rankLabel', { rank: shown.rank }),
              matches: shown.matches,
            })}>
            <Stat value={String(shown.rating)} label={t('online.card.rating')} />
            <Stat value={rankText} label={t('online.card.rank')} />
            <Stat
              value={String(shown.matches)}
              label={t('online.card.matches', { count: shown.matches })}
            />
          </View>
          <FriendPart
            status={shown.status}
            record={shown.record}
            busy={busy}
            // The server answers the new status: a request from them makes friends.
            onAdd={() =>
              run(
                () => friends.sendRequest(playerId),
                (c, status) => ({
                  ...c,
                  status,
                  record: status === 'friends' ? (c.record ?? { wins: 0, losses: 0 }) : c.record,
                }),
              )
            }
            onCancel={() =>
              run(
                () => friends.cancelRequest(playerId),
                (c) => ({ ...c, status: 'none' }),
              )
            }
            onAccept={() =>
              run(
                () => friends.acceptRequest(playerId),
                (c) => ({ ...c, status: 'friends', record: c.record ?? { wins: 0, losses: 0 } }),
              )
            }
          />
        </>
      )}
      {report}
      <ActionButton
        testID="opponent-card-close"
        kind="secondary"
        label={t('game.menu.resume')}
        onPress={onClose}
        disabled={busy}
      />
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FriendPart({
  status,
  record,
  busy,
  onAdd,
  onCancel,
  onAccept,
}: {
  status: PlayerCard['status'];
  record: PlayerCard['record'];
  busy: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  switch (status) {
    case 'none':
      return (
        <ActionButton
          testID="opponent-card-add"
          icon="userPlus"
          label={t('online.card.add')}
          busy={busy}
          onPress={onAdd}
        />
      );
    case 'sent':
      return (
        <>
          <View testID="opponent-card-sent" style={styles.sent} accessible>
            <Text style={styles.sentText}>{`✓ ${t('online.card.sent')}`}</Text>
          </View>
          <ActionButton
            testID="opponent-card-cancel"
            kind="text"
            label={t('online.card.cancel')}
            busy={busy}
            onPress={onCancel}
          />
        </>
      );
    case 'received':
      return (
        <ActionButton
          testID="opponent-card-accept"
          icon="userPlus"
          label={t('online.card.accept')}
          busy={busy}
          onPress={onAccept}
        />
      );
    case 'friends': {
      const { wins, losses } = record ?? { wins: 0, losses: 0 };
      const total = wins + losses;
      const lead =
        wins > losses
          ? t('friends.page.lead')
          : wins < losses
            ? t('friends.page.behind')
            : t('friends.page.even');
      const together = t('online.card.together', { count: total });
      return (
        <View
          testID="opponent-card-record"
          style={styles.record}
          accessible
          accessibilityLabel={t('friends.page.recordLabel', {
            lead,
            wins,
            losses,
            matches: together,
          })}>
          <Text style={styles.recordScore}>
            {t('home.online.score', { me: wins, friend: losses })}
          </Text>
          <Text style={styles.sub}>{`${lead} · ${together}`}</Text>
        </View>
      );
    }
    case 'self':
      // Never for the other player.
      return null;
  }
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  headTexts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  name: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  sub: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingVertical: theme.space.md,
  },
  guest: {
    gap: theme.space.xs,
  },
  stats: {
    flexDirection: 'row',
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSunken,
    paddingVertical: theme.space.md,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: theme.space.xxs,
    paddingHorizontal: theme.space.xs,
  },
  statValue: {
    ...theme.type.title2,
    fontFamily: fonts.numerals,
    color: theme.colors.accentLight,
  },
  statLabel: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  sent: {
    minHeight: theme.touch.row,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    paddingHorizontal: theme.space.md,
  },
  sentText: {
    ...theme.type.bodyStrong,
    color: theme.colors.accentLight,
    textAlign: 'center',
  },
  record: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: theme.space.md,
  },
  recordScore: {
    ...theme.type.title2,
    fontFamily: fonts.numerals,
    color: theme.colors.accentLight,
  },
}));
