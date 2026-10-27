/**
 * Settings → Board (issue #138): one radio row per bundled board theme, with
 * a small picture of the start position in that theme. The choice saves at
 * once (`boardTheme`). The game, the tutorial and the rules pictures read it
 * through `useBoardTheme`.
 */
import { getTheme, listThemeIds } from '@tavli/themes';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { useSettings } from './store';

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

export function BoardThemePicker({ testID }: { testID: string }) {
  const { t, i18n } = useTranslation();
  const value = useSettings((s) => s.boardTheme);
  const setSetting = useSettings((s) => s.setSetting);
  const lang = i18n.language === 'el' ? 'el' : 'en';

  return (
    <>
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('settings.boardTheme.label')}
        style={styles.list}>
        {listThemeIds().map((id) => {
          const theme = getTheme(id);
          const selected = id === value;
          return (
            <Pressable
              key={id}
              testID={`${testID}-${id}`}
              accessibilityRole="radio"
              accessibilityLabel={theme.name[lang]}
              accessibilityHint={theme.description[lang]}
              accessibilityState={{ checked: selected }}
              onPress={() => setSetting('boardTheme', id)}
              style={({ pressed }) => [styles.row(selected), pressed && styles.pressed]}>
              <View style={styles.radio(selected)}>
                {selected ? <View style={styles.dot} /> : null}
              </View>
              {/* The picture only repeats the name for the eye, so screen readers skip it. */}
              <View
                style={styles.preview}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <StaticBoard
                  testID={`${testID}-${id}-preview`}
                  board={SAMPLE_POSITIONS.start}
                  view={PREVIEW_VIEW}
                  theme={theme}
                />
              </View>
              <View style={styles.text}>
                <Text style={styles.name(selected)}>{theme.name[lang]}</Text>
                <Text style={styles.description}>{theme.description[lang]}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('settings.boardTheme.hint')}</Text>
    </>
  );
}

const RADIO = 22;
/** Preview size in points. The portrait board is about 0.6 wide per 1 tall. */
const PREVIEW = { width: 64, height: 104 };

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space.sm,
  },
  row: (selected: boolean) => ({
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.surface,
  }),
  pressed: {
    opacity: 0.7,
  },
  preview: {
    width: PREVIEW.width,
    height: PREVIEW.height,
  },
  text: {
    flex: 1,
    gap: theme.space.xxs,
  },
  name: (selected: boolean) => ({
    ...(selected ? theme.type.bodyStrong : theme.type.body),
    color: theme.colors.text,
  }),
  description: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  radio: (selected: boolean) => ({
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 2,
    borderColor: selected ? theme.colors.accent : theme.colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  dot: {
    width: RADIO / 2,
    height: RADIO / 2,
    borderRadius: RADIO / 4,
    backgroundColor: theme.colors.accent,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    paddingTop: theme.space.xs,
  },
}));
