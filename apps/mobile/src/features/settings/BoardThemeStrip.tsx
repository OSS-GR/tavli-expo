/**
 * Settings → Board & look → Board (#501): one tile per bundled board
 * theme, side by side, each a small picture of the start position in that
 * theme with its name under it. The picked tile has a brass frame and a
 * check, and its name is bold, so color is not the only cue. The choice
 * saves at once (`boardTheme`).
 *
 * The first-launch board step keeps the list with descriptions
 * (`BoardThemePicker`); here the big preview above shows the pick.
 */
import { getTheme, listThemeIds } from '@tavli/themes';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import { boardLayout } from '@/features/board/BoardCanvas';
import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { useSettings } from './store';

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

export function BoardThemeStrip({ testID }: { testID: string }) {
  const { t, i18n } = useTranslation();
  const { theme: ui } = useUnistyles();
  const value = useSettings((s) => s.boardTheme);
  const homeSide = useSettings((s) => s.homeBoardSide);
  const setSetting = useSettings((s) => s.setSetting);
  const lang = i18n.language === 'el' ? 'el' : 'en';

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('settings.boardTheme.label')}
      style={styles.row}>
      {listThemeIds().map((id) => {
        const theme = getTheme(id);
        const selected = id === value;
        const aspectRatio = boardLayout(theme, 'classic', homeSide).aspectRatio;
        return (
          <Pressable
            key={id}
            testID={`${testID}-${id}`}
            accessibilityRole="radio"
            accessibilityLabel={theme.name[lang]}
            accessibilityHint={theme.description[lang]}
            accessibilityState={{ checked: selected }}
            onPress={() => setSetting('boardTheme', id)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <View
              style={styles.frame(selected)}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <View style={{ aspectRatio }}>
                <StaticBoard
                  testID={`${testID}-${id}-preview`}
                  board={SAMPLE_POSITIONS.start}
                  view={PREVIEW_VIEW}
                  theme={theme}
                  layout="classic"
                />
              </View>
            </View>
            <View style={styles.nameRow}>
              {selected ? <Icon name="check" size={14} color={ui.colors.accent} /> : null}
              <Text style={styles.name(selected)}>{theme.name[lang]}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  tile: {
    flex: 1,
    minHeight: theme.touch.minTarget,
    gap: theme.space.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  frame: (selected: boolean) => ({
    padding: 3,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderColor: selected ? theme.colors.accent : 'transparent',
  }),
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.xxs,
  },
  name: (selected: boolean) => ({
    ...theme.type.footnote,
    fontWeight: selected ? '600' : '400',
    flexShrink: 1,
    color: selected ? theme.colors.text : theme.colors.textDim,
  }),
}));
