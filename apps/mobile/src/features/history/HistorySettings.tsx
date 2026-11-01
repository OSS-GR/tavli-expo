/**
 * The History rows of Settings (#142): open the history, and clear it
 * after a confirm step. Clearing only deletes the records on this phone.
 * Both are rows of the History card (#360), with a line between them.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RowDivider, SectionRow } from '@/components/SectionCard';
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
      <SectionRow
        testID="settings-history"
        icon="history"
        label={t('settings.history.open')}
        onPress={onOpen}
      />
      <RowDivider />
      <SectionRow
        testID="settings-clear-history"
        icon="trash"
        label={t('settings.history.clear')}
        hint={empty ? t('settings.history.empty') : undefined}
        disabled={empty}
        onPress={() => setAsking(true)}
      />
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
