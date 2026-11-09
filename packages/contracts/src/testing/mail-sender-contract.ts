/**
 * The `MailSender` port contract (#399), as plain async checks that work
 * in any test runner.
 *
 *   for (const check of mailSenderContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check. Its mail service must be a fake (no
 * network, never real mail): a mail to `refusedAddress` is refused, and a
 * mail to any other address goes out. A check rejects with an `Error`
 * when the sender breaks the contract.
 */
import { isMailErrorCode } from '../mail';
import type { MailMessage, MailResult, MailSender } from '../mail';

export interface MailSenderContractSubject {
  /** The sender under test, on a fake mail service. */
  readonly mail: MailSender;
  /** The service refuses a mail to this address (`Rejected`). */
  readonly refusedAddress: string;
  /**
   * The same sender on a mail service that fails every request (for
   * example, `fetch` rejects). Leave it out only when the sender has no
   * service at all (the recording sender).
   */
  readonly broken?: MailSender;
}

export interface MailSenderContractCheck {
  readonly name: string;
  readonly run: (subject: MailSenderContractSubject) => Promise<void>;
}

function message(to: string): MailMessage {
  return {
    to,
    subject: 'Tavlaki sign-in',
    text: 'Your code is 123456.',
    html: '<p>Your code is <b>123456</b>.</p>',
  };
}

async function sent(mail: MailSender, to: string, what: string): Promise<MailResult> {
  let result: MailResult;
  try {
    result = await mail.send(message(to));
  } catch (error) {
    throw new Error(`${what}: send rejected (${String(error)})`, { cause: error });
  }
  if (typeof result !== 'object' || result === null) throw new Error(`${what}: no result`);
  if (!result.ok) {
    if (!isMailErrorCode(result.error)) {
      throw new Error(`${what}: unknown error ${JSON.stringify(result.error)}`);
    }
    if (typeof result.message !== 'string') throw new Error(`${what}: no message text`);
  }
  if (JSON.stringify(JSON.parse(JSON.stringify(result))) !== JSON.stringify(result)) {
    throw new Error(`${what}: the result is not plain JSON`);
  }
  return result;
}

export function mailSenderContract(): MailSenderContractCheck[] {
  return [
    {
      name: 'a mail to a good address is ok',
      run: async ({ mail }) => {
        const result = await sent(mail, 'player@example.com', 'send');
        if (!result.ok) throw new Error(`send: expected ok, got ${result.error}`);
      },
    },
    {
      name: 'a refused address gets Rejected, and the next mail still goes out',
      run: async ({ mail, refusedAddress }) => {
        const refused = await sent(mail, refusedAddress, 'send to the refused address');
        if (refused.ok || refused.error !== 'Rejected') {
          throw new Error(
            `send to the refused address: expected Rejected, got ${refused.ok ? 'ok' : refused.error}`,
          );
        }
        const next = await sent(mail, 'player@example.com', 'the next send');
        if (!next.ok) throw new Error(`the next send: expected ok, got ${next.error}`);
      },
    },
    {
      name: 'a broken service never rejects: the mail gets an error result',
      run: async ({ broken }) => {
        if (broken === undefined) return;
        const result = await sent(broken, 'player@example.com', 'send on a broken service');
        if (result.ok) throw new Error('send on a broken service: the result is ok');
      },
    },
  ];
}
