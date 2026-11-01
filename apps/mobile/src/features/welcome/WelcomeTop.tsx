/**
 * The top row of the welcome steps (#362): the round back button, the app
 * logo with its name in the middle (as on Home), and the step ("Step 2 of
 * 3") on the right. Both sides take the same share of the row, so the logo
 * stays in the middle. The logo and the name only decorate: screen readers
 * skip them, and each step's own title is its header.
 */
import { useTranslation } from 'react-i18next';
import { Image, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { RoundButton } from '@/components/RoundButton';

const LOGO = require('../../../assets/home/logo.webp') as number;

export interface WelcomeTopProps {
  /** Goes back. Without it the left side is empty (the first step). */
  onBack?: () => void;
  /** The back button's test id. */
  backTestID?: string;
  /** The step text on the right. */
  step?: string;
}

export function WelcomeTop({ onBack, backTestID, step }: WelcomeTopProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {onBack ? (
          <RoundButton
            testID={backTestID}
            icon="chevronLeft"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
          />
        ) : null}
      </View>
      <View
        style={styles.brand}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Image source={LOGO} style={styles.logo} accessible={false} />
        <Text style={styles.appName}>{t('home.title')}</Text>
      </View>
      <View style={[styles.side, styles.right]}>
        {step ? <Text style={styles.step}>{step}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.sm,
  },
  side: {
    flex: 1,
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  right: {
    alignItems: 'flex-end',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  // As on Home (#342).
  logo: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  appName: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  step: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'right',
  },
}));
