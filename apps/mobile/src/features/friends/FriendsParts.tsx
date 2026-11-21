/**
 * Parts the friends screens share (#406), and the leaderboards (#407): what shows before the list
 * (loading, not signed in, a guest, a failed load), and the problem line.
 */
import { useTranslation } from 'react-i18next';
import type { Usernames } from '@tavli/contracts';
import { ActivityIndicator, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CardFrame, RowDivider } from '@/components/SectionCard';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

import { AccountBenefits } from '@/features/online/AccountBenefits';
import { UsernameGate } from '@/features/online/UsernameGate';

import type { FriendsLoad, FriendsProblem } from './friendsData';

export interface NotReadyProps {
  state: Exclude<FriendsLoad<unknown>, { kind: 'ready' }>;
  onRetry: () => void;
  /** Opens Settings → Account, where a guest saves the account. */
  onAccount: () => void;
  testID: string;
  /** Whose texts to read: the friends screens' (default) or the leaderboards' (#407). */
  texts?: 'friends' | 'ratings';
  /** For the username gate (#599): it saves the pick. */
  usernames: Usernames;
}

/**
 * The screen before its data: loading, not signed in, a guest, a saved
 * account with no username (the gate, then `onRetry` loads the screen),
 * or a failed load.
 */
export function NotReady({
  state,
  onRetry,
  onAccount,
  testID,
  texts = 'friends',
  usernames,
}: NotReadyProps) {
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
    case 'username':
      return (
        <UsernameGate
          testID={`${testID}-username-gate`}
          usernames={usernames}
          feature={texts}
          mine={state.mine}
          onDone={onRetry}
        />
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

/**
 * Quiet placeholders shaped like the rows to come (#672), on a first visit
 * only: a screen seen before opens with its last data (`shownCache.ts`).
 * No motion, no "Loading…" line: screen readers hear one "Loading".
 */
function SkeletonRows({ rows, avatar }: { rows: number; avatar: boolean }) {
  return (
    <CardFrame>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i}>
          {i > 0 ? <RowDivider /> : null}
          <View style={skeleton.row}>
            {avatar ? <View style={skeleton.avatar} /> : null}
            <View style={skeleton.texts}>
              <View style={[skeleton.bar, skeleton.long]} />
              <View style={[skeleton.bar, skeleton.short]} />
            </View>
          </View>
        </View>
      ))}
    </CardFrame>
  );
}

/** The Friends list while its first load runs. */
export function ListSkeleton({ testID }: { testID: string }) {
  const { t } = useTranslation();
  return (
    <View
      testID={`${testID}-skeleton`}
      style={skeleton.block}
      accessible
      accessibilityLabel={t('friends.loading')}>
      <View style={skeleton.button} />
      <SkeletonRows rows={1} avatar={false} />
      <SkeletonRows rows={2} avatar />
    </View>
  );
}

/** The friend page's Rematch and Recent matches while the matches load. */
export function MatchesSkeleton() {
  const { t } = useTranslation();
  return (
    <View
      testID="friend-page-matches-skeleton"
      style={skeleton.block}
      accessible
      accessibilityLabel={t('friends.loading')}>
      <View style={skeleton.button} />
      <SkeletonRows rows={2} avatar={false} />
    </View>
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

const skeleton = StyleSheet.create((theme) => ({
  block: {
    gap: theme.space.md,
  },
  button: {
    height: theme.touch.button,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceSunken,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row + theme.space.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceSunken,
  },
  texts: {
    flex: 1,
    gap: theme.space.sm,
  },
  bar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceSunken,
  },
  long: {
    width: '60%',
  },
  short: {
    width: '35%',
  },
}));
