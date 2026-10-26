# iMessage version (GamePigeon style)

> Status: research and recommendation for milestone **MVP4**. Last review: 2026-10-26.
> The final choice needs an ADR after the spike in §6.

## 1. Summary

- An iMessage game is a **Messages extension** inside our iOS app. It runs in the Messages app, in its own process.
- Game state travels **inside the message**, in the `MSMessage.url` (max 5,000 characters). Tavli state fits easily (~100–300 characters). **No backend is needed** for casual games.
- One `MSSession` per game keeps **one bubble** in the chat. Each new move replaces the old bubble.
- **Recommendation:** a **native Swift extension** (SwiftUI + SpriteKit or Core Animation board) that runs our **TypeScript engine in JavaScriptCore** (`JSContext`). Reuse the theme images and `theme.json` layout from the main app. Add the target to the Expo project with a config plugin, so EAS still builds everything.
- Before deciding, run a **2–4 day spike** of the React Native route with the community `expo-targets` plugin (`messages` type). If memory and cold start are good on an old iPhone, RN in the extension is a valid choice too.
- **Effort:** about 5–7 weeks for Portes (native + JSContext). Other variants are cheap after that, because the engine is shared.

## 2. How GamePigeon-style games work

### 2.1 The pieces

| Piece | What it does |
|---|---|
| **Messages extension** | A separate target in the iOS app. Its principal class subclasses `MSMessagesAppViewController`. Shows in the Messages app drawer. |
| `MSMessagesAppViewController` | The extension's root view controller. Lifecycle: `willBecomeActive(with:)`, `didSelect(_:conversation:)`, `didReceive(_:conversation:)`, `willTransition(to:)` / `didTransition(to:)`, `didResignActive(with:)`. |
| `MSConversation` | The current chat. Gives `selectedMessage` (the bubble the user tapped), `localParticipantIdentifier`, `remoteParticipantIdentifiers`, and `insert` / `send` methods. |
| `MSMessage` | One message bubble. Has `url` (our data), `layout` (how it looks), `summaryText`, and `senderParticipantIdentifier`. |
| `MSSession` | Groups messages into one "updatable" bubble. A new message with the same session **removes the old bubble** and adds the new one at the bottom. If the old message had `summaryText`, Messages leaves a small text line in its place (for example "Orestis moved"). |
| `MSMessageTemplateLayout` | A static bubble: image, caption, subcaption. We render a small board snapshot as the image. |
| `MSMessageLiveLayout` (iOS 11+) | An interactive bubble. The system runs **a new instance of our view controller for each live bubble** in the chat, in `transcript` style. Needs a template layout as fallback. |

### 2.2 Presentation styles

| Style | Where | Use in Tavli |
|---|---|---|
| `compact` | In the keyboard area | Game picker: "New Portes / Plakoto / Fevga" buttons. |
| `expanded` | Fills most of the screen | The real board. Play your turn here. |
| `transcript` | Inside a bubble (live layout) | Avoid for MVP4. Use a static image bubble. Live bubbles start one controller per bubble, which costs memory. |

### 2.3 The turn flow

1. Player A opens the drawer and taps Tavli. The extension shows in `compact`.
2. A taps "New Portes". The extension creates a new `MSSession`, builds the start state, encodes it in a URL, renders a board image, and calls `conversation.insert(message)`. The bubble goes into the input field. A taps Send.
3. Player B taps the bubble. The extension opens `expanded`. It reads `conversation.selectedMessage.url`, decodes the state, and checks it with the engine.
4. B rolls and moves. B taps "Send move". The extension builds a new `MSMessage(session: selectedMessage.session)` with the new URL, layout and `summaryText`, then calls `insert` (user taps Send) or `send` (sends at once, iOS 11+).
5. The old bubble disappears. The new one is at the bottom. A gets a normal iMessage notification.

Notes from Apple docs:
- `send(_:)` works only in response to a recent user touch while the app is visible. Otherwise it fails (`sendWithoutRecentInteraction`, `sendWhileNotVisible`).
- `MSMessage.url` must use **http, https or data** scheme. Custom app schemes are not allowed. Max **5,000 characters** (`urlExceedsMaxSize` error).
- If the bubble is opened on a Mac where the app is not available, the system loads the URL in a web browser. So the URL should point to a simple web page (for example `https://tavli.app/im?s=...`) that says "Open on iPhone to play" and maybe shows the board.
- Users without iMessage (Android, SMS) see the fallback (image, caption, link). They cannot play.

