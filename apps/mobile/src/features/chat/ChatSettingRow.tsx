/**
 * Settings → Online → "Chat in online games" (ADR-0011 item 11, #692):
 * the switch that turns chat off in all the player's games. The server
 * keeps it (`Chat.setEnabled`), so it holds on every phone of the account.
 *
 * - The row shows once the setting loaded. A phone that never signed in,
 *   or a load that failed, shows no row.
 * - One call at a time. A failed call keeps the switch and opens the
 *   problem popup (`ProblemDialog`, #462).
 */
import type { Chat } from '@tavli/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProblemDialog } from '@/components/Problem';
import { ToggleRow } from '@/components/settings/ToggleRow';

export interface ChatSettingRowProps {
  chat: Chat;
  /** Changes each time Settings shows again: the row loads again. */
  visit: number;
}

export function ChatSettingRow({ chat, visit }: ChatSettingRowProps) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    chat.settings().then(
      (settings) => {
        if (live) setEnabled(settings.enabled);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [chat, visit]);

  if (enabled === null) return null;

  const change = (next: boolean) => {
    if (busy) return;
    setBusy(true);
    chat.setEnabled(next).then(
      () => {
        setEnabled(next);
        setBusy(false);
      },
      () => {
        setFailed(true);
        setBusy(false);
      },
    );
  };

  return (
    <>
      <ToggleRow
        testID="settings-chat"
        icon="messageCircle"
        label={t('settings.chat.label')}
        hint={t('settings.chat.hint')}
        value={enabled}
        onValueChange={change}
      />
      <ProblemDialog
        testID="settings-chat-problem"
        problem={
          failed
            ? { title: t('settings.chat.problemTitle'), text: t('settings.chat.problemText') }
            : null
        }
        okLabel={t('problem.ok')}
        onOk={() => setFailed(false)}
      />
    </>
  );
}
