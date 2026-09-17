# 0001 — Electron desktop shell with a separate index worker process

Status: Accepted · 2026-09-17

## Context

The product is a desktop companion window that must stay always-on-top during a call, capture
system audio and the microphone, index a local folder, and stream answers. It needs OS
permissions, global shortcuts, a credential store, and a packaged installer on Windows and macOS
([DESIGN.md](../DESIGN.md) §2, §4). CPU-heavy parsing and embedding must never block the UI or
the audio path.

## Decision

- Electron shell, React + TypeScript renderer, TypeScript session orchestrator in the main process.
- Indexing, chunking and embeddings run in a Node **utility process** owned by the main process.
- The renderer never gets filesystem or shell access. All IPC is validated, size-limited and
  scoped to approved operations (§9).
- Audio capture uses Electron's capture APIs where the Phase 0 spike proves them; a native helper
  is added only where a platform requires it (§5).
- Reusing an existing open-source copilot shell (e.g. Glass) is an option to _evaluate_ for
  licence and maintenance cost, not an assumed dependency (§4).

## Consequences

- One codebase for Windows and macOS; platform adapters (audio, credentials, packaging) are the
  only place OS differences are allowed to live.
- Electron's documented platform quirks (dead audio streams returned without error, macOS
  permission prompts) make the packaged capture spike a hard gate before Phase 2.
- Bundle size and memory are higher than a native app; acceptable for a personal tool.