### 2.4 Who is who

- `localParticipantIdentifier` and `remoteParticipantIdentifiers` are UUIDs **scoped to this device**. They change if the app is reinstalled or the extension is re-enabled. The same person has different UUIDs on different devices.
- So we cannot store "Player B = UUID X" and expect it to match on B's phone.
- Simple rule that works: the bubble's `senderParticipantIdentifier == localParticipantIdentifier` means "I sent this, so it is not my turn". Otherwise it is my turn.
- Seats: the state stores which color moved last. The receiver plays the other color.
- Group chats: the first person who taps and moves takes the free seat (GamePigeon does this). Store a random per-install player token (in the App Group) in the state so a third person cannot move for a seated player. It breaks if a player switches devices mid-game. That is OK for casual play.

## 3. Can it be built with Expo?

### 3.1 Tooling options

| Option | iMessage support | Notes |
|---|---|---|
| **`@bacons/apple-targets`** (Evan Bacon, `expo-apple-targets`) | **No `messages` type** in its supported list (it has `message-filter`, which is a different thing). | Great for widgets, App Clips, share extensions. Needs Expo SDK 53+, Xcode 16. We could still use its generic machinery, but iMessage is not a listed type. |
| **`expo-targets`** (community, `csark0812/expo-targets`) | **Yes.** Has a `messages` type with optional React Native UI, plus `stickers`. | Small project (~100 stars). README says tested on Expo SDK 57. Gives JS APIs: `getPresentationStyle`, `requestPresentationStyle`, `sendMessage`, `createSession`, `sendUpdate`, `getConversationInfo`. Docs list ~120 MB memory for messages extensions (approximate). Over-the-air JS updates for extensions are capped at 5 MiB per bundle. |
| **Expo iMessage stickers plugin** (Expo config-plugins) | Stickers only | Not a game. |
| **Own config plugin** (`withXcodeProject` + copy Swift files) | Yes, we write it | Full control. About 2–4 days of work. Must keep working with each Expo SDK upgrade. |

