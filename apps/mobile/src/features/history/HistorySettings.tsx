/**
 * The History rows of Settings (#142): open the history, and clear it
 * after a confirm step. Clearing only deletes the records on this phone.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Sheet } from '@/components/Sheet';

import { historyStore, useHistory } from './store';

export interface HistorySettingsProps {
  /** Opens the history screen. */
  onOpen: () => void;
}

export function HistorySettings({ onOpen }: HistorySettingsProps) {
  const { t } = useTranslation();
  const empty = useHistory((s) => s.records.length === 0);
  const [asking, setAsking] = useState(false);

  return (
    <>
      <Pressable
        testID="settings-history"
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text style={styles.linkText}>{`${t('settings.history.open')} ›`}</Text>
      </Pressable>
      <Pressable
        testID="settings-clear-history"
        accessibilityRole="button"
        accessibilityState={{ disabled: empty }}
        disabled={empty}
        onPress={() => setAsking(true)}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text style={[styles.linkText, empty && styles.disabled]}>
          {t('settings.history.clear')}
        </Text>
      </Pressable>
      {empty ? <Text style={styles.hint}>{t('settings.history.empty')}</Text> : null}
      <Sheet
        visible={asking}
        onClose={() => setAsking(false)}
        closeLabel={t('common.cancel')}
        look="dialog">
        <ConfirmDialog
          testID="clear-history-dialog"
          title={t('settings.history.confirmTitle')}
          lines={[t('settings.history.confirmBody')]}
          confirmLabel={t('settings.history.confirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            setAsking(false);
            historyStore.getState().clear();
          }}
          onCancel={() => setAsking(false)}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  link: {
    minHeight: theme.touch.row,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  linkText: {
    ...theme.type.body,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  disabled: {
    color: theme.colors.textDisabled,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
