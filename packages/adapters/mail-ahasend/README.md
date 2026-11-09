# @tavli/mail-ahasend

The `MailSender` port (`@tavli/contracts`) on [AhaSend](https://ahasend.com)'s v2 API. The server sends the email sign-in code with it (`apps/server/convex/mail.ts`, #399). Decision: [ADR-0008](../../../docs/decisions/0008-accounts.md) (point 12): AhaSend B.V. is in Amsterdam, keeps the data in the EU, and has a data processing agreement and a free plan with no card.

It has no vendor SDK: it uses `fetch` only, so it runs in Convex.

## What it does

- **`createAhaSendMailSender({ fetch, apiKey, accountId, from, sandbox?, api?, timeoutMs? })`** POSTs one message to `https://api.ahasend.com/v2/accounts/<accountId>/messages` with `Authorization: Bearer <apiKey>`: the sender, one recipient, the subject, the text and the HTML. Open and click tracking are off, and AhaSend keeps no content (`retention: { metadata: 1, data: 0 }`). `sandbox: true` makes AhaSend answer without delivering.
- **A time limit.** A request that takes more than `timeoutMs` (default `AHASEND_TIMEOUT_MS`, 10 s) is cut off and gives `Failed`.
- **Our codes, never AhaSend's text.** `202` with the message `queued` or `scheduled` is `{ ok: true }`; the message `error` is `Rejected`. HTTP `400`, `413`, `422` are `Rejected`; `401`, `403`, `404` are `InvalidCredentials`; `409`, `429` are `RateLimited`; the rest `Failed`. The message never holds AhaSend's answer, so no address reaches a log.
- **Never rejects.** A network error or an answer it cannot read is `Failed`.

## Setup

The owner signs up, verifies the domain and sets the Convex env vars: see "Email code" in [running the app](../../../docs/process/running-the-app.md#email-code-399). Never put the key in the repo.

## Files

| File                 | Job                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------ |
| `src/sender.ts`      | `createAhaSendMailSender`: the port on `fetch`                                       |
| `src/sender.test.ts` | The `mailSenderContract` checks and AhaSend's format, on a fake `fetch` (no network) |
