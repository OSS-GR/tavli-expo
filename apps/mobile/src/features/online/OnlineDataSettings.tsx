/**
 * The "Delete my online data" row of Settings (#315), in the Privacy card.
 * Settings shows it only when this phone used online play
 * (`hasOnlineAccount()`). The app shows no account, so the row never says
 * "account".
 *
 * A tap opens a confirm dialog that says what happens: games in progress
 * are resigned, open invites are cancelled, turn notifications stop, and
 * finished games stay with no name. Delete runs `deleteOnlineData`
 * (`deleteData.ts`). The row then shows the progress, the error (try
 * again with the same row) or the end. A screen reader hears each of
 * them (`useAnnouncement`), and the dialog moves focus to its title.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SectionRow } from '@/components/SectionCard';
import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { deleteOnlineData, type OnlineDataDeps } from './deleteData';

type Phase = 'idle' | 'deleting' | 'failed' | 'done';

export function OnlineDataSettings({ deps }: { deps: OnlineDataDeps }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');

  const status =
    phase === 'deleting'
      ? t('settings.onlineData.deleting')
      : phase === 'failed'
        ? t('settings.onlineData.failed')
        : phase === 'done'
          ? t('settings.onlineData.done')
          : null;
  useAnnouncement(status);

  const remove = () => {
    setAsking(false);
    setPhase('deleting');
    deleteOnlineData(deps).then(
      () => setPhase('done'),
      () => setPhase('failed'),
    );
  };

  return (
    <>
      {phase === 'done' ? (
        <SectionRow
          testID="settings-online-data"
          icon="trash"
          label={t('settings.onlineData.done')}
          hint={t('settings.onlineData.doneHint')}
        />
      ) : (
        <SectionRow
          testID="settings-online-data"
          icon="trash"
          label={t('settings.onlineData.label')}
          hint={status ?? t('settings.onlineData.hint')}
          disabled={phase === 'deleting'}
          onPress={() => setAsking(true)}
        />
      )}
      <Sheet
        visible={asking}
        onClose={() => setAsking(false)}
        closeLabel={t('common.cancel')}
        look="dialog">
        <OnlineDataDialog onConfirm={remove} onCancel={() => setAsking(false)} />
      </Sheet>
    </>
  );
}

/** The dialog. Its own component, so each opening focuses the title again. */
function OnlineDataDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  return (
    <ConfirmDialog
      testID="online-data-dialog"
      titleRef={titleRef}
      title={t('settings.onlineData.confirmTitle')}
      lines={[
        t('settings.onlineData.confirmGames'),
        t('settings.onlineData.confirmInvites'),
        t('settings.onlineData.confirmPushes'),
        t('settings.onlineData.confirmKept'),
      ]}
      confirmLabel={t('settings.onlineData.confirm')}
      cancelLabel={t('common.cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
