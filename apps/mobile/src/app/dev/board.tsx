/**
 * Dev only: the board with a few fixed positions, so the owner can look at
 * the drawing on a phone. Not linked from the app. Release builds go home.
 */
import { getPreset, type PlayerId } from '@tavli/engine';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SegmentedControl } from '@/components/settings/SegmentedControl';
import { asodioMarks } from '@/features/board/asodio';
import {
  SAMPLE_DIRECTIONS,
  SAMPLE_POSITION_IDS,
  SAMPLE_POSITIONS,
  type SamplePositionId,
} from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

export default function DevBoardRoute() {
  const { t } = useTranslation();
  const [position, setPosition] = useState<SamplePositionId>('start');
  const [viewer, setViewer] = useState<PlayerId>('white');

  if (!__DEV__) return <Redirect href="/" />;

  const board = SAMPLE_POSITIONS[position];
  const view = { viewer, direction: SAMPLE_DIRECTIONS[position] };
  // Asodio positions show the checkers the quarter lock freezes.
  const marks = position.startsWith('asodio')
    ? asodioMarks(board, getPreset('asodio.kafeneio'), view)
    : {};

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: t('dev.board.title') }} />
      <StaticBoard testID="dev-board" board={board} view={view} marks={marks} />
      <View style={styles.controls}>
        <SegmentedControl
          testID="dev-board-position"
          label={t('dev.board.position')}
          value={position}
          onChange={setPosition}
          options={SAMPLE_POSITION_IDS.map((id) => ({
            value: id,
            label: t(`dev.board.positions.${id}`),
          }))}
        />
        <SegmentedControl
          testID="dev-board-viewer"
          label={t('dev.board.viewer')}
          value={viewer}
          onChange={setViewer}
          options={[
            { value: 'white', label: t('dev.board.viewWhite') },
            { value: 'black', label: t('dev.board.viewBlack') },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingBottom: rt.insets.bottom,
  },
  controls: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
}));
