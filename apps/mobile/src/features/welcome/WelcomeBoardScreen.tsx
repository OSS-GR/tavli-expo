import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';
import { BoardLayoutPicker } from '@/features/settings/BoardLayoutPicker';
import { BoardThemePicker } from '@/features/settings/BoardThemePicker';
import { HomeBoardSidePicker } from '@/features/settings/HomeBoardSidePicker';
import { useSettings } from '@/features/settings/store';

export interface WelcomeBoardScreenProps {
  onBack: () => void;
  /** The player keeps the board as picked. */
  onContinue: () => void;
}

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

/** The preview takes at most this part of the window height, and at most `PREVIEW_MAX` points. */
const PREVIEW_SHARE = 0.26;
const PREVIEW_MAX = 200;

/**
 * First launch, step 3 (#350): the board theme, the home side and the
 * board layout, over a live preview of the start position. The pickers
 * are the ones in Settings, so each tap saves at once and the preview
 * follows it. The defaults are picked, so Continue alone keeps them.
 * Continue ends the welcome flow: the root layout's guard opens Home (or
 * a waiting invite link).
 */
export function WelcomeBoardScreen({ onBack, onContinue }: WelcomeBoardScreenProps) {
  const { t } = useTranslation();
  const layout = useSettings((s) => s.boardLayout);
  const { height } = useWindowDimensions();
  const titleRef = useFocusOnShow();
  const previewHeight = Math.min(PREVIEW_MAX, Math.round(height * PREVIEW_SHARE));

  return (
    <View testID="welcome-board" style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          testID="welcome-board-back"
          accessibilityRole="button"
          accessibilityLabel={t('welcome.privacy.back')}
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backIcon} importantForAccessibility="no" allowFontScaling={false}>
            {'‹'}
          </Text>
        </Pressable>
        <Text style={styles.step}>{t('welcome.privacy.step', { step: 3, total: 3 })}</Text>
      </View>

      {/* The live preview stays in view while the list scrolls. It only
          repeats the picks for the eye, so screen readers skip it. */}
      <View
        testID="welcome-board-preview"
        style={styles.preview(previewHeight)}
        collapsable={false}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <StaticBoard
          testID="welcome-board-preview-board"
          board={SAMPLE_POSITIONS.start}
          view={PREVIEW_VIEW}
          layout={layout}
        />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text ref={titleRef} style={styles.title} accessibilityRole="header">
          {t('welcome.board.title')}
        </Text>
        <Text style={styles.text}>{t('welcome.board.intro')}</Text>
        <Text style={styles.label}>{t('settings.boardTheme.label')}</Text>
        <BoardThemePicker testID="welcome-board-theme" />
        <HomeBoardSidePicker testID="welcome-board-home" />
        <BoardLayoutPicker testID="welcome-board-layout" />
      </ScrollView>

      <View style={styles.buttons}>
        <ActionButton
          testID="welcome-board-continue"
          label={t('welcome.language.continue')}
          onPress={onContinue}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top + theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg,
  },
  back: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  backIcon: {
    fontSize: 32,
    lineHeight: 34,
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  step: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  // No text inside: a fixed height is safe here.
  preview: (height: number) => ({
    height,
    marginHorizontal: theme.space.xl,
    marginTop: theme.space.sm,
  }),
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.lg,
    gap: theme.space.xs,
  },
  title: {
    ...theme.type.display,
    fontSize: 30,
    lineHeight: 36,
    color: theme.colors.text,
  },
  text: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  // Like the labels the side and layout pickers draw above their lists.
  label: {
    ...theme.type.body,
    color: theme.colors.text,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xs,
  },
  buttons: {
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.sm,
  },
}));
