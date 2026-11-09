/**
 * Settings → Blocked players (#435): the players you blocked or reported
 * (`Safety.listBlocked`, newest first), each with Unblock.
 *
 * - The screen asks who is signed in (`auth.ready()`) and makes no
 *   account: a phone with no session reads that it is not signed in.
 * - This is the one place that shows a blocked player's name: the server
 *   hides it everywhere else.
 * - Unblock takes the row away and says so to screen readers. A failed
 *   Unblock keeps the row and says that it did not work.
 * - Focus moves to the title. Large fonts scroll: no text has a line limit.
 *
 * Navigation stays in the route (`app/blocked.tsx`).
 */
import type { AuthProvider, BlockedPlayer, Safety } from '@tavli/contracts';
import { useLocales } from 'expo-localization';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { dateLocale, formatDate } from '@/features/history/format';
import { playerNameText } from '@/features/online/playerName';

export interface BlockedPlayersScreenProps {
  auth: AuthProvider;
  safety: Safety;
  onBack: () => void;
}

/** Names each Unblock for this app run, so each one is read once (`useAnnouncement`). */
let unblockCount = 0;

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signedOut' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly players: readonly BlockedPlayer[] };

export function BlockedPlayersScreen({ auth, safety, onBack }: BlockedPlayersScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const titleRef = useFocusOnShow();
  const [state, setState] = useState<State>({ kind: 'loading' });
  // The player whose Unblock is on its way, and the last Unblock that failed.
  const [busy, setBusy] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [unblocked, setUnblocked] = useState<{ name: string; n: number } | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The state starts as `loading`; Try again sets it before it fetches.
  const fetchList = useCallback(() => {
    auth
      .ready()
      .then(async (user): Promise<State> => {
        if (user === null) return { kind: 'signedOut' };
        return { kind: 'ready', players: await safety.listBlocked() };
      })
      .then(
        (next) => {
          if (live.current) setState(next);
        },
        () => {
          if (live.current) setState({ kind: 'failed' });
        },
      );
  }, [auth, safety]);

  useEffect(fetchList, [fetchList]);

  const retry = () => {
    setState({ kind: 'loading' });
    fetchList();
  };

  const nameOf = (player: BlockedPlayer) =>
    playerNameText(player.name, t) ?? t('safety.list.unnamed');

  // Each Unblock is read once, also the same name twice.
  useAnnouncement(
    unblocked === null ? null : t('safety.list.unblocked', { name: unblocked.name }),
    unblocked === null ? undefined : `unblocked:${unblocked.n}`,
  );

  const unblock = (player: BlockedPlayer) => {
    if (busy !== null) return;
    setBusy(player.playerId);
    setFailedId(null);
    safety.unblock(player.playerId).then(
      () => {
        if (!live.current) return;
        setBusy(null);
        setState((s) =>
          s.kind === 'ready'
            ? { kind: 'ready', players: s.players.filter((p) => p.playerId !== player.playerId) }
            : s,
        );
        unblockCount += 1;
        setUnblocked({ name: nameOf(player), n: unblockCount });
      },
      () => {
        if (!live.current) return;
        setBusy(null);
        setFailedId(player.playerId);
      },
    );
  };

  return (
    <Screen testID="blocked-screen">
      <ScreenHeader
        title={t('safety.list.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="blocked-back"
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {state.kind === 'loading' ? (
          <>
            <ActivityIndicator />
            <Text style={styles.line}>{t('safety.list.loading')}</Text>
          </>
        ) : state.kind === 'signedOut' ? (
          <Text testID="blocked-signed-out" style={styles.line}>
            {t('safety.list.signedOut')}
          </Text>
        ) : state.kind === 'failed' ? (
          <>
            <Text testID="blocked-failed" style={styles.line}>
              {t('safety.list.failed')}
            </Text>
            <ActionButton
              testID="blocked-retry"
              kind="secondary"
              label={t('safety.list.retry')}
              onPress={retry}
            />
          </>
        ) : (
          <>
            <Text style={styles.line}>{t('safety.list.intro')}</Text>
            {state.players.length === 0 ? (
              <Text testID="blocked-empty" style={styles.line}>
                {t('safety.list.empty')}
              </Text>
            ) : (
              <SectionCard testID="blocked-list">
                {state.players.map((player) => {
                  const name = nameOf(player);
                  return (
                    <BlockedRow
                      key={player.playerId}
                      testID={`blocked-${player.playerId}`}
                      name={name}
                      since={t('safety.list.since', {
                        date: formatDate(player.blockedAt, locale),
                      })}
                      unblockLabel={t('safety.list.unblockLabel', { name })}
                      busy={busy === player.playerId}
                      onUnblock={() => unblock(player)}
                    />
                  );
                })}
              </SectionCard>
            )}
            {failedId !== null ? (
              <Text testID="blocked-unblock-failed" style={styles.line}>
                {t('safety.list.unblockFailed')}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

interface BlockedRowProps {
  testID: string;
  name: string;
  since: string;
  unblockLabel: string;
  busy: boolean;
  onUnblock: () => void;
}

function BlockedRow({ testID, name, since, unblockLabel, busy, onUnblock }: BlockedRowProps) {
  const { t } = useTranslation();
  return (
    <SectionRow
      testID={testID}
      icon="userX"
      label={name}
      hint={since}
      right={
        <ActionButton
          testID={`${testID}-unblock`}
          kind="secondary"
          compact
          disabled={busy}
          label={t('safety.list.unblock')}
          accessibilityLabel={unblockLabel}
          onPress={onUnblock}
        />
      }
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.lg,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
}));
