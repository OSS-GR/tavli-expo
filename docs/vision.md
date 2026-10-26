# Product Vision

> Living document. Update it when a goal changes. Last review: 2026-10-26.

## One line

**Tavli** is a Greek backgammon app for iOS and Android. You play your friends online, a bot when no one is free, or a friend on the same phone.

## Name (decided 2026-10-26)

| Item | Value | Notes |
|------|-------|-------|
| App name (home screen) | **Tavlaki** | "Little tavli", a friendly Greek word |
| Store name (English) | **Tavlaki: Kafeneio Backgammon** | 28 of 30 characters allowed |
| Store name (Greek) | **Ταβλάκι: Τάβλι του Καφενείου** | 28 of 30 |
| iOS subtitle / Play short text | "Greek Tavli with friends" or "Portes, Plakoto, Fevga, Asodio" | Both fit the 30-character limit |
| Bundle ID / Android package | **`app.tavlaki`** | **Never changes** after the first store upload |
| Expo slug / URL scheme | `tavlaki` | Deep links: `tavlaki://` |
| Domain | `tavlaki.app` | Invite links (universal links). Owner buys it (#59). |

The owner's first idea was "Tavlaki: Greek Kafeneio Backgammon" (34 characters). The App Store and Google Play allow only 30, so "Greek" moves into the subtitle.

## Why we build it

- **Ownership:** We want our own version, built the right way, that we fully control.
- **Learning:** The owner learns mobile apps, game design, 3D art, and backend work by doing.
- **Quality:** Many tavli apps exist. Ours must feel smooth, look good, and respect the Greek rules exactly.

## Goals

| # | Goal | How we know it is done |
|---|------|------------------------|
| G1 | Play all four Greek games: **Portes**, **Plakoto**, **Fevga**, **Asodio** | Each game passes its rules test suite (see `docs/rules/`) |
| G2 | Invite a friend in-game and play online | Two real phones finish a match through an invite link |
| G3 | Play a bot when no one is online | Bot plays legal moves offline, with easy/medium/hard levels |
| G4 | Pass-and-play on one phone | Two people finish a match on one device with no network |
| G5 | Works on iOS and Android | Builds ship to TestFlight and Google Play internal testing |
| G6 | Low running cost | Under **$25/month** until we pass ~1,000 monthly users |
| G7 | Modular, plug-and-play code | Each service sits behind an interface; we can swap it in one package |
| G8 (later) | iMessage version, like GamePigeon | Two iPhones play a match inside Messages |

## Non-goals (for now)

- **Real-money play** or gambling features.
- **Web version** (possible later; Expo makes it cheap to add).
- **Doubling cube** in Portes (Greek play does not use it; we may add it as an option later).

## Users

- **The friend group:** Greeks and friends of Greeks who already play tavli at the kafeneio. They want fast games with people they know.
- **The solo player:** Wants a quick game against a bot on the metro.
- **The learner:** Knows Portes, wants to learn Plakoto and Fevga. Needs clear rules and hints.

## Principles

1. **Rules first.** The game engine is a pure TypeScript package with full tests. The UI, bot, and server all use the same engine.
2. **Server decides online games.** The server rolls the dice and checks every move. Clients cannot cheat.
3. **Plug and play.** Every outside service (auth, backend, push, analytics) is wrapped in an adapter that matches an interface. Code never imports a vendor SDK outside its adapter.
4. **Cheap and portable.** Prefer open standards (Postgres, JWT, plain TypeScript) over closed ones so we can move later.
5. **Small steps.** Each GitHub issue is small enough for one pull request.
