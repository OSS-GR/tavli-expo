import { describe, expect, it } from 'vitest';

import { createRecordingMailSender } from './mail';
import { mailSenderContract } from './testing/mail-sender-contract';

const REFUSED = 'refused@example.com';

function subject() {
  const mail = createRecordingMailSender();
  mail.fail(REFUSED, 'Rejected');
  return { mail, refusedAddress: REFUSED };
}

describe('the recording mail sender', () => {
  for (const check of mailSenderContract()) {
    it(check.name, () => check.run(subject()));
  }

  it('records every mail, fails until revive, and clears', async () => {
    const mail = createRecordingMailSender();
    const message = { to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' };
    mail.fail('a@example.com');
    expect(await mail.send(message)).toMatchObject({ ok: false, error: 'Failed' });
    mail.revive('a@example.com');
    expect(await mail.send(message)).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(2);
    mail.clear();
    expect(mail.sent).toEqual([]);
  });
});
