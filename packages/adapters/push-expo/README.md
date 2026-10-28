# @tavli/push-expo

The `PushProvider` port (`@tavli/contracts`) on the [Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/). The Convex functions in `apps/server/convex/push.ts` use it to send "your turn" pushes. Decision: [ADR-0004](../../../docs/decisions/0004-backend-auth.md) (point 7). Issue: #280.

It has no vendor SDK: it uses `fetch` only, so it runs in a Convex action.

## What it does

- **`createExpoPushProvider({ fetch, accessToken?, url? })`** POSTs the messages to `https://exp.host/--/api/v2/push/send`, at most 100 per request (`EXPO_PUSH_BATCH`), one request after the other. Each message goes out as `{ to, title, body, data: { gameId }, sound: 'default' }`.
- **One result per message, in order.** Expo answers one "push ticket" per message. An `ok` ticket gives `{ ok: true }`. An `error` ticket gives `{ ok: false, error, message }`: Expo's `details.error` maps to our code (`DeviceNotRegistered`, `MessageTooBig`, `MessageRateExceeded`, `InvalidCredentials`; `MismatchSenderId` is `InvalidCredentials` too), anything else is `Failed`.
- **Never rejects.** A network error, an HTTP error, or an answer without one ticket per message makes every message of that batch `Failed`. The next batch still goes out.
- **`isExpoPushToken(value)`** checks the token shape: `ExponentPushToken[…]` or `ExpoPushToken[…]`, no spaces or brackets inside, at most 200 characters. The server checks every token with it before it saves one.

## Access token

Not needed now. If push security is turned on for the Expo project, pass `accessToken`: the server reads it from the Convex env var `EXPO_ACCESS_TOKEN` (`npx convex env set`). Never put it in the repo.

## Not done yet

- **Push receipts.** Expo can also report a dead token later, in a receipt (a second call with the ticket ids). The adapter reads only the tickets.

## Files

| File                   | Job                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `src/provider.ts`      | `createExpoPushProvider`: the port on `fetch`                                         |
| `src/token.ts`         | `isExpoPushToken`                                                                     |
| `src/provider.test.ts` | The `pushProviderContract` checks and the Expo format, on a fake `fetch` (no network) |
| `src/token.test.ts`    | The token shapes                                                                      |
