# 0006 — Provider keys live only in the OS credential store

Status: Accepted · 2026-09-17

## Context

Users supply their own Deepgram/OpenAI keys. Keys must never reach the renderer, logs, exported
diagnostics or a file in the repository or app-data directory ([DESIGN.md](../DESIGN.md) §4, §10,
AC-12).

## Decision

- Keys are written to and read from the OS credential store only: Windows Credential Manager on
  Windows, Keychain on macOS. The app persists a _credential reference_ (provider + lookup key),
  never the secret.
- Only the main process touches the store; the renderer can ask "is a key configured?" and
  "test connectivity", never "give me the key".
- No `.env` files carry keys. `.env.example` documents non-secret configuration only.

## Consequences

- Implementation choice (Electron `safeStorage` plus a file, or a keytar-style binding) is made
  during Phase 4 hardening; it must have Windows and macOS support.
- Removing the app must offer a path to delete stored credentials.
