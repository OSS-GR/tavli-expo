# Maestro flows

End-to-end flows for the app ([Maestro](https://maestro.dev)). They drive
the **development** build (`com.tavlaki.dev`) on a simulator, with the JS
from Metro, because they open dev routes (`tavlaki://dev/race`).

| Flow                     | What it checks                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fast-forward.yaml`      | In a race vs the bot, **Fast forward** shows next to Roll. A tap shows the status and **Stop**, the bot plays both sides, and the game ends with the game-end sheet. The next game has no Fast forward. |
| `fast-forward-stop.yaml` | **Stop** gives the board back: Roll, or Undo and Confirm.                                                                                                                                               |

Each flow starts from a clean install (`clearState`), opens the dev build
on Metro, closes the dev menu tip, answers the first-launch steps
(`subflows/welcome.yaml`, with **Don't allow**) and opens
`tavlaki://dev/race`. Right after the first load a tap can be lost, so the
first welcome step is tapped again until the next one shows. That dev route starts a
vs-bot match and lets the bot play both sides until the game is a race
with you to roll (`features/match/devRace.ts`).

## Run them on the iOS simulator

**One step** (a Mac with Xcode, Java 17 and the repo installed): pass the
dev build from `eas build --platform ios --profile development-simulator`
(its `.tar.gz` or the `.app`). The script boots a simulator, installs the
build, starts Metro, installs Maestro when it is missing, runs both flows
and keeps the logs and screenshots in the out folder:

```bash
apps/mobile/.maestro/run-ios.sh TavlakiDev.tar.gz /tmp/maestro-out
```

**By hand:**

1. Build and install the dev build once: `npx expo run:ios` in `apps/mobile`
   (or `eas build --platform ios --profile development-simulator`).
2. Start Metro: `npx expo start --dev-client` in `apps/mobile`.
3. Install Maestro: `curl -fsSL "https://get.maestro.mobile.dev" | bash`.
4. Run the flows from `apps/mobile`:

```bash
maestro test .maestro/fast-forward.yaml .maestro/fast-forward-stop.yaml
```

Metro on another address: pass it URL-encoded, for example
`maestro test -e METRO_URL=http%3A%2F%2F192.168.1.5%3A8081 .maestro/fast-forward.yaml`.

Screenshots go to the current folder (`takeScreenshot`). Add
`--test-output-dir=maestro-out` to keep them with the logs.
