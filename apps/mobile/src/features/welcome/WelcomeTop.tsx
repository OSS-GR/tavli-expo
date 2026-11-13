/**
 * The top row of the welcome steps (#362, Figma frame 12): the step bars in
 * the middle (one bar per step, brass up to this one) and the round back
 * button on the left. Screen readers hear the bars as one item, "Step 2 of
 * 3". The first step has no back button; the row keeps its height, so the
 * bars stay in the same place on every step.
 */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { RoundButton } from '@/components/RoundButton';

export interface WelcomeTopProps {
  /** This step, from 1. */
  step: number;
  /** How many steps this player has (2 or 3). */
  total: number;
  /** Goes back. Without it the left side is empty (the first step). */
  onBack?: () => void;
  /** The back button's test id. */
  backTestID?: string;
}

export function WelcomeTop({ step, total, onBack, backTestID }: WelcomeTopProps) {
  const { t } = useTranslation();
  const bars = Array.from({ length: total }, (_, index) => index < step);
  return (
    <View style={styles.row}>
      <View
        testID="welcome-steps"
        style={styles.bars}
        accessible
        accessibilityLabel={t('welcome.privacy.step', { step, total })}>
        {bars.map((done, index) => (
          <View key={index} style={styles.bar(done)} />
        ))}
      </View>
      {onBack ? (
        <View style={styles.back}>
          <RoundButton
            testID={backTestID}
            icon="chevronLeft"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
          />
        </View>
      ) : null}
    </View>
  );
}

const BAR_WIDTH = 28;
const BAR_HEIGHT = 4;

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
  },
  bars: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 6,
    // A taller box than the bars, so the one item is easy to find by touch.
    paddingVertical: theme.space.sm,
  },
  bar: (done: boolean) => ({
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: done ? theme.colors.accent : theme.colors.edgeLight,
  }),
  back: {
    position: 'absolute',
    left: theme.space.lg,
    top: 0,
  },
}));
