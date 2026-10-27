/**
 * A small picture of a game's start position: the real board drawing
 * (`StaticBoard`) with White, the light checkers, at the bottom. Its width
 * follows the screen and its height follows the board's shape, so it never
 * needs a fixed height.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { portraitLayout, useBoardTheme } from '@/features/board/BoardCanvas';
import { StaticBoard } from '@/features/board/StaticBoard';

import { rulesDirection, startBoard, type RulesGame } from './content';

export function StartPicture({ game }: { game: RulesGame }) {
  const { t } = useTranslation();
  const aspectRatio = portraitLayout(useBoardTheme()).aspectRatio;
  const board = useMemo(() => startBoard(game), [game]);
  return (
    <View style={styles.wrap}>
      <View
        testID={`rules-picture-${game}`}
        style={styles.picture(aspectRatio)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('rules.picture.label', { game: t(`games.${game}`) })}>
        <StaticBoard
          board={board}
          view={{ viewer: 'white', direction: rulesDirection(game) }}
          testID={`rules-board-${game}`}
        />
      </View>
      <Text style={styles.caption}>{t('rules.picture.caption')}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    gap: theme.space.sm,
    paddingVertical: theme.space.xs,
  },
  picture: (aspectRatio: number) => ({
    alignSelf: 'center',
    width: '60%',
    maxWidth: 240,
    aspectRatio,
  }),
  caption: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
