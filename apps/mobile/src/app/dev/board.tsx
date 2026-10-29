/**
 * Dev only: the board with a few fixed positions, so the owner can look at
 * the drawing on a phone. Not linked from the app. Release builds go home.
 *
 * Dice → "Throw on the board" turns on the dice throw spike (#183): swipe
 * to throw two dice onto the board (`features/dice-throw`). The swipe may
 * start anywhere under the header, on the controls too.
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
import { DiceThrowBoard } from '@/features/dice-throw/DiceThrowBoard';
import { createLocalRng } from '@/services';

type DiceMode = 'off' | 'throw';

export default function DevBoardRoute() {
  const { t } = useTranslation();
  const [position, setPosition] = useState<SamplePositionId>('start');
  const [viewer, setViewer] = useState<PlayerId>('white');
  const [dice, setDice] = useState<DiceMode>('off');
  const [rng] = useState(createLocalRng);

  if (!__DEV__) return <Redirect href="/" />;

  const board = SAMPLE_POSITIONS[position];
  const view = { viewer, direction: SAMPLE_DIRECTIONS[position] };
  // Asodio positions show the checkers the quarter lock freezes.
  const marks = position.startsWith('asodio')
    ? asodioMarks(board, getPreset('asodio.kafeneio'), view)
    : {};

  const controls = (
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
      <SegmentedControl
        testID="dev-board-dice"
        label={t('dev.board.dice')}
        value={dice}
        onChange={setDice}
        options={[
          { value: 'off', label: t('dev.board.diceOff') },
          { value: 'throw', label: t('dev.board.diceThrow') },
        ]}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: t('dev.board.title') }} />
      {dice === 'throw' ? (
        // The controls go inside the throw view: a swipe that starts on them throws too.
        <DiceThrowBoard testID="dev-throw" board={board} view={view} marks={marks} rng={rng}>
          {controls}
        </DiceThrowBoard>
      ) : (
        <>
          <StaticBoard testID="dev-board" board={board} view={view} marks={marks} />
          {controls}
        </>
      )}
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
