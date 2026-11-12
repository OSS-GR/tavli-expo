/**
 * Parts the friends screens share (#406), and the leaderboards (#407): what shows before the list
 * (loading, not signed in, a guest, a failed load), and the problem line.
 */
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

import { AccountBenefits } from '@/features/online/AccountBenefits';

import type { FriendsLoad, FriendsProblem } from './friendsData';

export interface NotReadyProps {
  state: Exclude<FriendsLoad<unknown>, { kind: 'ready' }>;
  onRetry: () => void;
  /** Opens Settings → Account, where a guest saves the account. */
  onAccount: () => void;
  testID: string;
  /** Whose texts to read: the friends screens' (default) or the leaderboards' (#407). */
  texts?: 'friends' | 'ratings';
}

/** The screen before its data: loading, not signed in, a guest, or a failed load. */
export function NotReady({ state, onRetry, onAccount, testID, texts = 'friends' }: NotReadyProps) {
  const { t } = useTranslation();
  switch (state.kind) {
    case 'loading':
      return (
        <>
          <ActivityIndicator />
          <Text style={styles.line}>{t('friends.loading')}</Text>
        </>
      );
    case 'signedOut':
      return (
        <>
          <Text testID={`${testID}-signed-out`} style={styles.line}>
            {t(`${texts}.signedOut`)}
          </Text>
          <ActionButton
            testID={`${testID}-account`}
            kind="secondary"
            label={t('friends.openAccount')}
            onPress={onAccount}
          />
        </>
      );
    case 'guest':
      return (
        <>
          <Text testID={`${testID}-guest`} style={styles.line}>
            {t(`${texts}.guest`)}
          </Text>
          <AccountBenefits testID={`${testID}-benefits`} />
          <ActionButton
            testID={`${testID}-account`}
            label={t('friends.saveAccount')}
            onPress={onAccount}
          />
        </>
      );
    case 'failed':
      return (
        <>
          <Text testID={`${testID}-failed`} style={styles.line}>
            {t(`${texts}.failed`)}
          </Text>
          <ActionButton
            testID={`${testID}-retry`}
            kind="secondary"
            label={t('friends.retry')}
            onPress={onRetry}
          />
        </>
      );
  }
}

/** A quiet reload failed: what shows may be old. Try again loads quietly. */
export function RefreshFailed({ onRetry, testID }: { onRetry: () => void; testID: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Text testID={`${testID}-refresh-failed`} style={styles.line}>
        {t('friends.refreshFailed')}
      </Text>
      <ActionButton
        testID={`${testID}-refresh-retry`}
        kind="secondary"
        compact
        label={t('friends.retry')}
        onPress={onRetry}
      />
    </>
  );
}

/** A quiet note at the end of a screen, with a small icon (#503). */
export function Footnote({ icon, text }: { icon: IconName; text: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.footnote}>
      <Icon name={icon} size={14} color={theme.colors.textDim} />
      <Text style={styles.footnoteText}>{text}</Text>
    </View>
  );
}

/** The text of a problem. */
export function useProblemText(problem: FriendsProblem | null): string | null {
  const { t } = useTranslation();
  return problem === null ? null : t(`friends.problem.${problem}`);
}

export const friendsStyles = StyleSheet.create((theme) => ({
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
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  row: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  name: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  input: {
    ...theme.type.body,
    minHeight: theme.touch.button,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundDeep,
    color: theme.colors.text,
  },
  padded: {
    gap: theme.space.md,
  },
  footnote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xs,
  },
  footnoteText: {
    ...theme.type.footnote,
    flex: 1,
    color: theme.colors.textDim,
  },
  center: {
    alignItems: 'center',
    gap: theme.space.sm,
  },
}));

const styles = friendsStyles;
