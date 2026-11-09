/**
 * Report or block another player (#435, App Store guideline 1.2). One
 * dialog in a `Sheet`, in steps:
 *
 * 1. **Choose**: Block or Report (or Cancel).
 * 2. **Block**: a short confirm, then `Safety.block`.
 *    **Report**: one reason from `REPORT_REASONS`, then `Safety.report`
 *    (a report blocks too). No free text.
 * 3. **Done**, or **failed** with what went wrong and, when it may help,
 *    Try again.
 *
 * The online game menu, the end of an online match and History's Online
 * section open it. Each step moves screen reader focus to its title
 * (`useFocusOnShow`). Nothing goes to analytics: no name, id or reason.
 *
 * The dialog keeps the name it opened with: after a block the server no
 * longer sends it, and the screen under it shows "Opponent".
 */
import {
  MAX_BLOCKS,
  MAX_REPORTS_PER_DAY,
  REPORT_REASONS,
  isSafetyErrorData,
  type PlayerName,
  type ReportReason,
  type Safety,
} from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { Dialog } from '@/components/Dialog';
import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { playerNameText } from '@/features/online/playerName';

/** The player to report or block: their id and the name the screen shows. */
export interface SafetyPlayer {
  readonly id: string;
  readonly name: PlayerName | null;
}

/** What failed: the code says what the text tells the user. */
type FailKind = 'tooManyBlocks' | 'tooManyReports' | 'unknownPlayer' | 'signedOut' | 'other';

type Action =
  { readonly kind: 'block' } | { readonly kind: 'report'; readonly reason: ReportReason };

type Step =
  | { readonly kind: 'choose' }
  | { readonly kind: 'block' }
  | { readonly kind: 'report' }
  | { readonly kind: 'sending'; readonly action: Action }
  | { readonly kind: 'done'; readonly action: Action }
  | { readonly kind: 'failed'; readonly action: Action; readonly fail: FailKind };

/** The text for a rejected call. */
export function failKind(error: unknown): FailKind {
  if (!isSafetyErrorData(error)) return 'other';
  switch (error.code) {
    case 'TOO_MANY_BLOCKS':
      return 'tooManyBlocks';
    case 'TOO_MANY_REPORTS':
      return 'tooManyReports';
    case 'UNKNOWN_PLAYER':
      return 'unknownPlayer';
    case 'NOT_SIGNED_IN':
      return 'signedOut';
    case 'BAD_REQUEST':
      return 'other';
  }
}

/** Try again helps only when the call may work the next time. */
function mayRetry(fail: FailKind): boolean {
  return fail === 'other';
}

/** "Guest 4821", a username, or "this player" when the server sends no name. */
export function safetyName(name: PlayerName | null, t: TFunction): string {
  return playerNameText(name, t) ?? t('safety.thisPlayer');
}

export interface ReportOrBlockProps {
  player: SafetyPlayer;
  safety: Safety;
  onClose: () => void;
}

/** The steps of the dialog. Show it in a `Sheet` (`ReportOrBlockSheet`). */
export function ReportOrBlock({ player, safety, onClose }: ReportOrBlockProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const name = safetyName(player.name, t);

  const run = (action: Action) => {
    setStep({ kind: 'sending', action });
    const call =
      action.kind === 'block'
        ? safety.block(player.id)
        : safety.report({ playerId: player.id, reason: action.reason });
    call.then(
      () => {
        if (live.current) setStep({ kind: 'done', action });
      },
      (error: unknown) => {
        if (live.current) setStep({ kind: 'failed', action, fail: failKind(error) });
      },
    );
  };

  // A new key per step: each step mounts again, and its title gets focus.
  return (
    <StepView
      key={step.kind}
      step={step}
      name={name}
      onRun={run}
      onStep={setStep}
      onClose={onClose}
    />
  );
}

interface StepViewProps {
  step: Step;
  name: string;
  onRun: (action: Action) => void;
  onStep: (step: Step) => void;
  onClose: () => void;
}

