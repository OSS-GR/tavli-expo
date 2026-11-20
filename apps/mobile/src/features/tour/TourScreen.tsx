/**
 * The app tour (#573, Figma frame 22): a few full-screen pages after the
 * welcome flow of a new install, and again from How to play and Settings
 * → Help.
 *
 * - Welcome: Start the tour, or Not now (the same as Skip).
 * - Roll and Move: the player tries it on the real board (`TryRoll`,
 *   `TryMove`). Next works when the steps are done.
 * - Home, the ways to play and help: reading pages. Next fills over
 *   `TOUR_READ_MS` before it works (`TimedNext`).
 *
 * Skip is on every page and works at once; Back from the second page.
 * The top row shows one bar per page. The screen stays upright. Each
 * page's title gets the screen reader's focus when it shows.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { EmptyMedallion } from '@/components/EmptyMedallion';
import { RoundButton } from '@/components/RoundButton';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import type { IconName } from '@/components/icons';
import { useFocusOnShow } from '@/features/accessibility/focus';

import { HomeSketch } from './HomeSketch';
import { isTryPage, type TourOffers, type TourPageId } from './pages';
import { TimedNext } from './TimedNext';
import { TryMove } from './TryMove';
import { TryRoll } from './TryRoll';

export interface TourScreenProps {
  pages: readonly TourPageId[];
  offers: TourOffers;
  /** The tour opened on its own (Home) or from a menu: the last button's text. */
  firstRun: boolean;
  /** Skip, or Not now: leave the tour. */
  onSkip: () => void;
  /** The last page's main button: the first Portes lesson. */
  onLesson: () => void;
  /** The last page's second button: Home, or back where the tour came from. */
  onFinish: () => void;
}

interface Row {
  readonly id: string;
  readonly icon: IconName;
  readonly label: string;
  readonly hint: string;
}

function Rows({ rows }: { rows: readonly Row[] }) {
  return (
    <View style={styles.rows}>
      <SectionCard>
        {rows.map((row) => (
          <SectionRow
            key={row.id}
            testID={`tour-row-${row.id}`}
            icon={row.icon}
            label={row.label}
            hint={row.hint}
          />
        ))}
      </SectionCard>
    </View>
  );
}

