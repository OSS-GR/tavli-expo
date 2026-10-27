# Tavli — Project Docs

> This folder is the **live documentation** for the project. Every pull request that changes behavior or a decision also updates the matching doc. Last review: 2026-10-27.

## Start here

| Doc | What it holds |
|-----|---------------|
| [Vision](vision.md) | Why we build it, goals, non-goals, principles |
| [Roadmap](roadmap.md) | Milestones M0 → MVP1 → MVP2 → MVP3 → v1.0 → MVP4 |
| [Open questions](open-questions.md) | Things the owner must answer or decide |
| [How we work on GitHub](process/github-workflow.md) | Labels, issue types, board, Definition of Done |
| [Running the app](process/running-the-app.md) | Simulator, iPhone (free Apple ID), Android emulator, EAS builds, dev routes, common errors |

## Legal

| Doc | What it holds |
|-----|---------------|
| [Privacy policy (English)](legal/privacy.md) | What data the app uses, published at `tavlaki.com/privacy` |
| [Privacy policy (Greek)](legal/privacy.el.md) | Πολιτική απορρήτου, published at `tavlaki.com/el/privacy` |
| [How to publish the legal pages](legal/README.md) | Static HTML pages, how to host them, owner checklist |

## Store

| Doc | What it holds |
|-----|---------------|
| [Store listing (English)](store/listing.en.md) | App name, subtitle, keywords, descriptions, "What's new", with character counts |
| [Store listing (Greek)](store/listing.el.md) | The same texts in Greek |
| [App Store privacy labels](store/app-privacy.md) | App Privacy answers, what leaves the phone, points to check |
| [Google Play data safety](store/play-data-safety.md) | Data safety form and other App content forms |
| [Age rating](store/age-rating.md) | App Store age rating, IARC content rating, Play target audience |
| [Screenshots plan](store/screenshots.md) | Six shots, sizes, how to take them on the simulator and emulator |

## Game rules (the engine spec)

| Game | File |
|------|------|
| Portes (Πόρτες) | [rules/portes.md](rules/portes.md) |
| Plakoto (Πλακωτό) | [rules/plakoto.md](rules/plakoto.md) |
| Fevga (Φεύγα) | [rules/fevga.md](rules/fevga.md) |
| Asodio (Ασόδυο) | [rules/asodio.md](rules/asodio.md) |
| Tavli match format and shared rules | [rules/tavli-match.md](rules/tavli-match.md) |

## Architecture

| Doc | Topic |
|-----|-------|
| [Expo / React Native best practices](architecture/expo-best-practices.md) | Stack, tooling, releases |
| [Backend, multiplayer, auth options](architecture/backend-options.md) | Vendors, costs, recommended design |
| [Online game service](architecture/online-game-service.md) | Convex server (`apps/server`): data model, move flow, dice, offline tests and codegen, open points |
| [Bot AI](architecture/bot-ai.md) | Bot levels, training, on-device play |
| [Board screen](architecture/board-screen.md) | How the app draws the board (Skia), board flip, tests and screenshots |
| [App shell](architecture/app-shell.md) | Home, new game, local matches, the bot turn, in-game menu |
| [iMessage version](architecture/imessage.md) | How a GamePigeon-style version works |
| [Analytics events](architecture/analytics-events.md) | Usage events, consent rules (GDPR), PostHog EU setup |

## Design

| Doc | Topic |
|-----|-------|
| [Art pipeline](design/art-pipeline.md) | Rendering choice, Blender, textures, themes, learning path |
| [Board style concepts](design/style/README.md) | Two wooden concepts, palettes, mood board |
| [Themes package](../packages/themes/README.md) | How a board theme is built (manifest, layouts, assets) and how to add one |
| [Wireframes](design/wireframes.md) | MVP1 screens, user flow, portrait board layout |
| [Game screen layout proposals](design/game-layout-proposals.md) | Portrait A and B, landscape, today's layout, for the owner to pick (#184, #185) |
| [Dice throw spike](design/dice-throw-spike.md) | Swipe to throw the dice onto the board: prototype, cost, risks, recommendation (#183) |
| [App icon and splash](design/app-icon.md) | Three icon concepts, the pick, files and rebuild |

## Decisions (ADRs)

| # | Decision | Status |
|---|----------|--------|
| [0001](decisions/0001-record-decisions.md) | Record decisions as ADRs | Accepted |
| [0002](decisions/0002-modular-architecture.md) | Modular monorepo with ports and adapters | Accepted |
| [0003](decisions/0003-app-stack.md) | Expo SDK 58 app stack and tooling | Accepted |
| [0004](decisions/0004-backend-auth.md) | Convex backend, Better Auth, Expo Push | Accepted |
| [0005](decisions/0005-rendering.md) | 2D Skia board, themes as data, Blender art later | Accepted |
| [0006](decisions/0006-bot.md) | Own TypeScript bot, TD self-play for hard level | Accepted |

New ADRs: copy [0000-template.md](decisions/0000-template.md).
