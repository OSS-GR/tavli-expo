import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { EmptyMedallion } from '@/components/EmptyMedallion';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { CardFrame, RowDivider } from '@/components/SectionCard';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { whatsNewSeen } from '@/features/whats-new/seen';

import { useBoardStep } from './boardStepStore';
import { WelcomeTop } from './WelcomeTop';

export interface WelcomeConsentScreenProps {
  onBack: () => void;
  /** After the answer is saved: the route opens the board step when it is due (#350). */
  onAnswered?: () => void;
}

/**
 * First launch, step 2 (Figma frame 12): ask before any usage data is sent
 * (GDPR, #61). Two rows say what we collect and what we never collect.
 * "Allow" and "Don't allow" look the same: refusing is as easy as
 * accepting, and no brass nudges the choice. "Don't allow" stops usage data
 * and crash reports (the one switch, `features/privacy`). Closing the app
 * without an answer sends no usage data, only anonymous crash reports, and
 * this screen shows again on the next launch. The first answer makes the
 * board step due (#350), so the route opens it next. Without a board step,
 * the answer itself leaves this screen: the root layout's guard opens Home.
 */
export function WelcomeConsentScreen({ onBack, onAnswered }: WelcomeConsentScreenProps) {
  const { t } = useTranslation();
  const setConsent = useConsent((s) => s.setConsent);
  const beginBoardStep = useBoardStep((s) => s.begin);
  // A player who passed the board step before (a new consent text asks
  // again) has two steps; a new player three.
  const total = useBoardStep((s) => s.status) === 'done' ? 2 : 3;

  const answer = (granted: boolean) => {
    // Before the answer: the guard must never see the consent answered
    // while the board step is not due yet, or it opens Home at once.
    beginBoardStep();
    // A new player has seen every release of What's new (#471).
    whatsNewSeen.begin();
    setConsent(granted);
    onAnswered?.();
  };

  return (
    <Screen testID="welcome-consent">
      <WelcomeTop step={2} total={total} onBack={onBack} backTestID="welcome-consent-back" />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <EmptyMedallion icon="chart" size="large" />
        <View style={styles.heading}>
          <Text style={styles.title} accessibilityRole="header">
            {t('welcome.privacy.title')}
          </Text>
          <Text style={styles.intro}>{t('welcome.privacy.intro')}</Text>
        </View>
        <CardFrame testID="welcome-consent-data">
          <DataRow
            icon="check"
            title={t('welcome.privacy.collect.title')}
            body={t('welcome.privacy.collect.body')}
          />
          <RowDivider />
          <DataRow
            icon="x"
            never
            title={t('welcome.privacy.never.title')}
            body={t('welcome.privacy.never.body')}
          />
        </CardFrame>
        <View style={styles.policy}>
          <ActionButton
            testID="welcome-consent-policy"
            kind="text"
            size="small"
            icon="shield"
            label={t('welcome.privacy.policy')}
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}
          />
        </View>
      </ScrollView>

      {/* Same kind for both: no nudge. */}
      <View style={styles.buttons}>
        <ActionButton
          testID="welcome-consent-allow"
          kind="secondary"
          label={t('welcome.privacy.allow')}
          onPress={() => answer(true)}
        />
        <ActionButton
          testID="welcome-consent-deny"
          kind="secondary"
          label={t('welcome.privacy.deny')}
          onPress={() => answer(false)}
        />
        <Text style={styles.note}>{t('welcome.privacy.denyNote')}</Text>
      </View>
    </Screen>
  );
}

interface DataRowProps {
  icon: IconName;
  title: string;
  body: string;
  /** What we never collect: a coral cross in place of the brass check. */
  never?: boolean;
}

/** One row of the data card. Screen readers read it as one item. */
function DataRow({ icon, title, body, never = false }: DataRowProps) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={22} color={never ? theme.colors.problem : theme.colors.accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
    </View>
  );
}

const ROW_ICON = 30;

const styles = StyleSheet.create((theme, rt) => ({
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: 20,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.lg,
  },
  heading: {
    gap: 6,
  },
  title: {
    ...theme.type.title1,
    color: theme.colors.text,
    textAlign: 'center',
  },
  intro: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingHorizontal: theme.space.lg,
  },
  row: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 14,
  },
  rowIcon: {
    width: ROW_ICON,
    height: ROW_ICON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    ...theme.type.headline,
    color: theme.colors.text,
  },
  rowBody: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  // A real button, centered under the card.
  policy: {
    alignItems: 'center',
  },
  buttons: {
    gap: 10,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.sm,
  },
  note: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingTop: theme.space.xs,
  },
}));