All options need a **development build** (`npx expo prebuild` / EAS Build). Expo Go cannot load extensions. Debugging the extension needs **a Mac with Xcode** (Xcode's simulator Messages app has two test conversations, so you can play both sides).

### 3.2 React Native inside the extension: limits

- Apple does not publish one clear memory limit for Messages extensions. Community docs say about **120 MB** (`expo-targets` docs; React Native docs list 120 MB for share extensions). iOS can kill an extension earlier under memory pressure.
- RN + Hermes + Skia + board images can use 60–120 MB. Debug builds use more. This is close to the limit on old devices.
- **Cold start:** Messages kills extensions often. Each tap on a bubble may boot React Native again (often 1–2 s on older phones). GamePigeon opens fast. Users notice this.
- **Live (transcript) bubbles** start one view controller per bubble. With RN, each would boot a runtime. Do not use RN for live bubbles.
- JS debugger and Chrome DevTools do not attach to extensions. Use Xcode logs.

### 3.3 Reusing the TypeScript engine

| Way | How | Pros | Cons |
|---|---|---|---|
| **A. RN view in the extension** | `expo-targets` `messages` type. Reuse engine, UI and Skia board as is. | Most code reuse. One UI. | Memory and cold start risk. Young community plugin. |
| **B. Native Swift UI + engine in JavaScriptCore** | Bundle `packages/engine` with esbuild into one IIFE file (`engine.js`, no Node APIs). Load it in a `JSContext`. Call `legalMoves`, `applyMove`, `encodeState`, `decodeState` from Swift. Draw the board in SwiftUI / SpriteKit from the same `theme.json` and images. | Fast start, low memory (JSContext is small). Rules stay identical to app and server. Native feel. | Write the board UI twice (RN and Swift). JSC in apps runs without JIT, but tavli move generation is cheap. Skip the bot here (PvP only). |
| **C. Port the engine to Swift** | Rewrite rules in Swift. Share JSON test fixtures. | Pure native. | Two rule engines can drift. Breaks the "rules in one place" goal of ADR-0002. **Not recommended.** |

Engine design rules that keep A and B possible (add to engine work in MVP1):
- `packages/engine` stays pure: no React, no Node APIs, no `Math.random` (already a hard rule).
- Export a small, JSON-in / JSON-out API (for example `engine.api.ts`), so Swift can call it with strings.
- Add a compact, versioned **state codec** (`encodeState` / `decodeState`) in the engine. The same codec serves iMessage URLs, deep links and save games.

## 4. Backend or state in the URL?

### 4.1 State size

Portes state: 24 points + bar + borne off for 2 colors, whose turn, dice, cube or match score, variant, turn number, version. As binary + base64url this is about 40–80 bytes. Add the last turn's moves (for "show last move" and checks) and seat tokens: about **100–300 characters**. The 5,000-character limit is not a problem.

Example URL: `https://tavli.app/im?v=1&g=portes&s=<base64url state>&m=<last moves>&h=<hash>`

### 4.2 Options

| Option | How | Pros | Cons |
|---|---|---|---|
| **URL only** (recommended for MVP4) | Full state in the URL. Each device validates with the engine. | No servers, no cost, works offline until send. Same as GamePigeon for casual games. | Dice are rolled on the client. No stats sync with the main app. |
| **URL + small dice service** | A serverless function signs dice: `sign(gameId, turn, dice)`. Uses the MVP2 backend. | Hard to cheat on dice. | Needs network. More work. |
| **Full backend** | URL holds only a game id. State lives on our server. | Shared history and ratings with the main app. | Needs sign-in inside the extension. Network on every turn. Much more work. |

### 4.3 Anti-cheat

Main risks with URL-only state:

1. **Re-roll scumming.** A player rolls, dislikes the dice, closes the extension and opens it again to roll again.
   Fix: make dice **deterministic** from a game seed: `dice(turn) = hash(seed, turn)`. Re-opening gives the same dice. The seed is made at game start. Better: both players add a random part (commit-reveal: A sends `hash(secretA)` in the invite, B sends `secretB`, A reveals `secretA` on its first move; seed = `hash(secretA + secretB)`). Then neither player can choose the seed alone.
2. **Illegal moves or edited state.** A modified client could send any URL.
   Fix: the receiver replays the sender's moves with the engine from the previous state and rejects illegal ones. Include a hash chain (`h = hash(prevHash + moves)`) to spot skipped turns.
3. **Knowing future dice.** With a shared seed, a skilled cheater could compute future rolls. This is a small advantage in a casual game. Accept it for MVP4, or use the signed dice service later.

Policy: **iMessage games are casual.** They do not count for ranked ratings. That keeps the cheat risk low and lets us skip the backend.

## 5. Recommendation

1. **MVP4 scope:** Portes first, two players, URL-only state, deterministic dice from a shared seed, static image bubbles (no live layout), `compact` picker + `expanded` board. Then Plakoto and Fevga.
2. **Architecture:** native Swift Messages extension + engine in `JSContext` (option B). Board in SwiftUI or SpriteKit, drawn from the same theme manifest (`theme.json` layout + WebP images). This is why the theme layout must be data (see `docs/design/art-pipeline.md`).
3. **Build:** add the target to the Expo app with a config plugin (try `expo-targets` `messages` type in native-only mode first; fall back to our own small plugin). Share an App Group with the main app (settings, chosen theme, player token).
4. **Spike first (2–4 days):** build a "hello board" with option A (RN in `expo-targets`). Measure on an old iPhone (for example iPhone SE 2nd gen or XR) in a Release build: memory peak, cold start time, crash rate. If memory stays under ~60 MB and cold start under ~1 s, option A is fine and saves the Swift UI work. Write the ADR with the numbers.
5. **Web fallback:** a tiny page at the URL host for Mac and non-iMessage users.

### Effort estimate (one developer + AI agents, Portes only)

| Task | Option B (native + JSC) | Option A (RN) |
|---|---|---|
| Spike and ADR | 2–4 days | 2–4 days |
| Target + config plugin + EAS build working | 3–5 days | 2–3 days |
| Engine bundle for JSC + Swift bridge + tests | 3–5 days | 0 |
| Board UI (drag, highlights, dice, sounds) | 2–3 weeks | 3–5 days (reuse) |
| Session flow, state codec, seats, group chats, seed | 1 week | 1 week |
| Bubble images, icons (iMessage app icon set), store listing, web fallback | 3–5 days | 3–5 days |
| **Total** | **~5–7 weeks** | **~3–4 weeks** (if memory is OK) |

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Owner needs a Mac + Xcode to run and debug the extension | Blocks MVP4 work | Plan a Mac (or a cloud Mac) before MVP4. EAS can build, but not debug. |
| RN extension hits the memory limit on old phones | Crashes in Messages | Spike first. Prefer native UI (option B). Small images. |
| `expo-targets` is a small community project | May lag behind Expo SDKs | Pin versions. Keep our own plugin as fallback. Keep Swift code in our repo. |
| `@bacons/apple-targets` has no `messages` type | Cannot use it as is | Use `expo-targets` or our own plugin. |
| Participant UUIDs are per device | Wrong seat logic if we rely on them | Use `senderParticipantIdentifier` vs local + own player token (§2.4). |
| Dice cheating | Unfair games | Deterministic seeded dice + engine replay checks. Casual only. |
| Engine API drift between app and extension | Bugs | One engine package, versioned state codec (`v=1`), shared JSON test fixtures run in Node and in an XCTest with `JSContext`. |
| Android users in the chat cannot play | Confusion | Clear fallback caption and web page with a link to the full app. |
| App Review | Rejection | Follow Messages app guidelines. Provide the iMessage app icon set and screenshots of the Messages experience. |

## 7. Sources

- Apple, Messages framework: https://developer.apple.com/documentation/messages
- Apple, `MSMessagesAppViewController`: https://developer.apple.com/documentation/messages/msmessagesappviewcontroller
- Apple, `MSSession` (bubble update behavior): https://developer.apple.com/documentation/messages/mssession
- Apple, `MSMessage.url` (5,000 characters, http/https/data only, Mac opens URL in browser): https://developer.apple.com/documentation/messages/msmessage/url
- Apple, `MSMessageLiveLayout` (one controller instance per live bubble): https://developer.apple.com/documentation/messages/msmessagelivelayout
- Apple, `MSMessagesAppPresentationStyle` (compact, expanded, transcript): https://developer.apple.com/documentation/messages/msmessagesapppresentationstyle
- Apple, `MSConversation.send(_:)` (needs recent user interaction): https://developer.apple.com/documentation/messages/msconversation
- Apple, `localParticipantIdentifier` (scoped to device): https://developer.apple.com/documentation/messages/msconversation/localparticipantidentifier
- Apple forums, MSMessage URL length: https://developer.apple.com/forums/thread/60779
- expo-apple-targets (`@bacons/apple-targets`): https://github.com/evanbacon/expo-apple-targets
- expo-targets (community, `messages` type): https://github.com/csark0812/expo-targets
- expo-targets, React Native in extensions (memory, 5 MiB bundle cap): https://github.com/csark0812/expo-targets/blob/main/docs/react-native-extensions.md
- React Native docs, app extensions (memory limits for other types): https://reactnative.dev/docs/app-extensions
- SitePen, React Native in iMessage apps (older, manual Xcode setup): https://www.sitepen.com/blog/react-native-everywhere-imessage-apps-and-input-services
- Lisk, iMessage extension for a React Native app (older): https://medium.com/lisk-blog/we-built-an-imessage-extension-for-our-react-native-based-mobile-app-now-you-can-too-495beb8e6047
- JavaScriptCore in production iOS apps: https://medium.com/@maxheiber/using-javascriptcore-in-a-production-ios-app-f09cfcd91fd6
- Apple, JavaScriptCore: https://developer.apple.com/documentation/javascriptcore

Unverified items: the exact Messages extension memory limit (no official number found), `expo-targets` stability with our Expo SDK, and cold start times. The spike in §5 step 4 must measure these.
