# @tavli/apple-sign-in-expo

The `AppleSheet` port (`@tavli/contracts`) and Apple's own button on
[expo-apple-authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/) (#401).

- Only this package may import `expo-apple-authentication` (lint vendor list).
- The sheet asks for the email only. Better Auth needs an email to make the account; the player may pick Apple's "Hide My Email". We never ask for the name.
- A closed sheet (`ERR_REQUEST_CANCELED`) is `null`. Apple's "unknown" error (`ERR_REQUEST_UNKNOWN`) rejects with `appleSheetUnfinished()` (#442): iOS gives it when the phone has no Apple ID. Other errors reject as they are.
- iPhone only for now. On Android `isAvailable()` is false.
- The app config turns on the Sign in with Apple entitlement (`ios.usesAppleSignIn` in `apps/mobile/app.json`). A new native build is needed after that change.
- Tests: `index.test.ts` fakes the Expo module. The app's Jest uses the in-memory sheet (`createMemoryAppleSheet`).
