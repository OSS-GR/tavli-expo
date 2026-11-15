/**
 * What's new (#471): what each app update added, newest first. The content
 * is `RELEASES` (`releases.ts`).
 *
 * The look is the Figma pass's timeline (#521): a rail on the left with a
 * dot per release (brass and lit on the newest, with a "New" chip by its
 * date), and each release's entries in one tray card. Each entry has its
 * icon, a title, a short body and, last, where to find it (a house icon
 * and a path such as "Home › Friends").
 *
 * Focus moves to the title. Large fonts scroll: no text has a line limit.
 * Navigation stays in the route (`app/whats-new.tsx`).
 */
import { withAlpha } from '@tavli/ui';
import { useLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CardFrame, RowDivider } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { dateLocale, formatDate } from '@/features/history/format';

import { RELEASES, releaseTime, type WhatsNewEntry, type WhatsNewRelease } from './releases';

/** The rail's dot, in points. */
const DOT = 12;

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
        <View>
          {releases.map((release, index) => (
            <View key={release.date} style={styles.release}>
              <View style={styles.rail}>
                <View style={styles.dot(index === 0)} />
                <View style={styles.line} />
              </View>
              <View style={styles.releaseBody}>
                <View style={styles.dateRow}>
                  <Text style={styles.date} accessibilityRole="header">
                    {formatDate(releaseTime(release.date), locale)}
                  </Text>
                  {index === 0 ? (
                    <View testID="whats-new-newest" style={styles.chip}>
                      <Text style={styles.chipText}>{t('whatsNew.new')}</Text>
                    </View>
                  ) : null}
                </View>
                <CardFrame testID={`whats-new-release-${release.date}`}>
                  {release.entries.map((entry, row) => (
                    <View key={entry.id}>
                      {row > 0 ? <RowDivider /> : null}
                      <EntryRow entry={entry} />
                    </View>
                  ))}
                </CardFrame>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

/** One entry: icon, title, body, then where to find it. */
function EntryRow({ entry }: { entry: WhatsNewEntry }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const where = t(`whatsNew.entries.${entry.id}.where`);
  return (
    <View testID={`whats-new-entry-${entry.id}`} style={styles.entry}>
      <View style={styles.entryIcon}>
        <Icon name={entry.icon} size={22} color={theme.colors.accent} />
      </View>
      <View style={styles.entryTexts}>
        <Text style={styles.entryTitle}>{t(`whatsNew.entries.${entry.id}.title`)}</Text>
        <Text style={styles.entryBody}>{t(`whatsNew.entries.${entry.id}.body`)}</Text>
        <View
          style={styles.where}
          accessible
          // "›" reads badly aloud: screen readers hear a comma instead.
          accessibilityLabel={t('whatsNew.where', { where: where.replace(/\s*›\s*/g, ', ') })}>
          <Icon name="house" size={13} color={theme.colors.accentLight} />
          <Text style={styles.whereText}>{where}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xxs,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
  intro: {
    ...theme.type.callout,
    paddingHorizontal: theme.space.xs,
    color: theme.colors.textDim,
  },
  release: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  // The timeline: a dot by the date, then a line down the release.
  rail: {
    width: DOT + 2,
    alignItems: 'center',
    paddingTop: theme.space.xs + theme.space.xxs,
  },
  dot: (newest: boolean) => ({
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: newest ? theme.colors.turn : theme.colors.border,
    // The newest dot glows: a soft ring of its own brass.
    ...(newest ? { boxShadow: `0px 0px 0px 4px ${withAlpha(theme.colors.turn, 0.2)}` } : {}),
  }),
  line: {
    flex: 1,
    width: 2,
    marginTop: theme.space.xs + theme.space.xxs,
    backgroundColor: theme.colors.separator,
  },
  releaseBody: {
    flex: 1,
    gap: theme.space.md - theme.space.xxs,
    paddingBottom: theme.space.lg + theme.space.xxs,
  },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  date: {
    ...theme.type.title3,
    flexShrink: 1,
    color: theme.colors.text,
  },
  chip: {
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: theme.space.md - theme.space.xxs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.accentWash,
  },
  chipText: {
    ...theme.type.footnote,
    fontWeight: '600',
    color: theme.colors.turnText,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.lg - theme.space.xxs,
  },
  entryIcon: {
    width: 30,
    alignItems: 'center',
    paddingTop: theme.space.xxs,
  },
  entryTexts: {
    flex: 1,
    gap: theme.space.xs,
  },
  entryTitle: {
    ...theme.type.headline,
    color: theme.colors.text,
  },
  entryBody: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  where: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    paddingTop: theme.space.xxs,
  },
  whereText: {
    ...theme.type.footnote,
    flexShrink: 1,
    color: theme.colors.accentLight,
  },
}));
