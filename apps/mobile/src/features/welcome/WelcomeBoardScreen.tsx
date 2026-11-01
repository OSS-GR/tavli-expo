import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useFocusOnShow } from '@/features/accessibility/focus';
import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';
import { BoardLayoutPicker } from '@/features/settings/BoardLayoutPicker';
import { BoardThemePicker } from '@/features/settings/BoardThemePicker';
import { HomeBoardSidePicker } from '@/features/settings/HomeBoardSidePicker';
import { useSettings } from '@/features/settings/store';

import { WelcomeTop } from './WelcomeTop';

export interface WelcomeBoardScreenProps {
  onBack: () => void;
  /** The player keeps the board as picked. */
  onContinue: () => void;
}

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

/** The preview takes at most this part of the window height, and at most `PREVIEW_MAX` points. */
const PREVIEW_SHARE = 0.28;
const PREVIEW_MAX = 240;
/** The space between the preview card's edge and the phone. */
const PREVIEW_PAD = 8;
/** Width / height of the phone outline (about a phone held upright). */
const PHONE_SHAPE = 0.5;

/**
 * First launch, step 3 (#350): the board theme, the home side and the
 * board layout, over a live preview of the start position. The pickers
 * are the ones in Settings, so each tap saves at once and the preview
 * follows it. The defaults are picked, so Continue alone keeps them.
 * Continue ends the welcome flow: the root layout's guard opens Home (or
 * a waiting invite link).
 *
 * The preview sits in an upright phone outline (#362), so the tall board
 * on its side clearly reads as "the phone held upright"; inside it the
 * board follows the Tall or Classic pick as on the game screen.
 */
export function WelcomeBoardScreen({ onBack, onContinue }: WelcomeBoardScreenProps) {
  const { t } = useTranslation();
  const layout = useSettings((s) => s.boardLayout);
  const { height } = useWindowDimensions();
  const titleRef = useFocusOnShow();
  const previewHeight = Math.min(PREVIEW_MAX, Math.round(height * PREVIEW_SHARE));

  const phoneHeight = previewHeight - 2 * PREVIEW_PAD;

  return (
    <Screen testID="welcome-board">
      <WelcomeTop
        onBack={onBack}
        backTestID="welcome-board-back"
        step={t('welcome.privacy.step', { step: 3, total: 3 })}
      />

      {/* The live preview stays in view while the list scrolls. It only
          repeats the picks for the eye, so screen readers skip it. */}
      <View
        testID="welcome-board-preview"
        style={styles.preview(previewHeight)}
        collapsable={false}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {/* A phone held upright: the speaker on top, the home bar below. */}
        <View style={styles.phone(phoneHeight)} collapsable={false}>
          <View style={styles.speaker} />
          <View style={styles.phoneScreen} collapsable={false}>
            <StaticBoard
              testID="welcome-board-preview-board"
              board={SAMPLE_POSITIONS.start}
              view={PREVIEW_VIEW}
              layout={layout}
            />
          </View>
          <View style={styles.homeBar} />
        </View>
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
          kind="primary"
          label={t('welcome.language.continue')}
          onPress={onContinue}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  // No text inside: a fixed height is safe here. A brass-edged dark card.
  preview: (height: number) => ({
    height,
    marginHorizontal: theme.space.lg,
    marginTop: theme.space.xs,
    padding: PREVIEW_PAD - 1,
    alignItems: 'center',
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.backgroundDeep,
  }),
  // Like the phones in the board layout picker, larger.
  phone: (height: number) => ({
    height,
    width: Math.round(height * PHONE_SHAPE),
    paddingHorizontal: 4,
    paddingVertical: 5,
    gap: 4,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  }),
  speaker: {
    alignSelf: 'center',
    width: '30%',
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  phoneScreen: {
    flex: 1,
  },
  homeBar: {
    alignSelf: 'center',
    width: '40%',
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
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
    paddingBottom: rt.insets.bottom + theme.space.lg,
  },
}));
