/**
 * Support Tavlaki (#590, Figma frame 25 "Support Tavlaki: Ko-fi link, no
 * reward"). A card with the coffee medallion, a short text (free, no ads,
 * made by one person) and one main button,
 * **Support on Ko-fi**, that opens our page tavlaki.com/support (Greek:
 * /el/support) in the phone's browser, never in a web view. That page has
 * the Ko-fi button. Under the card, "Other ways to help": Rate Tavlaki and
 * Tell a friend (the share sheet with the homepage link).
 *
 * Supporting gives nothing in the app: no price, no pack, no mark.
 * Navigation stays in the route (`app/support.tsx`).
 */
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CardFrame, SectionCard, SectionRow } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { appBuild } from '@/services';

import { rateAppUrl, shareAppUrl, supportPageUrl } from './links';
import { sendSupportLinkOpened } from './supportAnalytics';

/** The coffee medallion, in points. */
const MEDALLION = 56;

export interface SupportScreenProps {
  onBack: () => void;
}

export function SupportScreen({ onBack }: SupportScreenProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useUnistyles();
  const titleRef = useFocusOnShow();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const buttonLabel = t('support.button');

  return (
    <Screen testID="support-screen">
      <ScreenHeader
        title={t('support.title')}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="support-back"
        titleRef={titleRef}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never">
        <CardFrame testID="support-card">
          <View style={styles.card}>
            <View
              style={styles.medallion}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <Icon name="coffee" size={26} strokeWidth={1.6} color={theme.colors.accent} />
            </View>
            <Text style={styles.lead}>{t('support.lead')}</Text>
            <Text style={styles.body}>{t('support.body')}</Text>
            <View style={styles.button}>
              <ActionButton
                testID="support-kofi-button"
                label={buttonLabel}
                icon="externalLink"
                accessibilityLabel={`${buttonLabel}, ${t('support.opensIn')}`}
                onPress={() => {
                  sendSupportLinkOpened();
                  void Linking.openURL(supportPageUrl(language)).catch(() => undefined);
                }}
              />
            </View>
            <Text style={styles.opensIn} accessibilityElementsHidden importantForAccessibility="no">
              {t('support.opensIn')}
            </Text>
          </View>
        </CardFrame>

        <SectionCard title={t('support.otherWays')}>
          <SectionRow
            testID="support-rate"
            icon="star"
            label={t('support.rate.label')}
            hint={t('support.rate.hint')}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(rateAppUrl(appBuild())).catch(() => undefined)}
          />
          <SectionRow
            testID="support-share"
            icon="share"
            label={t('support.share.label')}
            hint={t('support.share.hint')}
            onPress={() => {
              const message = t('support.share.message', { link: shareAppUrl(language) });
              Share.share({ message }).catch(() => undefined);
            }}
          />
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xs,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
  card: {
    gap: theme.space.md,
    padding: theme.space.xl,
  },
  medallion: {
    width: MEDALLION,
    height: MEDALLION,
    borderRadius: MEDALLION / 2,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.accentWash,
  },
  lead: {
    ...theme.type.title3,
    color: theme.colors.text,
    textAlign: 'center',
  },
  body: {
    ...theme.type.callout,
    color: theme.colors.text,
  },
  button: {
    paddingTop: theme.space.xs,
  },
  opensIn: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
}));
