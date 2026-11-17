/**
 * The username gate (#599): Friends, Play ranked and Leaderboards open
 * only for a saved account with a username (owner, 2026-11-17). A saved
 * account with none sees a short note and the username step
 * (`UsernameForm`, with the terms of use and the age box) in place of the
 * screen. After a pick the screen opens (`onDone`).
 *
 * - `mine` is the state the screen already has (`Usernames.mine`). With
 *   none (the server said `USERNAME_NEEDED`), the gate asks for it.
 * - A failed load says so, with Try again.
 */
import type { MyUsername, Usernames } from '@tavli/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { SectionCard } from '@/components/SectionCard';

import { UsernameForm } from './UsernameForm';

/** Which screen the gate stands in front of: it names what the username is for. */
export type UsernameGateFeature = 'friends' | 'ranked' | 'ratings';

export interface UsernameGateProps {
  usernames: Usernames;
  feature: UsernameGateFeature;
  /** What the screen read already. `null`: the gate reads it. */
  mine: MyUsername | null;
  /** After the pick: the new state. */
  onDone: (mine: MyUsername) => void;
  testID: string;
}

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly mine: MyUsername };

export function UsernameGate({ usernames, feature, mine, onDone, testID }: UsernameGateProps) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<Load>(
    mine === null ? { kind: 'loading' } : { kind: 'ready', mine },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (mine !== null) return;
    let live = true;
    usernames.mine().then(
      (next) => {
        if (live) setLoad({ kind: 'ready', mine: next });
      },
      () => {
        if (live) setLoad({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [usernames, mine, attempt]);

  if (load.kind === 'loading') {
    return (
      <>
        <ActivityIndicator />
        <Text style={styles.line}>{t('username.loading')}</Text>
      </>
    );
  }
  if (load.kind === 'failed') {
    return (
      <>
        <Text testID={`${testID}-failed`} style={styles.line}>
          {t('username.error.failed')}
        </Text>
        <ActionButton
          testID={`${testID}-retry`}
          kind="secondary"
          label={t('friends.retry')}
          onPress={() => {
            setLoad({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
      </>
    );
  }
  return (
    <SectionCard padded testID={testID}>
      <UsernameForm
        usernames={usernames}
        mine={load.mine}
        title={t('usernameGate.title')}
        body={t(`usernameGate.${feature}`)}
        onDone={onDone}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
}));
