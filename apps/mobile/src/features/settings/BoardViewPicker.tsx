/**
 * Board view for pass-and-play: Flip / Face-to-face / Fixed (wireframes 5
 * and 10). It edits Settings → Board view, so the new-game screen and
 * Settings always agree, and a change applies at once, also in a game.
 * Face-to-face is shown but locked until it ships (owner: after MVP1).
 */
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';

import type { BoardFlipMode } from './settings';
import { useSettings } from './store';

type BoardViewOption = BoardFlipMode | 'faceToFace';

export function BoardViewPicker({ testID }: { testID: string }) {
  const { t } = useTranslation();
  const mode = useSettings((s) => s.boardFlipMode);
  const setSetting = useSettings((s) => s.setSetting);

  const options: SegmentOption<BoardViewOption>[] = [
    { value: 'flip', label: t('settings.boardView.flip') },
    {
      value: 'faceToFace',
      label: t('settings.boardView.faceToFace'),
      disabled: true,
      accessibilityHint: t('common.comingSoon'),
    },
    { value: 'fixed', label: t('settings.boardView.fixed') },
  ];

  return (
    <>
      <SegmentedControl
        testID={testID}
        label={t('settings.boardView.label')}
        options={options}
        value={mode}
        onChange={(value) => {
          if (value !== 'faceToFace') setSetting('boardFlipMode', value);
        }}
      />
      <Text style={styles.hint}>
        {mode === 'flip' ? t('settings.boardView.flipHint') : t('settings.boardView.fixedHint')}
      </Text>
      <Text style={styles.hint}>{t('settings.boardView.faceToFaceSoon')}</Text>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    paddingTop: theme.space.xs,
  },
}));
