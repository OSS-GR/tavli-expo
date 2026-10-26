# Tavli

A Greek backgammon (τάβλι) app for iOS and Android, built with Expo and React Native.

Play **Portes**, **Plakoto**, **Fevga**, and **Asodio** against friends online, against a bot, or with a friend on the same phone.

## Status

Planning stage (milestone **M0 Foundation**). See the [roadmap](docs/roadmap.md).

## How to run

You need **Node 22** (see `.nvmrc`) and **pnpm**. The repo pins pnpm 12 in `package.json`. pnpm 9.7 or newer switches to that version by itself.

1. Install everything from the repo root:

   ```bash
   pnpm install
   ```

2. Start the app (Expo dev server):

   ```bash
   pnpm start
   ```

   Press `i` (iOS simulator) or `a` (Android emulator), or scan the QR code. We plan to use development builds; a later issue sets them up.

3. Run the checks from the repo root:

   ```bash
   pnpm lint        # ESLint for the app and all packages
   pnpm typecheck   # tsc in every workspace
   pnpm test        # Vitest in every package
   pnpm format      # Prettier writes fixes (use format:check to only check)
   ```

## Repo layout

```
apps/mobile/         Expo app (Expo Router)
packages/engine/     Pure TypeScript game rules
packages/bot/        Bot players (uses the engine)
packages/contracts/  Interfaces (ports) and shared types
packages/ui/         Shared React Native components and design tokens
```

See [ADR-0002](docs/decisions/0002-modular-architecture.md) for the full plan.

## Docs

All project docs live in [`docs/`](docs/README.md). Start there.
