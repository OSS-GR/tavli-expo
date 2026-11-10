/**
 * What's new (#471): what each app update added, newest first. Each
 * release is one `SectionCard` under its date; each entry is a row with an
 * icon, a title and a line on what it is and where to find it. The
 * content is `RELEASES` (`releases.ts`).
 *
 * Focus moves to the title. Large fonts scroll: no text has a line limit.
 * Navigation stays in the route (`app/whats-new.tsx`).
 */
import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { dateLocale, formatDate } from '@/features/history/format';

import { RELEASES, releaseTime, type WhatsNewRelease } from './releases';

export interface WhatsNewScreenProps {
  onBack: () => void;
  /** The releases to show, newest first. Default: the app's list. */
  releases?: readonly WhatsNewRelease[];
}

export function WhatsNewScreen({ onBack, releases = RELEASES }: WhatsNewScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const titleRef = useFocusOnShow();

  return (
    <Screen testID="whats-new-screen">
      <ScreenHeader
        title={t('whatsNew.title')}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="whats-new-back"
        titleRef={titleRef}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never">
        <Text style={styles.intro}>{t('whatsNew.intro')}</Text>
        {releases.map((release) => (
          <SectionCard
            key={release.date}
            testID={`whats-new-release-${release.date}`}
            title={formatDate(releaseTime(release.date), locale)}>
            {release.entries.map((entry) => (
              <SectionRow
                key={entry.id}
                testID={`whats-new-entry-${entry.id}`}
                icon={entry.icon}
                label={t(`whatsNew.entries.${entry.id}.title`)}
                hint={t(`whatsNew.entries.${entry.id}.body`)}
              />
            ))}
          </SectionCard>
        ))}
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
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
  intro: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
}));
