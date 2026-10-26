# Roadmap

> Living document. Each milestone below is a **GitHub Milestone**. Each line item is a **GitHub issue**. Last review: 2026-10-26.

## Overview

| Milestone | Name | Outcome | Needs backend? |
|-----------|------|---------|----------------|
| **M0** | Foundation | Repo, monorepo, CI, docs, design direction, decisions made | No |
| **MVP1** | Portes Offline | Play Portes vs bot or pass-and-play on one phone. Internal test builds. | No |
| **MVP2** | Play Friends Online | Sign in, add friends, invite by link, play Portes online with push notifications. Closed beta. | Yes |
| **MVP3** | Full Tavli Set | Plakoto, Fevga, Asodio, and the Tavli match (all games in rotation). Bot for each. | Yes |
| **v1.0** | Public Launch | Polish, themes, sounds, Greek + English, store listings, privacy, analytics | Yes |
| **MVP4** | iMessage | Play inside Apple Messages, like GamePigeon | Maybe |
| **Later** | Backlog | Ranked matchmaking, ratings, leaderboards, chat/emotes, hints, web version | Yes |

## Why this order

- **MVP1 needs no backend.** The engine, the board UI, and the bot are the core of the app. Pass-and-play comes almost free once the engine and UI exist. We prove the game feels good before we pay for servers.
- **MVP2 adds the network.** Auth, friends, invites, and live play sit on top of a working engine. The server reuses the same TypeScript engine to check moves.
- **MVP3 adds games.** The engine is built with a variant interface in M0/MVP1, so new games plug in without UI rewrites.
- **v1.0 ships to everyone.** We launch publicly only when all Greek games work.
- **MVP4 (iMessage) is last.** It needs native iOS code and depends on the engine being stable.

## M0 — Foundation

- Project docs hub, vision, roadmap, decision records (this PR)
- GitHub labels, milestones, issue templates, Project board
- Decide backend + auth (ADR), rendering approach (ADR), state management (ADR)
- Monorepo setup: `apps/mobile`, `packages/engine`, `packages/bot`, `packages/ui`, `packages/adapters/*`
- CI: lint, typecheck, unit tests on every pull request
- Owner accounts: Apple Developer, Google Play Console, Expo (EAS)
- Design direction: mood board, art style, first wireframes

## MVP1 — Portes Offline

- Engine: board model, dice, legal move generator, Portes rules, scoring, match to N points
- Engine: full rules test suite from `docs/rules/portes.md` edge cases
- Bot: easy (random legal) and medium (heuristic) levels
- UI: board screen with drag and tap-to-move, dice roll, undo within turn, highlight legal moves
- UI: home screen, new game screen (vs bot / pass-and-play), match end screen
- Art: first board theme (2D), checkers, dice, basic sounds and haptics
- Release: EAS development and preview builds; TestFlight and Play internal track

## MVP2 — Play Friends Online

- Auth adapter + provider (Apple, Google, email, guest)
- Profiles and friends list
- Invites: in-app invite to friend, share link (deep link / universal link)
- Online game service: server-rolled dice, server move check, realtime updates, reconnect
- Turn timers and resign / abandon handling
- Push notifications: "your turn", "invite received"
- Match history

## MVP3 — Full Tavli Set

- Engine variants: Plakoto, Fevga, Asodio (each with its own rules test suite)
- Tavli match mode (Portes → Plakoto → Fevga rotation, scoring)
- Bot support for each variant
- Rules / tutorial screens for each game

## v1.0 — Public Launch

- Bot hard level (trained neural net)
- Themes (skins) system and 2–3 board themes
- Greek + English, accessibility pass
- Analytics, crash reporting, privacy policy, store listings, screenshots

## MVP4 — iMessage

- iMessage extension (see `docs/architecture/imessage.md`)

## Later

- Matchmaking with strangers, Glicko ratings, leaderboards
- Chat and emotes
- Hints and post-game analysis using the bot
- Web version
