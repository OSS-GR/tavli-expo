# @tavli/backend-convex

The `GameTransport` port (`@tavli/contracts`) on the [Convex](https://www.convex.dev/) client. It calls the functions in `apps/server/convex/games.ts`. Decision: [ADR-0004](../../../docs/decisions/0004-backend-auth.md) (point 9). Issue: #253.

Version: `convex` 1.46.0, a peer dependency (the app installs it). Keep it on the same version as `apps/server`.

## What it does

- **No player id in the calls.** The Convex client sends the sign-in token (`setAuth`), and the server reads the caller from it (`identity.subject`, #131). Online play needs a signed-in user (a guest is enough).
- **`subscribe`** watches the `getGame` query. Each result goes to `onView`. A `null` result (no such game) goes to `onError` as `NOT_FOUND`. Neither is ever called inside `subscribe`, or after its stop function: each result waits one microtask.
- **`sendTurn` / `sendAnswer`** call `makeMove` / `answer` and resolve once the mutation resolves (the Convex client has the new view by then). When the turn time ran out first, the server saves the time out and returns `{ ok: false, error: { code: 'TIMED_OUT' } }`; the adapter rejects with that data. **`resign`** calls `resign`.
- **Errors.** A server error is a `ConvexError` whose `data` is `GameTransportErrorData`: the adapter rejects (or calls `onError`) with that data, as a plain object. Every server code maps the same way, `NOT_SIGNED_IN` too. Any other error (the network, a bad argument) stays as it is.
- **Moves are copied** with only the fields the server takes (`from`, `to`, `die`, `capture`). The server checks its arguments strictly, so an extra field would fail the call.

## Files

| File                    | Job                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/transport.ts`      | `createConvexGameTransport({ client })`: the port on any object with `onUpdate` and `mutation` (`ConvexGameClient`) |
| `src/functions.ts`      | `GAME_FUNCTIONS`: typed references to the server functions, by name (`GAME_FUNCTION_NAMES`)                         |
| `src/client.ts`         | `createConvexGameTransportFromUrl(url, auth)`, `createConvexClient(url, auth)` and `authTokenFetcher(auth)`         |
| `src/transport.test.ts` | The mapping on a fake client: views, `NOT_FOUND`, errors, `TIMED_OUT`, unsubscribe                                  |
| `src/client.test.ts`    | The token fetcher and the URL factory (`convex/browser` mocked, no socket)                                          |

The contract checks (`gameTransportContract`) run in `apps/server`, against the real Convex functions with convex-test: `apps/server/convex/convexTransport.test.ts`. That file also checks `GAME_FUNCTIONS` against the server's generated `api`, in name and type.

### Why names, not the generated `api`

The adapter does not import `apps/server/convex/_generated/api`. Its types pull in every server module (and Better Auth), so the app's type check would compile the server. And `apps/server` depends on this package for its tests, so the import would make a cycle. If you rename or change a function in `games.ts`, change `src/functions.ts` too: the server test fails until they match.

## How the app uses it

`apps/mobile/src/services.ts` makes it (#266), through `createOnlineServices` (`apps/mobile/src/onlineServices.ts`):

```ts
createClient: createConvexClient, // (server.url, auth): one ConvexClient per app
createGames: (client) => createConvexGameTransport({ client }),
```

- `services.ts` exports the transport as `games`. It is `undefined` when the build has no Convex URL: then online play is off, and a screen checks `games === undefined`.
- The `ConvexClient` opens its socket on the first call to `games`, not at app start. It sends the token of `auth` (`@tavli/auth-better-auth`). With nobody signed in, calls fail `NOT_SIGNED_IN`.
- Later the invite calls take the same client (one socket).
- `createConvexGameTransportFromUrl(url, auth)` does both steps in one call, for a tool or a test that needs no shared client.

## Setup

- The deployment URL comes from `convexUrl()` (`apps/mobile/src/convexUrl.ts`): `app.config.ts` sets it per app variant, and `EXPO_PUBLIC_CONVEX_URL` wins. See "Which server the app uses" in `docs/process/running-the-app.md`.
- The sign-in setup is in [`../auth-better-auth/README.md`](../auth-better-auth/README.md).
