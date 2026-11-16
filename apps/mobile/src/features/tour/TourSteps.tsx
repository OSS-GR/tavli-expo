/**
 * The steps of a try-it page (#573): a short list, each with a ring that
 * turns into a brass check when done. Screen readers hear "Done: …" for a
 * done step.
 */
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';

export interface TourStep {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
}

export function TourSteps({ steps }: { steps: readonly TourStep[] }) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  return (
    <View style={styles.list}>
      {steps.map((step, index) => (
        <View
          key={step.id}
          testID={`tour-step-${step.id}${step.done ? '-done' : ''}`}
          style={styles.row}
          accessible
          accessibilityLabel={step.done ? t('tour.stepDone', { step: step.label }) : step.label}>
          <View style={styles.mark(step.done)}>
            {step.done ? (
              <Icon name="check" size={14} color={theme.colors.onAccent} />
            ) : (
              <Text style={styles.number}>{index + 1}</Text>
            )}
          </View>
          <Text style={styles.label(step.done)}>{step.label}</Text>
        </View>
      ))}
    </View>
  );
}

const MARK = 22;

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  mark: (done: boolean) => ({
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: 1.5,
    borderColor: done ? theme.colors.accent : theme.colors.border,
    backgroundColor: done ? theme.colors.accent : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  number: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  label: (done: boolean) => ({
    ...theme.type.body,
    flexShrink: 1,
    color: done ? theme.colors.textDim : theme.colors.text,
  }),
}));
