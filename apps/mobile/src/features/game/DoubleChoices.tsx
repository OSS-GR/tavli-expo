/**
 * The six buttons of the "choose a double" card (#205). In the Acey-Deucey
 * presets of Asodio a 1-2 lets the player choose a double; the engine asks
 * (`chooseDouble`, choices `1`–`6`) and this card answers.
 *
 * Each button shows the two dice of the double and its name under them
 * (Greek names each double by its value: «τεσσάρες» for 4-4). Screen
 * readers hear "double 4: four moves of 4". The dice are plain views, so
 * they stay crisp at any size and need no canvas; screen readers skip them.
 *
 * Three buttons a row; two with a large font, so the names do not break.
 * No text has a line limit or sits in a fixed-height box (#134).
 */
import { isDieValue, type DieValue } from '@tavli/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** From this font scale on, two buttons a row instead of three. */
export const WIDE_FONT_SCALE = 1.5;

export interface DoubleChoicesProps {
  /** The choices the engine offers (`VariantPrompt.choices`): `'1'` to `'6'`. */
  choices: readonly string[];
  onChoose: (choice: string) => void;
  testID?: string;
}

export function DoubleChoices({ choices, onChoose, testID = 'choose-double' }: DoubleChoicesProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const perRow = fontScale >= WIDE_FONT_SCALE ? 2 : 3;
  const values = choices.map(Number).filter(isDieValue);
  return (
    <View testID={testID} style={styles.grid}>
      {values.map((value) => {
        const double = t(`game.doubles.name.${value}`);
        return (
          <Pressable
            key={value}
            testID={`${testID}-${value}`}
            accessibilityRole="button"
            accessibilityLabel={t('game.chooseDouble.choice', { double, value })}
            onPress={() => onChoose(String(value))}
            style={({ pressed }) => [styles.button(perRow), pressed && styles.pressed]}>
            <View
              style={styles.dice}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden>
              <DieFace value={value} />
              <DieFace value={value} />
            </View>
            <Text style={styles.name}>{double}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Where the pips of each value sit, on a 3 x 3 grid (0 top left … 8 bottom right). */
const PIPS: Record<DieValue, readonly number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const FACE = 28;
const EDGE = 1;
const PIP = 6;
const INSET = 4;

function DieFace({ value }: { value: DieValue }) {
  return (
    <View style={styles.face}>
      {PIPS[value].map((cell) => (
        <View key={cell} style={[styles.pip(value === 1), pipPlace(cell)]} />
      ))}
    </View>
  );
}

function pipPlace(cell: number) {
  // Inside the edge: absolute views sit in the padding box.
  const step = (FACE - 2 * EDGE - 2 * INSET - PIP) / 2;
  return { left: INSET + (cell % 3) * step, top: INSET + Math.floor(cell / 3) * step };
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  // The width leaves room for the gaps between the buttons of a row.
  button: (perRow: number) => ({
    width: perRow === 2 ? '47%' : '30%',
    flexGrow: 1,
    minHeight: theme.touch.button,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    paddingHorizontal: theme.space.xs,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSelected,
  }),
  pressed: {
    opacity: 0.7,
  },
  dice: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: theme.radii.sm,
    borderWidth: EDGE,
    borderColor: theme.dice.edge,
    backgroundColor: theme.dice.face,
  },
  pip: (ace: boolean) => ({
    position: 'absolute',
    width: PIP,
    height: PIP,
    borderRadius: PIP / 2,
    backgroundColor: ace ? theme.dice.acePip : theme.dice.pip,
  }),
  name: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textAlign: 'center',
  },
}));
