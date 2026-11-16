/**
 * What a saved account gives (#463), the same rows everywhere: Settings →
 * Account for a guest (behind "What a saved account gives", #519), and
 * the Friends screens for a guest. Only what is built: a username, a
 * record with each friend, friend invites with a notification, your games
 * on any phone, and a rating on the leaderboards (#407). No "coming soon".
 * The sign-in choices show only three short lines (`SIGN_IN_BENEFITS`).
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
  { id: 'ratings', icon: 'trophy' },
];

export type BenefitId = 'username' | 'record' | 'invites' | 'anyPhone' | 'ratings';

export interface AccountBenefitsProps {
  testID?: string;
}

export function AccountBenefits({ testID = 'account-benefits' }: AccountBenefitsProps) {
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
          <View
            key={id}
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
        );
      })}
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
}));
