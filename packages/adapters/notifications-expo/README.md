# @tavli/notifications-expo

The `PushNotifications` port (`@tavli/contracts`) on [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/). The app uses it to ask for the push permission, to get the phone's Expo push token and to hear taps on a turn push. Issue: #285. The server side (who gets a push, the sender) is #280: `apps/server/convex/push.ts` and [`../push-expo/README.md`](../push-expo/README.md).

Version: `expo-notifications` ~58.1.6, a peer dependency (the app installs it).

## What it does

- **Never rejects or throws.** A failed native call (a simulator, Expo Go, no network) gives `denied`, no token (`null`) or no tap.
- **`permission()`** maps the phone's answer. iOS "provisional" and "ephemeral" count as `granted`. An Android "no" that the system lets the app ask once more (`canAskAgain`) counts as `undetermined`.
- **`requestPermission()`** shows the system prompt only while the answer is `undetermined`, and resolves with `granted` or `denied`. A prompt call that throws resolves `undetermined`: the player gave no answer, so the app saves nothing and may ask again later. On Android it first makes the channel `default` (`ANDROID_CHANNEL_ID`, high importance, named by `channelName()` in the app language): Android 13 shows no prompt before the app has a channel.
- **`getToken()`** asks Expo for a token only when the permission is `granted` and the build has an EAS project id. Without one it gives `null`.
- **`onTokenChange(listener)`** tells only a token that differs from the last one this port gave out.
- **`lastTap()`** reads the tap that opened the app and clears it, so a game opens once. **`onTap(listener)`** hears later taps, each on a microtask. Only a tap on the push itself counts (`DEFAULT_ACTION_IDENTIFIER`). The tap's `gameId` comes from the push's `data.gameId` (`gameIdOfPush`).
- **No foreground handler.** The app does not call `setNotificationHandler`, so a push that comes while the app is open is not shown. The open game shows the turn by itself.

## How the app uses it

`apps/mobile/src/services.ts` makes it through `createOnlineServices` (`apps/mobile/src/onlineServices.ts`), on first use, and exports it as `notifications`. It is `undefined` when the build has no Convex URL. The project id comes from `Constants.expoConfig.extra.eas.projectId` (written by `eas init`; not a secret). The app's flow (when to ask, register, sign-out) is in "Turn notifications" in [`docs/architecture/app-shell.md`](../../../docs/architecture/app-shell.md).

In Jest the app uses `createMemoryPushNotifications` from `@tavli/contracts` (`apps/mobile/test/onlineFake.ts`).

## Setup (owner)

1. Run `eas init` in `apps/mobile`, so `app.json` has `extra.eas.projectId`. Then run `pnpm format` (EAS CLI rewrites `app.json`).
2. iOS: let EAS make an APNs key (`eas credentials`, or on the first `eas build`). The `expo-notifications` config plugin in `app.json` adds the `aps-environment` entitlement; Xcode sets it to `production` for store builds.
3. Android: make a Firebase project, add the Android app (`com.tavlaki`, and `com.tavlaki.dev` for dev builds), and upload the FCM v1 service account key to EAS (`eas credentials`). Never commit `google-services.json` keys or the service account file.
4. Android: add a white, see-through notification icon (96×96 px) and set it as `icon` in the plugin options in `app.json`. Until then Android shows a plain square.
5. Turn notifications only work in a development or store build, not in Expo Go.

## Files

| File                | Job                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `src/index.ts`      | `createExpoPushNotifications({ platform, projectId, channelName })`, `toPermission`, `tapOf` |
| `src/index.test.ts` | The `pushNotificationsContract` checks and the mapping, on a mocked `expo-notifications`     |
