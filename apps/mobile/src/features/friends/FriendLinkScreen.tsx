/**
 * A friend link (#406): what `tavlaki://add/<token>` (a shared link or a
 * scanned QR code) and a pasted link open. It shows whose link it is and
 * offers "Ask to be friends" (`requestByLink`).
 *
 * - The screen makes no account. With nobody signed in it says so. A
 *   guest sees whose link it is (`openFriendLink` answers a guest) and a
 *   button to save the account: friends need a saved account.
 * - A link that does not work (a wrong or reset token, a deleted
 *   account, or a block) reads the same.
 * - Focus moves to the title. Large fonts scroll.
 *
 * Navigation stays in the route (`app/add/[token].tsx`).
 */
import type { AuthProvider, FoundPlayer, FriendStatus, Friends } from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { AccountBenefits } from '@/features/online/AccountBenefits';
import { playerNameText } from '@/features/online/playerName';

import { friendsProblem, type FriendsProblem } from './friendsData';
import { friendsStyles as styles, useProblemText } from './FriendsParts';

export interface FriendLinkScreenProps {
  /** The token in capital letters, or `null` when the link holds no token. */
  token: string | null;
  auth: AuthProvider;
  friends: Friends;
  onBack: () => void;
  /** Opens the friends list. */
  onFriends: () => void;
  /** Opens Settings → Account (a guest saves the account there). */
  onAccount: () => void;
}

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signedOut' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'found'; readonly player: FoundPlayer; readonly guest: boolean };

export function FriendLinkScreen({
  token,
  auth,
  friends,
  onBack,
  onFriends,
  onAccount,
}: FriendLinkScreenProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const [state, setState] = useState<State>(
    token === null ? { kind: 'notFound' } : { kind: 'loading' },
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FriendsProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (token === null) return;
    auth
      .ready()
      .then(async (user): Promise<State> => {
        if (user === null) return { kind: 'signedOut' };
        const player = await friends.openFriendLink(token);
        return player === null
          ? { kind: 'notFound' }
          : { kind: 'found', player, guest: user.isGuest };
      })
      .then(
        (next) => {
          if (live.current) setState(next);
        },
        (error: unknown) => {
          if (!live.current) return;
          setState(
            friendsProblem(error) === 'signedOut' ? { kind: 'signedOut' } : { kind: 'failed' },
          );
        },
      );
  }, [auth, friends, token, attempt]);

  const problemText = useProblemText(problem);
  // Read each time it shows (iOS VoiceOver does not read `accessibilityRole="alert"`).
  useAnnouncement(problemText);

  const ask = () => {
    if (busy || token === null || state.kind !== 'found') return;
    setBusy(true);
    setProblem(null);
    friends.requestByLink(token).then(
      (status: FriendStatus) => {
        if (!live.current) return;
        setBusy(false);
        setState({ ...state, player: { ...state.player, status } });
      },
      (error: unknown) => {
        if (!live.current) return;
        setBusy(false);
        const next = friendsProblem(error);
        if (next === 'notFound') setState({ kind: 'notFound' });
        else setProblem(next);
      },
    );
  };

  const name =
    state.kind === 'found' ? (playerNameText(state.player.name, t) ?? t('friends.unnamed')) : '';

  return (
    <Screen testID="friend-link-screen">
      <ScreenHeader
        title={t('friends.link.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="friend-link-back"
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {state.kind === 'loading' ? (
          <>
            <ActivityIndicator />
            <Text style={styles.line}>{t('friends.loading')}</Text>
          </>
        ) : state.kind === 'signedOut' ? (
          <>
            <Text testID="friend-link-signed-out" style={styles.line}>
              {t('friends.link.signedOut')}
            </Text>
            <ActionButton
              testID="friend-link-account"
              kind="secondary"
              label={t('friends.openAccount')}
              onPress={onAccount}
            />
          </>
        ) : state.kind === 'failed' ? (
          <>
            <Text testID="friend-link-failed" style={styles.line}>
              {t('friends.failed')}
            </Text>
            <ActionButton
              testID="friend-link-retry"
              kind="secondary"
              label={t('friends.retry')}
              onPress={() => {
                setState({ kind: 'loading' });
                setAttempt((n) => n + 1);
              }}
            />
          </>
        ) : state.kind === 'notFound' ? (
          <Text testID="friend-link-not-found" style={styles.line}>
            {t('friends.link.notFound')}
          </Text>
        ) : (
          <SectionCard padded testID="friend-link-found">
            <Text style={styles.name}>{t('friends.link.whose', { name })}</Text>
            {state.player.status === 'self' ? (
              <Text testID="friend-link-self" style={styles.line}>
                {t('friends.link.self')}
              </Text>
            ) : state.guest ? (
              <>
                <Text testID="friend-link-guest" style={styles.line}>
                  {t('friends.guest')}
                </Text>
                <AccountBenefits testID="friend-link-benefits" />
                <ActionButton
                  testID="friend-link-account"
                  label={t('friends.saveAccount')}
                  onPress={onAccount}
                />
              </>
            ) : state.player.status === 'none' || state.player.status === 'received' ? (
              <>
                {state.player.status === 'received' ? (
                  <Text style={styles.line}>{t('friends.status.received')}</Text>
                ) : null}
                <ActionButton
                  testID="friend-link-ask"
                  disabled={busy}
                  label={
                    state.player.status === 'received'
                      ? t('friends.link.accept')
                      : t('friends.link.ask')
                  }
                  onPress={ask}
                />
              </>
            ) : (
              <>
                <Text testID="friend-link-status" style={styles.line}>
                  {state.player.status === 'friends'
                    ? t('friends.link.friends', { name })
                    : t(`friends.status.${state.player.status}`)}
                </Text>
                <ActionButton
                  testID="friend-link-friends"
                  kind="secondary"
                  label={t('friends.link.openFriends')}
                  onPress={onFriends}
                />
              </>
            )}
            {problemText !== null ? (
              <Text testID="friend-link-problem" style={styles.line}>
                {problemText}
              </Text>
            ) : null}
          </SectionCard>
        )}
      </ScrollView>
    </Screen>
  );
}
