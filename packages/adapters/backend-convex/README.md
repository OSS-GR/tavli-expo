# @tavli/backend-convex

The `GameTransport` and `Invites` ports (`@tavli/contracts`) on the [Convex](https://www.convex.dev/) client. They call the functions in `apps/server/convex/games.ts` and `invites.ts`. Decision: [ADR-0004](../../../docs/decisions/0004-backend-auth.md) (point 9). Issues: #253 (games), #281 (invites).

Version: `convex` 1.46.0, a peer dependency (the app installs it). Keep it on the same version as `apps/server`.

## What it does

- **No player id in the calls.** The Convex client sends the sign-in token (`setAuth`), and the server reads the caller from it (`identity.subject`, #131). Online play needs a signed-in user (a guest is enough).
- **Sign-in changes.** Convex asks for a token on `setAuth`, and again only when the server refuses one; a first `null` (nobody signed in yet) leaves the client signed out for good. So `createConvexClient` calls `setAuth` again on each `auth.onChange` (#281): a guest made after the client opened is signed in at once.
- **`subscribe`** watches the `getGame` query. Each result goes to `onView`. A `null` result (no such game) goes to `onError` as `NOT_FOUND`. Neither is ever called inside `subscribe`, or after its stop function: each result waits one microtask.
- **`listMyGames({ status })`** (#296) runs the `listMyGames` query once (`client.query`) and resolves with a copy of the list: the caller's games with that status, newest change first, at most 50. It is a call, not a live list: call it again to see changes.
- **`watchMyGames({ status }, onList, onError)`** (#297) is the live list: it watches the same query (`client.onUpdate`). Each list is a copy and waits one microtask, so nothing arrives inside the call or after the stop function. Errors map like the calls.
- **`sendTurn` / `sendAnswer`** call `makeMove` / `answer` and resolve once the mutation resolves (the Convex client has the new view by then). When the turn time ran out first, the server saves the time out and returns `{ ok: false, error: { code: 'TIMED_OUT' } }`; the adapter rejects with that data. **`resign`** calls `resign`.
- **Errors.** A server error is a `ConvexError` whose `data` is `GameTransportErrorData`: the adapter rejects (or calls `onError`) with that data, as a plain object. Every server code maps the same way, `NOT_SIGNED_IN` too. Any other error (the network, a bad argument) stays as it is.
- **Moves are copied** with only the fields the server takes (`from`, `to`, `die`, `capture`). The server checks its arguments strictly, so an extra field would fail the call.

### Invites (#281)

- **`createConvexInvites({ client })`** needs `onUpdate`, `mutation` and `query` (`ConvexInvitesClient`; `ConvexClient` has all three).
- **`createInvite`** sends only `choice`, `targetPoints` and `pace`, and resolves with the code. **`getInvite`** and **`listMyInvites`** run a query once. **`acceptInvite`**, **`declineInvite`** and **`cancelInvite`** call their mutations with the code.
- **`watchInvite`** watches `getInvite`, like `subscribe`: each view (or `null`) waits one microtask, and nothing arrives after the stop function.
- **Views are copies**: the Convex client shares one cached object between watchers.
- **Errors.** A `ConvexError` with `InviteErrorData` rejects (or goes to `onError`) with `{ code, message }` (`toInviteError`), `NOT_SIGNED_IN` and `TOO_MANY_INVITES` too. Any other error stays as it is.

## Files

| File                    | Job                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/transport.ts`      | `createConvexGameTransport({ client })`: the port on any object with `onUpdate`, `query` and `mutation` (`ConvexGameClient`)                |
| `src/functions.ts`      | `GAME_FUNCTIONS` and `INVITE_FUNCTIONS`: typed references to the server functions, by name (`GAME_FUNCTION_NAMES`, `INVITE_FUNCTION_NAMES`) |
| `src/invites.ts`        | `createConvexInvites({ client })`: the `Invites` port, and `toInviteError`                                                                  |
| `src/client.ts`         | `createConvexGameTransportFromUrl(url, auth)`, `createConvexClient(url, auth)` and `authTokenFetcher(auth)`                                 |
| `src/transport.test.ts` | The mapping on a fake client: views, `NOT_FOUND`, errors, `TIMED_OUT`, unsubscribe, `listMyGames`, `watchMyGames`                           |
| `src/client.test.ts`    | The token fetcher and the URL factory (`convex/browser` mocked, no socket)                                                                  |
| `src/invites.test.ts`   | The invites mapping on a fake client: arguments, copies, errors, `watchInvite` and its stop                                                 |

The contract checks (`gameTransportContract`) run in `apps/server`, against the real Convex functions with convex-test: `apps/server/convex/convexTransport.test.ts`. That file also checks `GAME_FUNCTIONS` against the server's generated `api`, in name and type. The `Invites` contract checks (`invitesContract`) and the `INVITE_FUNCTIONS` check run the same way in `apps/server/convex/convexInvites.test.ts`. Both use the fake clients in `apps/server/convex/test.network.ts`.

### Why names, not the generated `api`

The adapter does not import `apps/server/convex/_generated/api`. Its types pull in every server module (and Better Auth), so the app's type check would compile the server. And `apps/server` depends on this package for its tests, so the import would make a cycle. If you rename or change a function in `games.ts` or `invites.ts`, change `src/functions.ts` too: the server tests fail until they match.

## How the app uses it

`apps/mobile/src/services.ts` makes it (#266), through `createOnlineServices` (`apps/mobile/src/onlineServices.ts`):

```ts
createClient: createConvexClient, // (server.url, auth): one ConvexClient per app
createGames: (client) => createConvexGameTransport({ client }),
createInvites: (client) => createConvexInvites({ client }), // #281
```

- `services.ts` exports the transport as `games`. It is `undefined` when the build has no Convex URL: then online play is off, and a screen checks `games === undefined`.
- The `ConvexClient` opens its socket on the first call to `games`, not at app start. It sends the token of `auth` (`@tavli/auth-better-auth`). With nobody signed in, calls fail `NOT_SIGNED_IN`.
- `services.ts` exports the invites as `invites` (#281), on the same client (one socket). Dev invites stay on the in-memory server.
- `createConvexGameTransportFromUrl(url, auth)` does both steps in one call, for a tool or a test that needs no shared client.

## Setup

- The deployment URL comes from `convexUrl()` (`apps/mobile/src/convexUrl.ts`): `app.config.ts` sets it per app variant, and `EXPO_PUBLIC_CONVEX_URL` wins. See "Which server the app uses" in `docs/process/running-the-app.md`.
- The sign-in setup is in [`../auth-better-auth/README.md`](../auth-better-auth/README.md).
