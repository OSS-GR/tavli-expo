/**
 * Settings → Board (issue #138): one radio row per bundled board theme, with
 * a small picture of the start position in that theme. The choice saves at
 * once (`boardTheme`). The game, the tutorial and the rules pictures read it
 * through `useBoardTheme`. `PicturePicker` draws it in a card or alone.
 */
import { getTheme, listThemeIds } from '@tavli/themes';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { PicturePicker } from './PicturePicker';
import { useSettings } from './store';

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

export function BoardThemePicker({ testID }: { testID: string }) {
  const { t, i18n } = useTranslation();
  const value = useSettings((s) => s.boardTheme);
  const setSetting = useSettings((s) => s.setSetting);
  const lang = i18n.language === 'el' ? 'el' : 'en';

  const options = listThemeIds().map((id) => {
    const theme = getTheme(id);
    return {
      value: id,
      label: theme.name[lang],
      hint: theme.description[lang],
      picture: (
        <View style={styles.preview}>
          <StaticBoard
            testID={`${testID}-${id}-preview`}
            board={SAMPLE_POSITIONS.start}
            view={PREVIEW_VIEW}
            theme={theme}
          />
        </View>
      ),
    };
  });

  return (
    <PicturePicker
      testID={testID}
      icon="image"
      label={t('settings.boardTheme.label')}
      hint={t('settings.boardTheme.hint')}
      options={options}
      value={value}
      onChange={(id) => setSetting('boardTheme', id)}
    />
  );
}

/** Preview size in points. The portrait board is about 0.6 wide per 1 tall. */
const PREVIEW = { width: 64, height: 104 };

const styles = StyleSheet.create({
  preview: {
    width: PREVIEW.width,
    height: PREVIEW.height,
  },
});