function StepView({ step, name, onRun, onStep, onClose }: StepViewProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const cancel = (
    <ActionButton testID="safety-cancel" label={t('safety.cancel')} onPress={onClose} />
  );
  switch (step.kind) {
    case 'choose':
      return (
        <Dialog
          testID="safety-choose"
          titleRef={titleRef}
          title={t('safety.choose.title', { name })}
          lines={[t('safety.choose.block'), t('safety.choose.report')]}>
          <ActionButton
            testID="safety-block"
            kind="secondary"
            label={t('safety.block')}
            accessibilityLabel={t('safety.blockLabel', { name })}
            onPress={() => onStep({ kind: 'block' })}
          />
          <ActionButton
            testID="safety-report"
            kind="secondary"
            label={t('safety.report')}
            accessibilityLabel={t('safety.reportLabel', { name })}
            onPress={() => onStep({ kind: 'report' })}
          />
          {cancel}
        </Dialog>
      );
    case 'block':
      return (
        <Dialog
          testID="safety-block-confirm"
          titleRef={titleRef}
          title={t('safety.blockConfirm.title', { name })}
          lines={[t('safety.blockConfirm.invites'), t('safety.blockConfirm.more')]}>
          <ActionButton
            testID="safety-block-yes"
            kind="secondary"
            label={t('safety.block')}
            accessibilityLabel={t('safety.blockLabel', { name })}
            onPress={() => onRun({ kind: 'block' })}
          />
          {cancel}
        </Dialog>
      );
    case 'report':
      return (
        <Dialog
          testID="safety-reasons"
          titleRef={titleRef}
          title={t('safety.reasons.title', { name })}
          lines={[t('safety.reasons.body')]}>
          {REPORT_REASONS.map((reason) => (
            <ActionButton
              key={reason}
              testID={`safety-reason-${reason}`}
              kind="secondary"
              label={t(`safety.reasons.${reason}`)}
              onPress={() => onRun({ kind: 'report', reason })}
            />
          ))}
          {cancel}
        </Dialog>
      );
    case 'sending':
      return (
        <Dialog testID="safety-sending" titleRef={titleRef} title={t('safety.sending')} lines={[]}>
          <ActivityIndicator />
        </Dialog>
      );
    case 'done':
      return (
        <Dialog
          testID="safety-done"
          titleRef={titleRef}
          title={
            step.action.kind === 'block'
              ? t('safety.blocked.title', { name })
              : t('safety.reported.title')
          }
          lines={
            step.action.kind === 'block'
              ? [t('safety.blocked.body')]
              : [t('safety.reported.body', { name }), t('safety.blocked.body')]
          }>
          <ActionButton testID="safety-close" label={t('safety.done')} onPress={onClose} />
        </Dialog>
      );
    case 'failed':
      return (
        <Dialog
          testID="safety-failed"
          titleRef={titleRef}
          title={t('safety.failed.title')}
          lines={[
            t(`safety.failed.${step.fail}`, {
              max: step.fail === 'tooManyBlocks' ? MAX_BLOCKS : MAX_REPORTS_PER_DAY,
            }),
          ]}>
          {mayRetry(step.fail) ? (
            <ActionButton
              testID="safety-retry"
              kind="secondary"
              label={t('safety.failed.retry')}
              onPress={() => onRun(step.action)}
            />
          ) : null}
          <ActionButton testID="safety-close" label={t('safety.close')} onPress={onClose} />
        </Dialog>
      );
  }
}

export interface ReportOrBlockSheetProps {
  /** The player to report or block. `null`: the sheet is closed. */
  player: SafetyPlayer | null;
  safety: Safety;
  onClose: () => void;
}

/** `ReportOrBlock` in its own dialog sheet, for screens with no sheet of their own. */
export function ReportOrBlockSheet({ player, safety, onClose }: ReportOrBlockSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={player !== null} onClose={onClose} closeLabel={t('safety.close')} look="dialog">
      {player !== null ? <ReportOrBlock player={player} safety={safety} onClose={onClose} /> : null}
    </Sheet>
  );
}
