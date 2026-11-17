/**
 * The support ask (#590, Figma frame 25, part 3): "Enjoying Tavlaki?" in a
 * card over an end screen, with **Support Tavlaki** (opens the Support
 * screen, never the browser), **Not now** and, under them, a small muted
 * **Don't ask again** text link (no button shape, but a real button for
 * screen readers, in `textDim`: at least 4.5:1 on the card).
 *
 * `useSupportAsk` decides when it shows. The screen under it hides what
 * the card covers from screen readers (`SupportAskCover`). Focus moves to
 * the title, and the card scrolls with a large font.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { useFocusOnShow } from '@/features/accessibility/focus';

import type { SupportAskAnswer } from './supportAnalytics';

/** The coffee medallion, in points. */
const MEDALLION = 56;

export interface SupportAskCardProps {
  onAnswer: (answer: SupportAskAnswer) => void;
}

export function SupportAskCard({ onAnswer }: SupportAskCardProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const titleRef = useFocusOnShow();
  return (
    <View style={styles.root}>
      <View style={styles.scrim} />
      <View testID="support-ask-card" style={styles.card} accessibilityViewIsModal>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View
            style={styles.medallion}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <Icon name="coffee" size={26} strokeWidth={1.6} color={theme.colors.accent} />
          </View>
          <Text ref={titleRef} style={styles.title} accessibilityRole="header">
            {t('support.ask.title')}
          </Text>
          <Text style={styles.body}>{t('support.ask.body')}</Text>
          <View style={styles.actions}>
            <ActionButton
              testID="support-ask-support"
              label={t('support.ask.support')}
              onPress={() => onAnswer('support')}
            />
            <ActionButton
              testID="support-ask-not-now"
              label={t('support.ask.notNow')}
              kind="secondary"
              onPress={() => onAnswer('not_now')}
            />
          </View>
          <Pressable
            testID="support-ask-never"
            accessibilityRole="button"
            hitSlop={12}
            style={styles.never}
            onPress={() => onAnswer('never')}>
            <Text style={styles.neverText}>{t('support.ask.never')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

/**
 * Holds what the card covers. While `covered`, screen readers skip it. It
 * always holds its children (`collapsable={false}`), so they keep their
 * native parent when the hiding props change (#173).
 */
export function SupportAskCover({
  covered,
  fill,
  children,
}: {
  covered: boolean;
  /** `absolute`: over the screen (a sheet), `flex`: the screen's content. */
  fill: 'absolute' | 'flex';
  children: ReactNode;
}) {
  return (
    <View
      style={styles.cover(fill)}
      pointerEvents="box-none"
      collapsable={false}
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backgroundDeep,
    opacity: 0.6,
  },
  card: {
    // Never taller than the screen: the content scrolls instead.
    flexShrink: 1,
    maxHeight: '100%',
    width: '100%',
    maxWidth: 360,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.xl,
  },
  medallion: {
    width: MEDALLION,
    height: MEDALLION,
    borderRadius: MEDALLION / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.accentWash,
  },
  title: {
    ...theme.type.title2,
    color: theme.colors.text,
    textAlign: 'center',
  },
  body: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.space.sm,
    paddingTop: theme.space.xs,
  },
  never: {
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.sm,
  },
  neverText: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  cover: (fill: 'absolute' | 'flex') => ({
    ...(fill === 'absolute' ? StyleSheet.absoluteFillObject : { flex: 1 }),
  }),
}));