export function TourScreen({
  pages,
  offers,
  firstRun,
  onSkip,
  onLesson,
  onFinish,
}: TourScreenProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  // Try-it pages done once stay done when the player comes back to them.
  const [tried, setTried] = useState<ReadonlySet<TourPageId>>(() => new Set());
  const page = pages[index] ?? 'help';
  const last = index === pages.length - 1;
  const next = () => setIndex(Math.min(index + 1, pages.length - 1));
  const markTried = (id: TourPageId) => setTried((old) => new Set([...old, id]));

  const legend = (
    <View style={styles.legend}>
      {(['hero', 'games', 'modes', 'top'] as const).map((part, i) => (
        <View key={part} style={styles.legendRow} accessible>
          <Text style={styles.legendNumber}>{i + 1}</Text>
          <Text style={styles.body}>{t(`tour.home.${part}`)}</Text>
        </View>
      ))}
    </View>
  );

  let content;
  switch (page) {
    case 'welcome':
      content = (
        <View style={styles.welcome}>
          <EmptyMedallion icon="compass" size="large" />
        </View>
      );
      break;
    case 'roll':
      content = <TryRoll onDone={() => markTried('roll')} />;
      break;
    case 'move':
      content = <TryMove onDone={() => markTried('move')} />;
      break;
    case 'home':
      content = (
        <>
          <HomeSketch />
          {legend}
        </>
      );
      break;
    case 'local':
      content = (
        <Rows
          rows={[
            { id: 'vsBot', icon: 'bot', label: t('home.vsBot.title'), hint: t('tour.local.vsBot') },
            { id: 'pass', icon: 'users', label: t('home.local.title'), hint: t('tour.local.pass') },
          ]}
        />
      );
      break;
    case 'friend':
      content = (
        <Rows
          rows={[
            {
              id: 'invite',
              icon: 'globe',
              label: t('home.friend.title'),
              hint: t('tour.friend.invite'),
            },
            {
              id: 'join',
              icon: 'keyboard',
              label: t('home.join.title'),
              hint: t('tour.friend.join'),
            },
          ]}
        />
      );
      break;
    case 'account':
      content = (
        <Rows
          rows={[
            ...(offers.ranked
              ? [
                  {
                    id: 'ranked',
                    icon: 'trophy' as const,
                    label: t('home.ranked.title'),
                    hint: t('tour.account.ranked'),
                  },
                ]
              : []),
            ...(offers.friends
              ? [
                  {
                    id: 'friends',
                    icon: 'handshake' as const,
                    label: t('home.friends.title'),
                    hint: t('tour.account.friends'),
                  },
                ]
              : []),
            ...(offers.ratings
              ? [
                  {
                    id: 'ratings',
                    icon: 'chart' as const,
                    label: t('home.ratings.title'),
                    hint: t('tour.account.ratings'),
                  },
                ]
              : []),
          ]}
        />
      );
      break;
    case 'help':
      content = (
        <Rows
          rows={[
            {
              id: 'howToPlay',
              icon: 'book',
              label: t('home.howToPlay'),
              hint: t('tour.help.howToPlay'),
            },
            {
              id: 'history',
              icon: 'history',
              label: t('home.history'),
              hint: t('tour.help.history'),
            },
            {
              id: 'settings',
              icon: 'settings',
              label: t('home.openSettings'),
              hint: t('tour.help.settings'),
            },
            {
              id: 'whatsNew',
              icon: 'sparkles',
              label: t('home.whatsNew.label'),
              hint: t('tour.help.whatsNew'),
            },
          ]}
        />
      );
      break;
  }

  let footer;
  if (page === 'welcome') {
    footer = (
      <View style={styles.buttons}>
        <ActionButton testID="tour-start" label={t('tour.welcome.start')} onPress={next} />
        <ActionButton
          testID="tour-not-now"
          kind="text"
          label={t('tour.welcome.notNow')}
          onPress={onSkip}
        />
      </View>
    );
  } else if (last) {
    footer = (
      <View style={styles.buttons}>
        <View style={styles.row}>
          <TimedNext
            key={page}
            testID="tour-lesson"
            label={t('tour.help.lesson')}
            onPress={onLesson}
          />
        </View>
        <ActionButton
          testID="tour-finish"
          kind="text"
          label={firstRun ? t('tour.help.home') : t('tour.help.done')}
          onPress={onFinish}
        />
      </View>
    );
  } else {
    footer = (
      <View style={styles.row}>
        <TimedNext
          key={page}
          testID="tour-next"
          label={t('tour.next')}
          wait={!isTryPage(page)}
          ready={!isTryPage(page) || tried.has(page)}
          onPress={next}
        />
      </View>
    );
  }

  return (
    <View testID="tour-screen" style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.side}>
          {index > 0 ? (
            <RoundButton
              testID="tour-back"
              icon="chevronLeft"
              accessibilityLabel={t('common.back')}
              onPress={() => setIndex(index - 1)}
            />
          ) : null}
        </View>
        <View
          testID="tour-steps"
          style={styles.bars}
          accessible
          accessibilityLabel={t('tour.step', { step: index + 1, total: pages.length })}>
          {pages.map((id, i) => (
            <View key={id} style={styles.bar(i <= index)} />
          ))}
        </View>
        <View style={[styles.side, styles.sideRight]}>
          <Pressable
            testID="tour-skip"
            accessibilityRole="button"
            accessibilityLabel={t('tour.skip')}
            accessibilityHint={t('tour.skipHint')}
            hitSlop={8}
            onPress={onSkip}
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
            <Text style={styles.skipText}>{t('tour.skip')}</Text>
          </Pressable>
        </View>
      </View>
      <TourPage key={page} page={page}>
        {content}
      </TourPage>
      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

/** One page: its title (focused when it shows), its line, then its content. */
function TourPage({ page, children }: { page: TourPageId; children: React.ReactNode }) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const heading = (
    <View style={styles.heading}>
      <Text
        ref={titleRef}
        testID={`tour-title-${page}`}
        style={styles.title}
        accessibilityRole="header">
        {t(`tour.${page}.title`)}
      </Text>
      <Text style={styles.body}>{t(`tour.${page}.body`)}</Text>
    </View>
  );
  if (isTryPage(page)) {
    // The board takes the room that is left: no scroll, so a drag never scrolls.
    return (
      <View testID={`tour-page-${page}`} style={styles.tryPage}>
        {heading}
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      testID={`tour-page-${page}`}
      style={styles.readPage}
      contentContainerStyle={styles.readContent}
      alwaysBounceVertical={false}>
      {page === 'welcome' ? children : null}
      {heading}
      {page === 'welcome' ? null : children}
    </ScrollView>
  );
}

const BAR_WIDTH = 20;
const BAR_HEIGHT = 4;

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top + theme.space.xs,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
    paddingLeft: rt.insets.left,
    paddingRight: rt.insets.right,
    gap: theme.space.sm,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touch.minTarget,
    paddingHorizontal: theme.space.lg,
  },
  side: {
    width: 96,
    flexDirection: 'row',
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.space.xs,
  },
  bar: (done: boolean) => ({
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: done ? theme.colors.accent : theme.colors.border,
  }),
  skip: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  skipText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
  heading: {
    gap: theme.space.xs,
    paddingHorizontal: theme.space.lg,
  },
  title: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    flexShrink: 1,
    color: theme.colors.text,
  },
  tryPage: {
    flex: 1,
    gap: theme.space.sm,
  },
  readPage: {
    flex: 1,
  },
  readContent: {
    flexGrow: 1,
    gap: theme.space.lg,
    paddingBottom: theme.space.lg,
  },
  welcome: {
    alignItems: 'center',
    paddingTop: theme.space.xl,
  },
  rows: {
    paddingHorizontal: theme.space.lg,
  },
  legend: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
  },
  legendRow: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  legendNumber: {
    ...theme.type.bodyStrong,
    width: 20,
    color: theme.colors.accent,
  },
  footer: {
    paddingHorizontal: theme.space.lg,
  },
  buttons: {
    gap: theme.space.xs,
  },
  row: {
    flexDirection: 'row',
  },
}));
