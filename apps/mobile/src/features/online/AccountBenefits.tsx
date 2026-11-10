/**
 * What a saved account gives (#463), the same rows everywhere: the sign-in
 * choices, Settings → Account for a guest, and the Friends screens for a
 * guest. Only what is built: a username, a record with each friend,
 * friend invites with a notification, and your games on any phone. No
 * "coming soon".
 *
 * `sample` adds a made-up friend record (a name, a score and a small bar)
 * under the record row, marked "Example", so a player sees the Friends
 * record before they have friends. It is text only: nothing is loaded.
 *
 * Each row is one screen reader element (its title, then its line).
 */
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';

/** The benefit rows, in order. Each id names its text (`benefits.<id>`). */
export const BENEFITS: readonly { readonly id: BenefitId; readonly icon: IconName }[] = [
  { id: 'username', icon: 'user' },
  { id: 'record', icon: 'users' },
  { id: 'invites', icon: 'bell' },
  { id: 'anyPhone', icon: 'smartphone' },
];

export type BenefitId = 'username' | 'record' | 'invites' | 'anyPhone';

/** The made-up record of the sample: the name is in the strings. */
export const SAMPLE_RECORD = { wins: 5, losses: 3 } as const;

export interface AccountBenefitsProps {
  /** Show the sample friend record under the record row. */
  sample?: boolean;
  testID?: string;
}

export function AccountBenefits({
  sample = false,
  testID = 'account-benefits',
}: AccountBenefitsProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  return (
    <View testID={testID} style={styles.list}>
      <Text style={styles.heading} accessibilityRole="header">
        {t('benefits.title')}
      </Text>
      {BENEFITS.map(({ id, icon }) => {
        const title = t(`benefits.${id}.title`);
        const text = t(`benefits.${id}.text`);
        return (
          <View key={id} style={styles.block}>
            <View
              testID={`${testID}-${id}`}
              style={styles.row}
              accessible
              accessibilityLabel={`${title}. ${text}`}>
              <View style={styles.icon}>
                <Icon name={icon} color={theme.colors.accentLight} size={20} />
              </View>
              <View style={styles.words}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.text}>{text}</Text>
              </View>
            </View>
            {sample && id === 'record' ? <SampleRecord testID={`${testID}-sample`} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function SampleRecord({ testID }: { testID: string }) {
  const { t } = useTranslation();
  const { wins, losses } = SAMPLE_RECORD;
  const name = t('benefits.sample.name');
  return (
    <View
      testID={testID}
      style={styles.sample}
      accessible
      accessibilityLabel={t('benefits.sample.label', { name, wins, losses })}>
      <View style={styles.sampleHead}>
        <Text style={styles.tag}>{t('benefits.sample.tag')}</Text>
        <Text style={styles.sampleName}>{name}</Text>
        <Text style={styles.score}>{t('benefits.sample.score', { wins, losses })}</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.won, { flex: wins }]} />
        <View style={[styles.lost, { flex: losses }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space.md,
  },
  heading: {
    ...theme.type.section,
    color: theme.colors.textDim,
    textTransform: 'uppercase',
  },
  block: {
    gap: theme.space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentWash,
  },
  words: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  text: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  sample: {
    marginLeft: 36 + theme.space.md,
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sampleHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  tag: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  sampleName: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    flexGrow: 1,
  },
  score: {
    ...theme.type.bodyStrong,
    color: theme.colors.accentLight,
  },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: theme.radii.pill,
    overflow: 'hidden',
    gap: 2,
  },
  won: {
    backgroundColor: theme.colors.accent,
  },
  lost: {
    backgroundColor: theme.colors.border,
  },
}));
