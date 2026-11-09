/**
 * A yes / no dialog (wireframe 13), for the resign dialogs, New game and
 * History. Show it in a `Sheet` with `look="dialog"`.
 */
import type { Ref } from 'react';
import type { HostInstance } from 'react-native';

import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  title: string;
  lines: readonly string[];
  /** A boxed line, for example the match score after a resign. */
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * A ref for the title, for example from `useFocusOnShow`: a dialog whose
   * text must be read first moves screen reader focus there (#315).
   */
  titleRef?: Ref<HostInstance>;
  testID?: string;
}

/**
 * The risky action is outlined; the safe one is the main button, nearest
 * the thumb (wireframe 13).
 */
export function ConfirmDialog({
  title,
  lines,
  note,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  titleRef,
  testID,
}: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      lines={lines}
      {...(note ? { note } : {})}
      {...(titleRef ? { titleRef } : {})}
      {...(testID ? { testID } : {})}>
      <ActionButton
        testID="dialog-confirm"
        label={confirmLabel}
        kind="secondary"
        onPress={onConfirm}
      />
      <ActionButton testID="dialog-cancel" label={cancelLabel} onPress={onCancel} />
    </Dialog>
  );
}
