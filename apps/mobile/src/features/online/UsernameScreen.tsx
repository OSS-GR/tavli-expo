/**
 * Settings → Username (#405): pick or change the username of a saved
 * account (`UsernameForm`). The first pick is free; after that one
 * change in 30 days.
 *
 * - The screen asks the server who is signed in (`auth.ready()`) and then
 *   for the username (`Usernames.mine`). It makes no account: a guest or a
 *   phone with no session reads that a username needs a saved account.
 * - After a save the screen says so and keeps the form, now with the new
 *   name and the date of the next change.
 * - Focus moves to the title. Large fonts scroll: no text has a line limit.
 *
 * Navigation stays in the route (`app/username.tsx`).
 */
import type { AuthProvider, MyUsername, Usernames } from '@tavli/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { UsernameForm } from './UsernameForm';

export interface UsernameScreenProps {
  auth: AuthProvider;
  usernames: Usernames;
  onBack: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'failed' }
  | { kind: 'ready'; mine: MyUsername; saved: boolean };

export function UsernameScreen({ auth, usernames, onBack }: UsernameScreenProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    auth
      .ready()
      .then(async (user) => {
        if (user === null || user.isGuest) return { kind: 'guest' } as const;
        const mine = await usernames.mine();
        return mine.saved
          ? ({ kind: 'ready', mine, saved: false } as const)
          : { kind: 'guest' as const };
      })
      .then(
        (next) => {
          if (live) setState(next);
        },
        () => {
          if (live) setState({ kind: 'failed' });
        },
      );
    return () => {
      live = false;
    };
  }, [auth, usernames]);

  useAnnouncement(state.kind === 'ready' && state.saved ? t('username.saved') : null);

  return (
    <Screen testID="username-screen">
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title={t('username.changeTitle')}
          titleRef={titleRef}
          onBack={onBack}
          backLabel={t('common.back')}
          testID="username-back"
        />
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {state.kind === 'loading' ? (
            <>
              <ActivityIndicator />
              <Text style={styles.line}>{t('username.loading')}</Text>
            </>
          ) : state.kind === 'guest' ? (
            <Text testID="username-guest-only" style={styles.line}>
              {t('username.guestOnly')}
            </Text>
          ) : state.kind === 'failed' ? (
            <Text testID="username-load-failed" style={styles.line}>
              {t('username.error.failed')}
            </Text>
          ) : (
            <SectionCard padded>
              <UsernameForm
                // A new form after a save: the box starts from the new name.
                key={state.mine.name ?? ''}
                usernames={usernames}
                mine={state.mine}
                onDone={(mine) => setState({ kind: 'ready', mine, saved: true })}
              />
              {state.saved ? (
                <Text testID="username-saved" style={styles.line}>
                  {t('username.saved')}
                </Text>
              ) : null}
            </SectionCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
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
