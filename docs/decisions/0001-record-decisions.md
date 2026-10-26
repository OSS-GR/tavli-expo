# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

This is a long project with one owner and many AI agents. We need a written record of why we chose each tool, so we can revisit choices later.

## Decision

We write an **Architecture Decision Record (ADR)** for each important choice. An ADR is a short file that says what we chose and why. Files live in `docs/decisions/`, numbered `NNNN-title.md`, copied from `0000-template.md`.

Each ADR links to its GitHub issue (label `decision`). The owner accepts or rejects it in the pull request.

## Consequences

- Any agent or person can read why a choice was made.
- To change a choice, we write a new ADR that supersedes the old one. We do not edit history.
