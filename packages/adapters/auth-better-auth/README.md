# @tavli/auth-better-auth

The `AuthProvider` port (`@tavli/contracts`) backed by the [Better Auth](https://www.better-auth.com/) Expo client. The server side is the Better Auth Convex component (`@convex-dev/better-auth`) in `apps/server/convex/auth.ts`. Decision: [ADR-0004](../../../docs/decisions/0004-backend-auth.md). Issue: #131.

Versions: `better-auth` and `@better-auth/expo` 1.6.33, `@convex-dev/better-auth` 0.12.6, `convex` 1.46.0, `expo-secure-store` ~58.0.2. They are peer dependencies: the app installs them. Keep the first four on the same versions as `apps/server`. The app also installs `expo-network`: `@better-auth/expo` loads it to see when the phone goes online, and Metro must find it.

## What it does

- **Guest sign-in only, for now.** `signInAsGuest()` calls Better Auth's anonymous plugin. Apple, Google and email magic link come in follow-ups.
- **The player id is the Better Auth user id.** It is the `sub` of the Convex token, which the server reads as `identity.subject` (see "Sign-in" in [`docs/architecture/online-game-service.md`](../../../docs/architecture/online-game-service.md)).
- **Tokens for Convex.** `getToken()` asks the Convex plugin (`/api/auth/convex/token`) for a JWT and keeps it until 30 seconds before it runs out. `forceRefresh` gets a new one. Pass it to the Convex client's `setAuth`.
- **The session cookie lives on the phone.** The Expo plugin keeps it in the `storage` you pass. The app passes `createSecureSessionStorage()`: `expo-secure-store` (iOS Keychain, Android Keystore), because the cookie signs the user in. A value the phone cannot read (for example after a backup was restored on a new phone) reads as `null`, so the user is signed out and the app still starts.
- **A session that ended on the server** (the token call answers 401) signs the user out here too. A network failure on the token gives `null` and keeps the user.
- **Errors** reject with `AuthErrorData`: `REJECTED` when the server answered with an error, `NETWORK` when it could not be reached. A failed sign-out keeps the user signed in.
- **Two sign-ins at once make one guest.**

## Files

| File                      | Job                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/provider.ts`         | `fromBetterAuthClient`: the port on any object with the client methods it uses (`BetterAuthClient`). No vendor imports    |
| `src/client.ts`           | `createBetterAuthClient` and `createBetterAuthProvider`: the real Expo client with the Expo, anonymous and Convex plugins |
| `src/secureStore.ts`      | `createSecureSessionStorage`: `expo-secure-store` as the cookie store. The only file that imports it                      |
| `src/provider.test.ts`    | Runs `authProviderContract` (`@tavli/contracts/testing`) on a fake client, plus the adapter's own rules                   |
| `src/secureStore.test.ts` | The cookie store on a mocked `expo-secure-store`                                                                          |

## How the app uses it

`apps/mobile/src/services.ts` makes it (#266), through `createOnlineServices` (`apps/mobile/src/onlineServices.ts`):

```ts
createBetterAuthProvider({
  baseURL: server.siteUrl, // the `.convex.site` URL, from `convexServer()`
  scheme: APP_SCHEME, // 'tavlaki'
  storage: createSecureSessionStorage(),
});
```

- `services.ts` exports it as `auth`. It is `undefined` when the build has no Convex URL (online play is off).
- It is made on the first call to `auth`, not at app start. Nothing makes a guest until a screen calls `auth.signInAsGuest()`, when the user first opens online play.
- The Convex client gets its token from it: `createConvexClient(url, auth)` in `@tavli/backend-convex`.
- The site URL comes from `app.config.ts` (`extra.convexSiteUrl`, per app variant; see "Which server the app uses" in `docs/process/running-the-app.md`). `EXPO_PUBLIC_CONVEX_SITE_URL` overrides it.
- The app's scheme must be in the server's `trustedOrigins` (`tavlaki://`, in `apps/server/convex/auth.ts`). `apps/mobile/src/convexUrl.test.ts` checks it.
- The app does not list the `expo-secure-store` config plugin. It would add a Face ID text we do not need, and its Android backup rules would back up only shared preferences, so the MMKV files (settings, saved games) would leave the backup. Without the plugin, Android may back up the secure store, but a restored value cannot be read on a new phone: it reads as `null` (see above).

## Owner setup (one time, before going live)

1. Set the Better Auth secret on the Convex deployment. It is a secret: never put it in the repo.

   ```bash
   cd apps/server
   npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   ```

2. Nothing to set for the app: `app.config.ts` makes the site URL from the Convex URL. Set `EXPO_PUBLIC_CONVEX_SITE_URL` (public, an EAS environment variable) only if the site moves, for example to a custom domain.
