# @tavli/auth-better-auth

The `AuthProvider` port (`@tavli/contracts`) backed by the [Better Auth](https://www.better-auth.com/) Expo client. The server side is the Better Auth Convex component (`@convex-dev/better-auth`) in `apps/server/convex/auth.ts`. Decision: [ADR-0004](../../../docs/decisions/0004-backend-auth.md). Issue: #131.

Versions: `better-auth` and `@better-auth/expo` 1.6.33, `@convex-dev/better-auth` 0.12.6, `convex` 1.46.0. They are peer dependencies: the app installs them. Keep them on the same versions as `apps/server`.

## What it does

- **Guest sign-in only, for now.** `signInAsGuest()` calls Better Auth's anonymous plugin. Apple, Google and email magic link come in follow-ups.
- **The player id is the Better Auth user id.** It is the `sub` of the Convex token, which the server reads as `identity.subject` (see "Sign-in" in [`docs/architecture/online-game-service.md`](../../../docs/architecture/online-game-service.md)).
- **Tokens for Convex.** `getToken()` asks the Convex plugin (`/api/auth/convex/token`) for a JWT and keeps it until 30 seconds before it runs out. `forceRefresh` gets a new one. Pass it to the Convex client's `setAuth`.
- **The session cookie lives on the phone.** The Expo plugin keeps it in the `storage` you pass. Use `expo-secure-store`: the cookie signs the user in.
- **A session that ended on the server** (the token call answers 401) signs the user out here too. A network failure on the token gives `null` and keeps the user.
- **Errors** reject with `AuthErrorData`: `REJECTED` when the server answered with an error, `NETWORK` when it could not be reached. A failed sign-out keeps the user signed in.
- **Two sign-ins at once make one guest.**

## Files

| File                   | Job                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/provider.ts`      | `fromBetterAuthClient`: the port on any object with the client methods it uses (`BetterAuthClient`). No vendor imports    |
| `src/client.ts`        | `createBetterAuthClient` and `createBetterAuthProvider`: the real Expo client with the Expo, anonymous and Convex plugins |
| `src/provider.test.ts` | Runs `authProviderContract` (`@tavli/contracts/testing`) on a fake client, plus the adapter's own rules                   |

## How the app will use it

The app wiring is a follow-up (not in #131). It will look like this, in `apps/mobile/src/services.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import { createBetterAuthProvider } from '@tavli/auth-better-auth';

const auth = createBetterAuthProvider({
  baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL, // the `.convex.site` URL
  scheme: 'tavlaki',
  storage: SecureStore,
});
convex.setAuth(({ forceRefreshToken }) => auth.getToken({ forceRefresh: forceRefreshToken }));
```

The app's scheme must be in the server's `trustedOrigins` (`tavlaki://`, in `apps/server/convex/auth.ts`).

## Owner setup (one time, before going live)

1. Set the Better Auth secret on the Convex deployment. It is a secret: never put it in the repo.

   ```bash
   cd apps/server
   npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   ```

2. Set `EXPO_PUBLIC_CONVEX_SITE_URL` for the app (an EAS environment variable). It is public.
