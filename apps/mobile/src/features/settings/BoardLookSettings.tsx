/**
 * Settings → Board & look (#501, Figma "08 Settings"): a big preview of
 * the board as picked, a row of the board themes, Board layout, Your home,
 * Pass-and-play view, and the app colors. Every pick saves at once and
 * shows in the preview.
 *
 * Face-to-face is not built yet (owner: after MVP1): it is a locked row
 * with a "Soon" chip, not an option of the view picker.
 */
import { THEME_IDS } from '@tavli/ui';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SectionCard, SectionRow } from '@/components/SectionCard';
import { SectionHeader } from '@/components/SectionHeader';
import { OptionList } from '@/components/settings/OptionList';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { Surface } from '@/components/Surface';
import { boardLayout, useBoardTheme } from '@/features/board/BoardCanvas';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { BoardThemeStrip } from './BoardThemeStrip';
import { BlockHint } from './SettingBlock';
import {
  BOARD_FLIP_MODES,
  BOARD_LAYOUT_MODES,
  HOME_BOARD_SIDES,
  type BoardFlipMode,
  type BoardLayoutMode,
  type HomeBoardSide,
} from './settings';
import { SettingsChip } from './SettingsChip';
import { SettingsPage } from './SettingsPage';
import { useSettings } from './store';

export function BoardLookSettings({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const boardTheme = useBoardTheme();
  const layout = useSettings((s) => s.boardLayout);
  const homeSide = useSettings((s) => s.homeBoardSide);
  const flipMode = useSettings((s) => s.boardFlipMode);
  const appTheme = useSettings((s) => s.theme);
  const setSetting = useSettings((s) => s.setSetting);

  const layoutOptions: SegmentOption<BoardLayoutMode>[] = BOARD_LAYOUT_MODES.map((mode) => ({
    value: mode,
    label: t(`settings.boardLayout.${mode}`),
  }));
  const homeOptions: SegmentOption<HomeBoardSide>[] = HOME_BOARD_SIDES.map((side) => ({
    value: side,
    label: t(`settings.homeBoard.${side}`),
  }));
  const viewOptions: SegmentOption<BoardFlipMode>[] = BOARD_FLIP_MODES.map((mode) => ({
    value: mode,
    label: t(`settings.boardView.${mode}`),
  }));
  const themeOptions = THEME_IDS.map((id) => ({ value: id, label: t(`themes.${id}`) }));
  // The board as on a table: wide and low, so it fits the card.
  const aspectRatio = boardLayout(boardTheme, 'classic', homeSide).aspectRatio;

  return (
    <SettingsPage
      title={t('settings.boardLook.title')}
      onBack={onBack}
      testID="settings-board-look-screen"
      backTestID="settings-board-look-back">
      <Surface tier="raised" style={styles.preview}>
        <View
          style={{ aspectRatio }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <StaticBoard
            testID="settings-board-preview"
            board={SAMPLE_POSITIONS.start}
            view={{ viewer: 'white', direction: 'contrary' }}
            layout="classic"
          />
        </View>
      </Surface>

      <View style={styles.group}>
        <SectionHeader title={t('settings.boardTheme.label')} />
        <BoardThemeStrip testID="settings-board-theme" />
        <BlockHint>{t('settings.boardTheme.hint')}</BlockHint>
      </View>

      <SectionCard title={t('settings.boardLayout.label')} padded>
        <SegmentedControl
          testID="settings-board-layout"
          label={t('settings.boardLayout.label')}
          options={layoutOptions}
          value={layout}
          onChange={(mode) => setSetting('boardLayout', mode)}
        />
        <BlockHint>{t(`settings.boardLayout.${layout}Hint`)}</BlockHint>
        <BlockHint>{t('settings.boardLayout.hint')}</BlockHint>
      </SectionCard>

      <SectionCard title={t('settings.homeBoard.label')} padded>
        <SegmentedControl
          testID="settings-home-board"
          label={t('settings.homeBoard.label')}
          options={homeOptions}
          value={homeSide}
          onChange={(side) => setSetting('homeBoardSide', side)}
        />
        <BlockHint>{t(`settings.homeBoard.${homeSide}Hint`)}</BlockHint>
        <BlockHint>{t('settings.homeBoard.hint')}</BlockHint>
      </SectionCard>

      <SectionCard title={t('settings.boardView.label')} padded>
        <SegmentedControl
          testID="settings-board-view"
          label={t('settings.boardView.label')}
          options={viewOptions}
          value={flipMode}
          onChange={(mode) => setSetting('boardFlipMode', mode)}
        />
        <BlockHint>
          {flipMode === 'flip'
            ? t('settings.boardView.flipHint')
            : t('settings.boardView.fixedHint')}
        </BlockHint>
      </SectionCard>

      <SectionCard>
        <SectionRow
          testID="settings-face-to-face"
          icon="flipVertical"
          iconLook="bare"
          label={t('settings.boardView.faceToFace')}
          hint={t('settings.boardView.faceToFaceHint')}
          disabled
          accessibilityLabel={t('settings.boardView.faceToFace')}
          accessibilityHint={t('settings.boardView.faceToFaceSoon')}
          right={<SettingsChip label={t('settings.soon')} />}
        />
      </SectionCard>

      <SectionCard title={t('settings.theme.label')}>
        <OptionList
          testID="settings-theme"
          label={t('settings.theme.label')}
          options={themeOptions}
          value={appTheme}
          onChange={(value) => setSetting('theme', value)}
        />
      </SectionCard>
    </SettingsPage>
  );
}

const styles = StyleSheet.create((theme) => ({
  preview: {
    padding: theme.space.md,
  },
  group: {
    gap: theme.space.sm,
  },
}));
