# ADR-0002: Modular monorepo with ports and adapters

- **Status:** Accepted (owner accepts by merging the PR that adds it)
- **Date:** 2026-10-26

## Context

The owner wants every part to be "plug and play". We must be able to swap the backend, auth, push, or analytics vendor without rewriting the app. The game rules must run the same on the phone, on the server, and in the iMessage app.

## Decision

1. **Monorepo** with workspaces. Planned layout:

   ```
   apps/
     mobile/            Expo app (iOS + Android)
     server/            Convex functions: online games, friends, invites (ADR-0004)
   packages/
     engine/            Pure TypeScript rules. No React, no network, no vendor code.
     bot/               Bot players. Depends only on engine.
     ui/                Shared React Native components and design tokens
     themes/            Board/checker/dice skins (assets + manifest)
     contracts/         Interfaces (ports) + shared types, e.g. AuthProvider, GameTransport
     adapters/
       auth-<vendor>/   One package per vendor, implements contracts
       backend-<vendor>/
       push-<vendor>/
       analytics-<vendor>/
   ```

2. **Ports and adapters** (also called "hexagonal architecture"). A *port* is a TypeScript interface in `packages/contracts`. An *adapter* is a package that implements a port for one vendor. The app gets adapters at startup from one file (`apps/mobile/src/services.ts`). No other file imports a vendor SDK.

3. **Variant plug-ins** in the engine. Each game (Portes, Plakoto, Fevga, Asodio) implements one `Variant` interface: start position, legal moves, apply move, winner, score. The UI and bot only talk to the interface.

4. **Lint rule** blocks imports of vendor SDKs outside `packages/adapters/*`.

## Consequences

- Easy to test: the engine and bot run in plain Node tests, fast.
- Easy to swap a vendor: write a new adapter, change one line.
- A bit more setup work at the start.
